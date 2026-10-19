import asyncio
import hashlib
import json

import pytest
from _router_auth_helpers import make_authed_test_app
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.gateway import artifact_preview
from app.gateway.routers import artifacts


@pytest.fixture
def preview_files(tmp_path, monkeypatch):
    source = tmp_path / "deck.pptx"
    pdf = tmp_path / "deck.pptx.preview.pdf"
    manifest = tmp_path / "deck.pptx.preview.json"
    source.write_bytes(b"presentation")
    pdf.write_bytes(b"%PDF-1.7\npreview")
    manifest.write_text(
        json.dumps(
            {
                "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "pdf_sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
            }
        )
    )
    monkeypatch.setattr(artifact_preview, "resolve_thread_virtual_path", lambda thread, path, user_id=None: tmp_path / path.split("/")[-1])
    return source, pdf, manifest


def test_reuses_verified_pdf_and_revalidates_cache(preview_files):
    app = make_authed_test_app()
    app.include_router(artifacts.router)
    url = "/api/threads/thread-1/artifacts/mnt/user-data/outputs/deck.pptx?preview=true"
    with TestClient(app) as client:
        response = client.get(url)
        assert response.status_code == 200
        assert response.content == preview_files[1].read_bytes()
        assert response.headers["content-type"] == "application/pdf"
        assert response.headers["cache-control"] == "private, no-cache"
        etag = response.headers["etag"]
        assert client.get(url, headers={"If-None-Match": etag}).status_code == 304
        preview_files[0].write_bytes(b"changed deck")
        assert client.get(url, headers={"If-None-Match": etag}).status_code == 409


@pytest.mark.parametrize("index", [0, 1, 2])
def test_missing_preview_inputs(preview_files, index):
    preview_files[index].unlink()
    with pytest.raises(HTTPException) as error:
        artifact_preview.read_document_preview("thread", "mnt/user-data/outputs/deck.pptx")
    assert error.value.status_code == 404


def test_pdf_replacement_rejected(preview_files):
    preview_files[1].write_bytes(b"%PDF-replaced")
    with pytest.raises(HTTPException) as error:
        artifact_preview.read_document_preview("thread", "mnt/user-data/outputs/deck.pptx")
    assert error.value.status_code == 409


def test_manifest_size_is_bounded(preview_files):
    preview_files[2].write_bytes(b" " * 8192)
    with pytest.raises(HTTPException) as error:
        artifact_preview.read_document_preview("thread", "mnt/user-data/outputs/deck.pptx")
    assert error.value.status_code == 413


def test_preview_rejects_symlinks(preview_files, tmp_path):
    pdf = preview_files[1]
    pdf.unlink()
    target = tmp_path / "secret.pdf"
    target.write_bytes(b"secret")
    pdf.symlink_to(target)
    with pytest.raises(HTTPException) as error:
        artifact_preview.read_document_preview("thread", "mnt/user-data/outputs/deck.pptx")
    assert error.value.status_code == 403


def test_preview_checks_owner_before_reading(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail("file IO before ownership check")

    monkeypatch.setattr(artifacts, "read_document_preview", forbidden)
    app = make_authed_test_app(owner_check_passes=False)
    app.include_router(artifacts.router)
    with TestClient(app) as client:
        assert client.get("/api/threads/other/artifacts/mnt/user-data/outputs/deck.pptx?preview=true").status_code == 404


def test_all_paths_use_owner_scoped_resolver(preview_files, monkeypatch):
    seen = []

    def resolve(thread, path, user_id=None):
        seen.append((thread, path, user_id))
        return preview_files[0].parent / path.split("/")[-1]

    monkeypatch.setattr(artifact_preview, "resolve_thread_virtual_path", resolve)
    artifact_preview.read_document_preview("thread", "mnt/user-data/outputs/deck.pptx", "owner")
    assert len(seen) == 3
    assert all(thread == "thread" and owner == "owner" for thread, _, owner in seen)


def test_path_traversal_is_rejected(monkeypatch):
    def resolve(*args, **kwargs):
        raise HTTPException(403, "Path traversal")

    monkeypatch.setattr(artifact_preview, "resolve_thread_virtual_path", resolve)
    with pytest.raises(HTTPException) as error:
        artifact_preview.read_document_preview("thread", "mnt/user-data/outputs/../../deck.pptx")
    assert error.value.status_code == 403


@pytest.mark.parametrize("suffix", ["", ".preview.pdf", ".preview.json"])
def test_real_resolver_blocks_cross_thread_symlink(tmp_path, monkeypatch, suffix):
    from app.gateway import path_utils
    from deerflow.config.paths import Paths

    paths = Paths(tmp_path)
    base = paths.sandbox_user_data_dir("thread", user_id="owner")
    base.mkdir(parents=True)
    secret = tmp_path / "other-thread-file"
    secret.write_bytes(b"private")
    (base / ("deck.pptx" + suffix)).symlink_to(secret)
    monkeypatch.setattr(path_utils, "get_paths", lambda: paths)
    with pytest.raises(HTTPException) as error:
        artifact_preview.read_document_preview("thread", "mnt/user-data/deck.pptx", "owner")
    assert error.value.status_code == 403


def test_real_resolver_blocks_traversal(tmp_path, monkeypatch):
    from app.gateway import path_utils
    from deerflow.config.paths import Paths

    monkeypatch.setattr(path_utils, "get_paths", lambda: Paths(tmp_path))
    with pytest.raises(HTTPException) as error:
        artifact_preview.read_document_preview("thread", "mnt/user-data/../../deck.pptx", "owner")
    assert error.value.status_code == 403


def test_preview_rejects_parent_symlink_after_resolution(tmp_path):
    directory = tmp_path / "dir"
    directory.mkdir()
    (directory / "file").write_bytes(b"secret")
    alias = tmp_path / "alias"
    alias.symlink_to(directory, target_is_directory=True)
    with pytest.raises(HTTPException) as error:
        artifact_preview._read_bounded(alias / "file", 1024, float("inf"))
    assert error.value.status_code == 403


def test_preview_timeout(preview_files, monkeypatch):
    monkeypatch.setattr(artifact_preview, "PREVIEW_TIMEOUT_SECONDS", -1)
    with pytest.raises(HTTPException) as error:
        artifact_preview.read_document_preview("thread", "mnt/user-data/outputs/deck.pptx")
    assert error.value.status_code == 504


def test_route_timeout(monkeypatch):
    async def slow(*args, **kwargs):
        await asyncio.sleep(1)

    monkeypatch.setattr(artifacts, "PREVIEW_TIMEOUT_SECONDS", 0.001)
    monkeypatch.setattr(artifacts.asyncio, "to_thread", slow)
    app = make_authed_test_app()
    app.include_router(artifacts.router)
    with TestClient(app) as client:
        assert client.get("/api/threads/thread/artifacts/mnt/user-data/outputs/deck.pptx?preview=true").status_code == 504

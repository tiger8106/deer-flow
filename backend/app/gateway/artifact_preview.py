"""Read verified, locally rendered document previews without running Office code.

Producers publish <source>.preview.pdf and then atomically publish
<source>.preview.json with source_sha256/pdf_sha256. The sidecars are the
render cache; they are never trusted as paths or served without source checks.
"""

import hashlib
import json
import os
import stat
import time
from pathlib import Path

from fastapi import HTTPException

from app.gateway.path_utils import resolve_thread_virtual_path

PREVIEW_TIMEOUT_SECONDS = 15
MAX_DOCUMENT_BYTES = 100 * 1024 * 1024
MAX_PREVIEW_BYTES = 50 * 1024 * 1024
DOCUMENT_EXTENSIONS = {".ppt", ".pptx", ".odp", ".doc", ".docx", ".odt", ".xls", ".xlsx", ".ods"}


def _read_bounded(path: Path, limit: int, deadline: float, *, retain: bool = True) -> tuple[bytes, str]:
    chunks = []
    digest = hashlib.sha256()
    total = 0
    # Reject special files and final-component symlinks, including replacement
    # between the resolver's containment check and open. Never block on a FIFO.
    directory_fd = None
    try:
        directory_fd = os.open(path.anchor, os.O_RDONLY | os.O_DIRECTORY)
        for part in path.parts[1:-1]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory_fd)
            os.close(directory_fd)
            directory_fd = next_fd
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
    except FileNotFoundError:
        raise HTTPException(404, "Document preview is not available") from None
    except OSError:
        raise HTTPException(403, "Document preview path is not accessible") from None
    finally:
        if directory_fd is not None:
            os.close(directory_fd)
    with os.fdopen(fd, "rb") as stream:
        file_stat = os.fstat(stream.fileno())
        if not stat.S_ISREG(file_stat.st_mode):
            raise HTTPException(400, "Document preview requires regular files")
        if file_stat.st_size > limit:
            raise HTTPException(413, "Document preview is too large")
        while True:
            if time.monotonic() > deadline:
                raise HTTPException(504, "Document preview timed out")
            chunk = stream.read(min(1024 * 1024, limit + 1 - total))
            if not chunk:
                break
            total += len(chunk)
            if total > limit:
                raise HTTPException(413, "Document preview is too large")
            digest.update(chunk)
            if retain:
                chunks.append(chunk)
    return b"".join(chunks), digest.hexdigest()


def read_document_preview(thread_id: str, path: str, user_id: str | None = None) -> tuple[bytes, str]:
    if Path(path).suffix.lower() not in DOCUMENT_EXTENSIONS:
        raise HTTPException(415, "Document preview is not supported for this file type")
    deadline = time.monotonic() + PREVIEW_TIMEOUT_SECONDS
    # Resolve every sidecar through the same thread/user boundary as downloads.
    source, pdf, manifest = (resolve_thread_virtual_path(thread_id, candidate, user_id=user_id) for candidate in (path, path + ".preview.pdf", path + ".preview.json"))
    raw_manifest, _ = _read_bounded(manifest, 4096, deadline)
    try:
        metadata = json.loads(raw_manifest)
        if not isinstance(metadata, dict):
            raise ValueError
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(409, "Document preview metadata is invalid") from None
    _, source_hash = _read_bounded(source, MAX_DOCUMENT_BYTES, deadline, retain=False)
    content, pdf_hash = _read_bounded(pdf, MAX_PREVIEW_BYTES, deadline)
    if metadata.get("source_sha256") != source_hash or metadata.get("pdf_sha256") != pdf_hash:
        raise HTTPException(409, "Document preview is outdated")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(409, "Document preview is not a PDF")
    return content, f'"{source_hash}-{pdf_hash}"'

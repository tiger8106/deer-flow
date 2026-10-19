# Local document previews

The artifact endpoint accepts `?preview=true` for PPT/PPTX/ODP,
DOC/DOCX/ODT and XLS/XLSX/ODS files. It returns a locally rendered PDF;
it never uploads documents to a third-party viewer or launches Office in
the Gateway. Ordinary downloads remain available with `?download=true`.

A producer reuses its existing render by publishing two siblings beside
the original document (the full original filename, including extension,
is retained):

```text
deck.pptx
deck.pptx.preview.pdf
deck.pptx.preview.json
```

The JSON object contains the hexadecimal SHA-256 of the exact original
document and the PDF bytes:

```json
{"source_sha256": "...", "pdf_sha256": "..."}
```

Publish the PDF first, then atomically replace the JSON manifest. A stale
or partially published render cannot pass fingerprint validation. Do not
include preview sidecars in the user-facing delivered file list.

Every request, including an ETag revalidation, checks thread ownership and
resolves all three paths in the effective owner's thread. The manifest
does not supply paths. File reads reject special files and symlink races,
enforce 100 MiB original / 50 MiB PDF / 4 KiB manifest limits, and run off
the event loop with a 15-second deadline. The rendered sidecar is the
persistent cache; the HTTP response uses `private, no-cache` and an ETag
bound to both fingerprints. No separate Gateway disk cache is created.

Missing renders return 404, changed or invalid renders 409, excessive size
413, unsupported extensions 415, and timeouts 504. The frontend shows a
retry action and retains the original file's download action. It cancels
requests on selection changes/unmount, times out after 20 seconds and
revokes temporary PDF blob URLs. External citation previews and artifacts
share one pane: the latest explicit selection wins and closing it does
not restore an older document.

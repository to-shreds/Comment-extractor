# Comment Master Handoff

## Current state

Comment Master v7.1.0 is merged to `main` at commit `f747f388c3efa3316b6668476c4c8d7ae9702c84`. The release simplifies the interface without removing the existing document-processing capabilities.

## Controlling sources

- Canonical repository: `to-shreds/Comment-extractor`
- Canonical branch: `main`
- Release version: `7.1.0`
- Generated runtime manifest build ID: `695e2bfbba651b1bb53b04ff`
- GitHub Pages publishes the committed repository root.

## What changed in v7.1.0

- Home is now file-first, with one primary drop/open surface.
- A single DOCX opens directly in Word; a single PDF opens directly in PDF.
- Multiple files remain on Home long enough to offer contextual next steps.
- Persistent Word and PDF destinations were removed from the top-level navigation.
- The compact More menu exposes Home, Compare & Combine, More Tools, and contextual links back to any loaded Word or PDF document.
- Word keeps Overview, Review, Quick Edits, and Export visible; specialist views remain behind More.
- PDF keeps View & Search, Pages, OCR, Redact, and Export visible; Clean & Inspect and Forms remain behind More.
- Binder, Convert, Batch, Inspect, and Clean Word remain under More Tools.
- The existing comparison, clean-copy, OCR, redaction, PDF, conversion, binder, batch, inspection, and Word-processing engines were preserved.

## Verification

Full release QA passed in GitHub Actions run `36254041258`:

- production build passed;
- legacy regression tests passed;
- unit tests passed;
- privacy/offline tests passed;
- all 19 Playwright Chromium browser tests passed;
- `npm run build:pages` regenerated and verified the committed GitHub Pages runtime;
- generated runtime assets, service worker, and asset manifest were synchronized before merge.

The merged `main` branch was re-read after merge and contains the v7.1.0 shell plus the v7.1.0 asset manifest. Direct HTTP access to the public GitHub Pages URL was not available from the current execution environment, so the deployment endpoint itself was not independently fetched here.

## Do not break

- Keep all document contents browser-local. Do not introduce cloud document processing, analytics, telemetry, or document storage.
- Preserve existing processing capabilities when simplifying presentation.
- Keep the source/runtime build relationship intact: source files are authoritative, and `npm run build:pages` synchronizes the committed Pages runtime.
- Run the full `npm run qa` release contract before treating a substantive code change as ready.
- Preserve the file-first default and progressive disclosure. Do not rebuild a persistent application taxonomy across the top navigation without a specific UX reason.
- Keep a return path to any already-loaded document when users enter More Tools.

## Next action

The release is ready for normal use. The next substantive change should come from real-use feedback on the simplified workflow rather than further speculative restructuring.

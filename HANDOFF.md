# Comment Master Handoff

## Current state

Comment Master v7.1.1 is the stress-tested patch for the existing file-first interface. The canonical implementation and synchronized GitHub Pages runtime are in this repository on `main`.

## Controlling sources

- Repository: `to-shreds/Comment-extractor`, branch `main`.
- Release: `7.1.1`; manifest build ID: `5d8251752eae0ee36cb45d76`.
- Read `TEST_REPORT.md`, `CHANGELOG.md`, and source/tests for verification details.
- Previous known-good release: `archive/v7.1.0-before-stress-test`, at `516a4ee00a009bc622250f98aa1d32088c5e4905`.
- Readiness and next steps: `to-shreds/ProjectStatus/projects/comment-master/STATUS.md`.

## Completed work

- Preserved Home's single primary file picker and progressive disclosure; shortened instructions, removed duplicate header controls, and fixed narrow-screen header overflow and More dismissal. PDF Export controls appear before the preview on phones.
- Protected active Word/PDF working copies across malformed inputs, overlapping opens, cancellation, returning to the same File, and Clear Local Workspace. Clearing also removes document previews and result content.
- Fixed PDF Open another and cancelled Save state, cumulative queue limits, invalid binder drag data, stale PDF search/thumbnail work, and colliding ZIP outputs.
- Preserved Word comparison paragraph order and repeated insertions. Unsupported new structural containers fail closed rather than losing table structure.
- Made the staged current Word Clean Copy use its in-memory edits.
- Improved PDF annotation and image-resource metadata removal, external action-chain detection, and internal link destination mapping after sanitization.
- Corrected OCR coverage for long identifiers and placement on cropped/rotated pages.

## Verification

Full `npm run qa` passed on the release source: both legacy regression scripts, 46 unit tests, 4 privacy tests, and all 49 Chromium specifications. The browser suite completed in 55.4 seconds without retries. Coverage includes actual exported-package inspection, 80 deterministic Word edit scenarios, a 2,000-paragraph comparison, a 240-page PDF transform/cancellation check, malformed inputs, Save/file-picker cancellation, pending-load cleanup, offline use, and 320 px PDF Export. `npm run build:pages` regenerated and verified the complete root runtime.

## Do not break

- Documents must remain browser-local. Do not add uploads, analytics, telemetry, or persistent document archives.
- Keep Home file-first and keep specialist tools behind More.
- Same-File identity, load tokens, and candidate validation protect current work; filename equality is not document identity.
- Preserve all insertion occurrences and order; refuse unsupported structures instead of flattening them.
- PDF internal destinations must refer to actual output page refs after rebuilding.
- Treat source files as authoritative and synchronize the root with `npm run build:pages`.
- Run the complete `npm run qa` release contract before publication.
- Restore the entire entry/assets/manifest/service-worker runtime together when rolling back.

## Remaining limits and next action

No material implementation or QA work remains for this stress-test patch. Native Word rendering and every PDF producer are outside the automated compatibility coverage. Existing English-only OCR, semantic Office conversion, standard PDF-font character limits, rasterized secure redaction, and sanitization flattening/rebuild limits remain documented in README and TEST_REPORT. Use the release normally; the next changes should come from specific real-use failures or friction.

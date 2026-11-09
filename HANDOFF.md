# Comment Master Handoff

## Current state

Comment Master v7.3.0's linear Word workspace has passed full GitHub Actions QA and the exact Pages build. The canonical source is `to-shreds/Comment-extractor` on `main`, and v7.3.0 is published on GitHub Pages. The previous release, v7.2.2, remains available at `e33d85bc8c8f778347c760a84ffecd4990d6b31e`.

The release introduces a left-anchored sidebar, collapsible editing sections with meaningful per-document status, and two bottom actions: download the updated Word document, or export a configurable comments/redlines summary. The new summary defaults to both review types and every column selected, with the source-document appendix off. All changes use the same browser-local working document.

## Source and verification

- Release branch: `ux/linear-workspace-v7.3.0`.
- Release runtime version: `7.3.0`, build ID `df44ef3b1ebc6acf5d1c35d3`.
- Full QA run: https://github.com/to-shreds/Comment-extractor/actions/runs/42697959511
- Both legacy regression suites passed, 57 unit tests passed, 5 privacy tests passed, and all 61 Chromium browser tests passed without retries.
- `npm run build:pages` succeeded; the root manifest and generated assets were synchronized. The new linear-workspace and review-summary source assets match their runtime copies.
- The two release-only PDF regressions were resolved: the malformed-PDF test now enters the PDF workspace before attempting the drop, and the 320px mobile app header stays within the viewport. The edited PDF route continued passing all functional tests.
- The earlier Word-only local verification inspected source-package preservation in the appended summary output and checked all 13 targeted local scenarios. See `TEST_REPORT.md`.

## Do not break

- All documents are browser-local; do not add uploads, analytics, telemetry, or persistent document archives.
- Do not force downloads between editing steps. Actions operate on one in-memory working copy.
- Maintain the visible sidebar and collapsible sections without clutter, and clearly distinguish completed edits from merely viewing a section.
- The two final downloads must use the current working copy and not change the source.
- When including a source-document appendix, retain original DOCX body XML and package parts. Refuse signatures or structurally incompatible first-section documents rather than silently flattening content.
- Preserve advanced Word/PDF features, comparison, combine, clean copy, batch, conversion, and offline support.
- Keep version-specific app asset URLs and matching service-worker rules to prevent the prior stale JavaScript upload-button bug.
- Every release requires `npm run qa`, `npm run build:pages`, and a successful GitHub Pages deployment. Verify the real upload button, summary dialog defaults, PDF mobile viewport, and offline loading.

## Next action

The verified release was merged as commit `249d06a83b1f5da92746e6a2b4ed8cba71416007`. GitHub Pages deployment run https://github.com/to-shreds/Comment-extractor/actions/runs/42698554614 completed successfully. The next action is real-user validation of the simplified interface; no release-blocking work remains. Existing browser-only document and PDF structural limitations remain documented in README.

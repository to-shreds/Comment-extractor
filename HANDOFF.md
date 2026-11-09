# Comment Master Handoff

## Current state

Comment Master v7.2.0 is the verified Word-first guided-home release. The canonical source and synchronized GitHub Pages runtime are in this repository. The release changes the interface, not the underlying document engines.

- Repository: `to-shreds/Comment-extractor`, release target `main`.
- Public site: https://to-shreds.github.io/Comment-extractor/
- Release version: `7.2.0`.
- Verified manifest build ID: `03bd9d629d45b389891684cf`.
- Release PR: https://github.com/to-shreds/Comment-extractor/pull/2
- Prior known-good main release: `78e51ce50f4982fed6fd37282d94f8fbfbebaccc` (v7.1.1).
- Readiness: `to-shreds/ProjectStatus/projects/comment-master/STATUS.md`.

## Completed work

- Replaced general-purpose Home with two steps: choose a single Word `.docx` file, then choose a plainly named task.
- Added prominent `Export comments`, `Change reviewer names`, `Review comments and tracked changes`, `Make a clean copy`, and `Compare or combine documents` choices.
- Exports a comments report directly without requiring the user to navigate the editor, using the existing validated Word report writer.
- Guides reviewer renaming with an existing-reviewer selector, replacement-name field, and a single download action. Applies attribution changes to matching comments and tracked changes via the existing Word batch editor and verified DOCX export.
- Keeps PDF, multi-file, binder, batch, conversion, and specialist tools under an expandable section or the More navigation.
- Preserves the original file and existing unsaved-document protections. Does not introduce uploads, telemetry, new document persistence, or external processing.
- Added responsive layout, keyboard focus placement, meaningful form labels, clear error and success feedback, and 3 focused browser tests. Updated obsolete tests that referenced the previous Home controls.

## Verification

Release branch `ux/word-first-home-2026-11-09` passed the complete `npm run qa` contract in GitHub Actions run https://github.com/to-shreds/Comment-extractor/actions/runs/42648229515:

- Both legacy Word export and comparison regression suites passed.
- 46 unit tests passed.
- 4 privacy and offline tests passed.
- All 52 Chromium browser tests passed with zero retries, including direct comments report download, edited Word round trip with comment and redline attribution verified inside the DOCX ZIP, input validation, mobile layout, PDF flows, comparison, and offline use.
- `npm run build:pages` rebuilt the static runtime, synchronized the root runtime assets, and verified hashes.
- Root `asset-manifest.json` reports version 7.2.0 and build ID `03bd9d629d45b389891684cf`.

## Do not break

- Keep all document processing local to the browser and never archive document content.
- Keep one Word file upload and the immediate, understandable task selection as the default experience.
- Do not force Export comments or Change reviewer names through the full editor.
- Keep detailed Word, comparison, PDF, multi-file, and specialist tools available without crowding Home.
- Protect original documents, unsaved edits, per-file identity, and validated output; never silently overwrite a user's file.
- Use source files in `index.html` and `src/` as authoritative. Rebuild and synchronize the committed runtime using `npm run build:pages`, then run complete `npm run qa` before publication.
- Restore the entrypoint, assets, manifest, and service worker together during rollback.

## Remaining limits and next action

No unresolved code or test failures were reported in release QA. The existing limits in README remain: English OCR, semantic Office conversion, PDF forms and fonts, browser rendering differences, and protective fail-closed handling of unsupported Word structures. Monitor actual first-time user interactions with the new task chooser for wording or discoverability issues, without reintroducing complexity. The release-only GitHub Actions workflow targets its feature branch and need not be used for unrelated future work.

# Comment Master Handoff

## Current state

Comment Master v7.2.1 fixes the first-click Word upload regression introduced in v7.2.0. The Word-first two-step interface and document processing engines remain unchanged. This is a verified hotfix intended for the `main` branch and GitHub Pages.

- Implementation: `to-shreds/Comment-extractor`, branch `main` after release.
- Site: https://to-shreds.github.io/Comment-extractor/
- Release: v7.2.1; manifest build ID `7f6136ffa20fadffbbac4dfb`.
- Hotfix PR: https://github.com/to-shreds/Comment-extractor/pull/3
- Source and release history: `README.md`, `CHANGELOG.md`.
- Readiness: `to-shreds/ProjectStatus/projects/comment-master/STATUS.md`.
- Previous main commit: `1492f38c91b05aa1c8e8928b2eb65da874b307f8` (v7.2.0).

## Root cause and fix

The v7.2.0 HTML introduced a `Choose Word document` action but still loaded `assets/workbench.js` from the same URL used by v7.1.1. A browser controlled by an older cache-first service worker could receive the new HTML and old JavaScript simultaneously. The old JavaScript did not recognize the new action, so the button did nothing. The existing browser tests set files directly on the input and therefore missed this specific failure.

- `index.html` now loads the application CSS and JS using `?v=7.2.1` URLs.
- `src/workbench.js` imports the core with `?v=7.2.1` and bypasses the optional `showOpenFilePicker` path for this primary upload, selecting through the standard hidden file input instead.
- The updated `src/service-worker.js` maps its own versioned requests to the exact precached core asset URL; an older active worker that does not recognize these URLs passes them through to the network. The new worker continues to support offline use without forced activation.
- The Word upload, task chooser, direct comment report, guided reviewer rename, and all previous advanced capabilities stay intact. No remote document upload, telemetry, or persistent document archive was added.

## Verification

Release QA completed successfully in GitHub Actions https://github.com/to-shreds/Comment-extractor/actions/runs/42669675696:

- Both legacy Word export/comparison regression suites passed.
- All 46 unit tests passed.
- All 5 privacy/offline tests passed, including the versioned-cache regression.
- All 53 Chromium browser tests passed, including a test that **clicks the visible Word upload button**, receives the file chooser, selects a Word DOCX, and verifies the simple task menu. Existing reviewer-name editing, comments report downloads, PDF workflows, comparison, and offline use remain covered.
- `npm run build:pages` generated and synchronized the root Pages runtime with version `7.2.1` and build ID `7f6136ffa20fadffbbac4dfb`. The runtime was verified in GitHub source after the successful build.

## Do not break

- Keep documents browser-local and do not introduce document uploads, analytics, or persistent storage.
- Keep the Home page one-file-first and understandable to a nontechnical user.
- The two primary actions must work without navigating the full editor.
- Preserve the original file and existing Word/PDF functionality, comparison, and advanced tools.
- Keep CSS, JS, and imported core asset URLs version-specific on every future release. Update the worker mapping and release tests accordingly.
- Do not revert to the optional native file-picker API for the primary upload without a tested reason.
- Test the **visible upload button**, not only direct file-input assignment, and run `npm run qa` plus `npm run build:pages` before publishing.
- Keep a rollback route to v7.2.0 and the earlier v7.1.1 commit `78e51ce50f4982fed6fd37282d94f8fbfbebaccc`.

## Remaining work

No known code or QA defects remain in v7.2.1. Browser behavior should still be validated in real usage, especially for people who have the older worker installed. The remaining platform limitations are documented in README. Next action after verified Pages deployment is user confirmation that the button works in their Chrome session.

# Comment Master Handoff

## Current state

**READY.** Comment Master v7.3.2 is published at https://to-shreds.github.io/Comment-extractor/. The canonical source is `to-shreds/Comment-extractor` on `main`. This release makes the Word comments/redlines editor a proper sortable table by default, retains optional List view, and removes the redundant Home introduction.

- Release pull request: https://github.com/to-shreds/Comment-extractor/pull/7
- Published code merge: `d87ec5d4440bf4b9622d29335b4c31bcc4cea833`.
- Runtime version: `7.3.2`; build ID `45ae1f6a10691ccfc91ada24`.
- Full QA: https://github.com/to-shreds/Comment-extractor/actions/runs/42834630112, success.
- GitHub Pages: https://github.com/to-shreds/Comment-extractor/actions/runs/42835355603, success.
- Previous known-good release: v7.3.1, `adc6f0f7bac3e1201badea44ccc313e711a346f2`.

## What changed

- Removed "Work on your document.", its explanatory sentence, and the redundant "Processed on this device" callout. Kept the `Local processing` control in the application header.
- The comment/redline review opens in a real editable, sortable table, with visible column headers for page, change type, reviewed language/comment, reviewer name, and date/time. Existing filters, selection, paging, and bulk tools still use the same Word editing engine.
- Added accessible `Table view` and `List view` controls. The list preserves card-style editing, with tighter spacing and aligned checkbox, tracked-change badge and change label. Switching views does not reset edits.
- The table scrolls inside the review panel on narrow screens rather than expanding the whole page.
- Reduced top padding after removing the introduction. Kept the paper/petrol/copper editorial visual theme and bundled local fonts.
- Updated versioned CSS/JS and offline runtime to 7.3.2 to avoid the earlier stale-cache nonresponsive-upload bug.
- All other Word, PDF, inspection, comparison, appendix, batch and two-download workflows remain intact.

## Verification

The full GitHub Actions release gate passed with both legacy Word regression suites, 57 Node unit tests, 5 privacy/offline tests, and **all 66 Chromium browser tests**, including 3 new tests for no redundant headings, sortable default table/list toggling with preserved inline edits, compact list spacing, and mobile horizontal scrolling. Existing Word/PDF/summary/offline regressions passed.

`npm run build:pages` completed and synchronized the committed GitHub Pages runtime; the root manifest reports v7.3.2 and build ID `45ae1f6a10691ccfc91ada24`. GitHub Pages deployment for merge commit `d87ec5d4440bf4b9622d29335b4c31bcc4cea833` completed successfully.

## Do not break

- Keep all documents in the browser. Do not introduce uploads, telemetry or persistent document storage.
- Keep the nine collapsible Word sections, left workflow sidebar with applied/viewed status, Undo, and both final downloads.
- Keep the same in-memory editing engine when switching Table/List view; never overwrite the original file or force downloads between changes.
- Export reports from current edited document state. Preserve source OOXML parts when adding a document appendix and fail closed on unsupported structures.
- Preserve all PDF functionality, specialist tools, privacy and offline support.
- Keep every release's app asset URLs versioned and verify the service-worker cache allowlist.
- Run `npm run fonts:install`, `npm run qa`, and `npm run build:pages` for future releases. QA must exercise the visible file picker, sorting, inline edit persistence, mobile overflow, and Word/PDF/offline operations.

## Next action

The requested changes are ready. Gather practical feedback while using the new table. Existing Office/PDF structure, conversion, appendix pagination, and English-only OCR limitations remain documented in `README.md`.

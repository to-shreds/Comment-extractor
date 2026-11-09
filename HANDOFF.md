# Comment Master Handoff

## Current state

**READY.** Comment Master v7.3.1 is published at https://to-shreds.github.io/Comment-extractor/. The canonical source is `to-shreds/Comment-extractor` on `main`. The editorial visual redesign is complete and verified, building on the v7.3.0 linear Word workflow rather than replacing it.

- Release code merge: `295482e531a2c013135a66421de26174698f33ef` (PR https://github.com/to-shreds/Comment-extractor/pull/6).
- Runtime version: `7.3.1`, manifest build ID `373d00a00a7d9ffb85226dd4`.
- Full QA: https://github.com/to-shreds/Comment-extractor/actions/runs/42703810452, success.
- Pages publication: https://github.com/to-shreds/Comment-extractor/actions/runs/42704301246, success.
- Previous working release: v7.3.0, main commit `0311ecce52aac3729a78b2e6a1f8ab8a12a16a35`, preserved in Git history.

## What changed

- Replaced generic blue gradients, pill-heavy badges, rounded dashboard cards, and shadows with a warm paper / charcoal / petrol / copper editorial system.
- Applied Source Serif 4 to primary headings, IBM Plex Sans to controls and body text, and IBM Plex Mono to metadata and technical labels.
- Created an understated annotation-inspired brand mark and consistent appearance for Word, PDF, comparison, batch tools, dialogs, review rows, tables, and mobile layouts.
- Updated a few vague UI labels, retaining familiar green insertions and red deletions.
- Bundled six checksum-verified OFL-licensed fonts under `assets/fonts`. The runtime never loads fonts from remote services. The font files are explicit core service-worker assets, available offline.
- Preserved nine collapsible Word sections, the left workflow sidebar, its accurate edit/undo status, and the two final Word/report downloads.

## Verification

- Both legacy regression suites passed; 57 unit tests, 5 privacy/offline tests, and all 63 Chromium tests passed.
- Browser tests include typography/font loading, no third-party font requests, 320/390/768/1280px overflow checks, PDF on mobile, Word upload/edit/undo, original-package preservation, document comparison, report options, and offline behavior.
- `npm run build:pages` generated and synchronized the exact Pages assets and manifest. Manifest and six bundled font files were independently checked on `main`.
- GitHub Pages completed the release deployment successfully.

## Do not break

- Process documents entirely inside the browser. No uploads, telemetry, remote document handling, or persistent document storage.
- Preserve the current working Word document across multiple edits and downloads. Never overwrite an uploaded source or force a download between tasks.
- Keep the linear sidebar and collapsible sections; distinguish applying edits from viewing sections, and restore status on Undo.
- Both final downloads use current working data. For the optional source-document appendix, preserve package contents, and refuse unsupported signed/complex-section inputs rather than flattening them.
- Retain all PDF and specialist tools, redline color semantics, keyboard focus, responsive layouts, and offline support.
- Maintain versioned CSS/JS import URLs, the service-worker core allowlist, and the six bundled fonts. Run `npm run fonts:install`, `npm run qa`, and `npm run build:pages` for future releases.

## Next action

The redesign is ready to use. Collect practical feedback about readability and efficiency from real document work; no known release blockers remain. Existing Word/PDF structural limits remain documented in `README.md`.

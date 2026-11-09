# Comment Master Handoff

## Current state

The v7.3.0 linear-workspace redesign is implemented and built locally, with the checks documented in TEST_REPORT. It is **not published**. GitHub tools in the implementing session exposed read actions only; repository writes, publication, and remote ProjectStatus persistence were unavailable. The live site and remote main remain v7.2.2.

- Canonical implementation repository: `to-shreds/Comment-extractor`.
- Base main: `e33d85bc8c8f778347c760a84ffecd4990d6b31e`.
- Proposed branch name: `ux/linear-workspace-v7.3.0` (not created remotely).
- Local build version: `7.3.0`; runtime build ID `763d385a9b0563918e441964`.
- Deliverable: changes-only release bundle and a Git patch against the verified base, including source, generated runtime files, tests, screenshots, verification evidence, and a prepared ProjectStatus update.

## Implemented

- One linear Word workspace with nine collapsible sections and a left tool/status sidebar. Manual edits retain the original engine with a simpler card presentation.
- Real per-document section activity, viewed/opened indicators, undo-aware status, current/outdated-download indicators, and reset on a replacement file.
- Two bottom final actions: updated Word document; configurable comment/redline summary. Both review types and all eight columns are selected by default; source-document appendix is unchecked.
- Summary is generated from the same current working copy as its optional appendix. Source XML and all other package parts are preserved; signatures and special initial section breaks fail closed.
- Existing advanced Word tools, PDF tools, conversion, batch, clean copy, and spreadsheet/clipboard export remain available.
- Fixed zero-second date normalization causing phantom pending edits. Kept native file-input behavior and versioned assets that fixed the prior broken upload.

## Verified

Both legacy scripts; 41 local Node checks (25 existing Word/core, 11 new summary, 5 privacy); 13 local Word browser scenarios; generated DOCX package comparison; visual render inspection; pixel equality of the two test source pages after summary insertion; source/runtime build and hash verification. See TEST_REPORT for exact environments and limits. Full production module/PDF/offline browser regression remains unrun, not passed.

## Do not break

- Never upload documents or add telemetry/persistent document archives.
- Maintain one current Word working copy across all sections and exports. Applying edits must not force downloads.
- Keep all controls easy to find through the sidebar; opening a section must not falsely mark it completed.
- Export current data, not the original upload or stale rendered rows. Preserve source-file identity and unsaved edits.
- Keep the two final main actions at the bottom, with the specified summary checkbox defaults.
- Retain the existing expert editing, PDF, and other engines rather than replacing them with partial implementations.
- Keep release-specific asset URLs and matching service-worker allowlists. Rebuild runtime from source, do not hand-edit generated copies.
- Do not claim arbitrary original-document pagination is unchanged when summary pages are added.

## Next action

Apply the prepared patch to a checkout of the known base on the proposed branch. Run the full locked-dependency `npm run qa`, fix any actual failures without hiding regressions, run `npm run build:pages`, publish, and verify the live application. Update HANDOFF and the remote ProjectStatus as the final step. The work is preserved; do not restart the design or regenerate a new unrelated version.

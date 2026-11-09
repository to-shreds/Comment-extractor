# Comment Master Handoff

## Current state

Comment Master v7.2.1 hotfix addresses a broken first-click Word upload in the 7.2.0 release. The v7.2.0 interface used unversioned asset paths, so an older cache-first service worker could serve outdated JavaScript that did not recognize the new upload action.

- Canonical source: `to-shreds/Comment-extractor`, `main`.
- Release target: `7.2.1`, replacing `7.2.0`.
- Public site: https://to-shreds.github.io/Comment-extractor/
- Readiness: `to-shreds/ProjectStatus/projects/comment-master/STATUS.md`.
- Previous UI release: v7.2.0, commit `1492f38c91b05aa1c8e8928b2eb65da874b307f8`.
- Prior known-good v7.1.1: `78e51ce50f4982fed6fd37282d94f8fbfbebaccc`.

## Hotfix details and do-not-break

- Keep the two-step Word-first Home and the same export/rename actions. No new navigation or data processing systems.
- The HTML references `assets/workbench.css?v=7.2.1` and `assets/workbench.js?v=7.2.1`; the JS imports `workbench-core.mjs?v=7.2.1`. An older worker only intercepts exact, unversioned URLs so these fetch the correct new code immediately.
- The current worker recognizes its own version-tagged URLs, maps them to the exact cached base files and preserves offline operation. No skipWaiting, document uploading, persistence, analytics, or telemetry.
- Primary Word selection uses the standard file input and bypasses the optional native File System Access picker. This keeps the existing cancellation and file-selection validation logic.
- New browser coverage clicks the actual button and exercises the file chooser. It simulates stale asset interception by rejecting unversioned application assets.
- Preserve all earlier v7.2.0 home actions, advanced Word/PDF toolsets, and original-file/unsaved-edits protections.

## Completed work


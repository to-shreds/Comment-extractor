# Linear workspace implementation

`src/linear-workspace.mjs` manages the collapsible UI, sidebar, existing panel placement, and summary options. `src/linear-workspace.css` supplies the responsive layout and simpler review cards. `src/review-summary.mjs` is a browser-local DOCX report writer. The inline Word engine in `index.html` exposes a small workflow API for atomic edits, activity/download state, undo, current metadata, and source-consistent exports.

The old Home UI remains hidden/inert for compatibility with existing workbench handlers. Existing Word view nodes are moved into the relevant sections rather than cloned, preserving their edit/filter/selection event handlers. They return to the expert workspace when the route changes. Imported files are parsed successfully before a new working document replaces the current one.

The summary writer uses direct formatting for its table, separate original/redlined/comment columns, and landscape layout for larger column selections. The optional source appendix starts from the exact edited source ZIP and inserts summary XML at the start of its main body. It does not copy/recreate the source body, remap its relationships, or flatten revisions. All non-main parts retain their bytes. A check verifies that stripping the prefix restores the original main XML. Digital signatures and incompatible first-section semantics are rejected with a visible, recoverable message.

Runtime dependencies are unchanged. The three new assets are included in the build and offline core allowlist, with version-specific module/CSS URLs. The input-file chooser remains the standard browser file input.

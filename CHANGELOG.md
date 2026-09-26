# Changelog

## 7.1.0 - 2026-09-26

- Reworked the shell around a file-first workflow: opening one DOCX or PDF now goes directly to its workspace.
- Replaced the persistent Home / Word / PDF / Compare / Tools navigation with a compact More menu containing Home, Compare & Combine, and More Tools.
- Reduced the Home screen to one primary drop/open surface plus Compare / Combine and More Tools shortcuts.
- Simplified visible Word tabs to Overview, Review, Quick Edits, and Export, with specialist views preserved behind More.
- Simplified visible PDF tabs to View & Search, Pages, OCR, Redact, and Export, with Clean & Inspect and Forms preserved behind More.
- Added a PDF export action to the header and removed the duplicate persistent Compare button.
- Preserved all existing processing engines and specialist workflows.

All notable user-facing and developer-facing changes are recorded here.

## 7.0.1 - 2026-09-01

Comment Master 7.0.1 fixes scanned-page rendering during OCR and simplifies GitHub Pages publishing.

### Fixed

- Added the pinned PDF.js WebAssembly decoders required for JPEG 2000 and JBIG2 page images, preventing affected scanned PDFs from appearing blank in the viewer and OCR canvas.
- Added the matching PDF.js character maps, standard fonts, and color profile so supported PDFs do not depend on missing or third-party runtime resources.
- Configured every PDF.js load path to use those same-origin support directories.
- Added a synthetic JPEG 2000 scanned-PDF fixture and a packaged-decoder regression that renders it and verifies the expected visible color and text pixels. The existing browser OCR regression continues to verify searchable PDF output.
- Expanded the Playwright OCR scenario to open that JPEG 2000 scan, verify its visible pixels before OCR, recognize and search its text, and verify that the source image remains visible afterward.

### Changed

- Changed GitHub Pages publishing from a custom Actions deployment to direct branch publishing from `main` and `/ (root)`.
- Added committed root `assets/`, `vendor/`, `service-worker.js`, and `asset-manifest.json` runtime files plus `.nojekyll`.
- Added `npm run build:pages` and `tools/sync-pages.mjs` to build deterministically, synchronize only the intended runtime files to the repository root, and verify canonical root files.
- Removed the custom `.github/workflows/pages.yml` build and deployment workflow. GitHub's built-in Pages publication job may still appear after a push because it publishes the configured branch.
- Removed obsolete root-level vendor bundles and archived application entry files from the current branch because direct root publishing would expose them unnecessarily. They remain available through Git history.
- Updated deployment, architecture, test, and third-party documentation for the committed static runtime and PDF.js decoder licenses.

## 7.0.0 - 2026-09-01

Comment Master 7.0.0 expands the established Word review application into a browser-local document workbench while retaining the existing DOCX workflow.

### Added

#### Product shell and home experience

- Added a true Home route with file drop, multi-file selection, supported-format guidance, and context-sensitive task suggestions.
- Added global Home, Word, PDF, Compare & Combine, and Tools navigation.
- Added responsive workspaces with progressive disclosure instead of a single large tool panel.
- Added a persistent Local processing indicator with a concise privacy explanation.
- Added Clear Local Workspace and Clear cached optional engines controls.
- Added modern Open and Save support through the File System Access API where available, with file-input and download fallbacks.
- Centralized workbench result filenames using the existing `d.m.yy` naming convention.

#### Word and comparison

- Preserved the full existing Word overview, review editing, comments, tracked changes, Quick Edits, links, metadata, Ghost Writer, Forensics, regular-expression replacement, undo, and export workflow.
- Added prepared-file handoff from Home into Compare Documents and Combine Commentary so selected files are not discarded.
- Added comparison result previews for inline redline, original, revised, and side-by-side text.
- Added paragraph-formatting comparison with tracked `w:pPrChange` output.
- Added fail-closed handling for changed or inserted structurally complex paragraphs so comparison never substitutes a flattened whole-paragraph revision for an unsafe fine-grained edit.
- Added consolidation of identical paragraph-formatting proposals under combined reviewer attribution and paragraph-aligned preview rows.
- Added protection against treating a missing reviewed story part as deletion of the base story.
- Expanded tracked-change acceptance for table-cell revisions and move and custom-XML range markers.
- Added a combined-commentary preview that keeps reviewer, author, date, source, context, reply relationship, and change attribution visible.
- Added guided Clean Word Copy with a preflight summary and selectable review, metadata, hidden-text, relationship, and embedded-content cleanup.

#### PDF workspace

- Added same-origin PDF.js rendering with page thumbnails, fit modes, text layer, search, current-page status, and keyboard navigation.
- Added scanned-PDF detection and contextual Make searchable guidance.
- Added page reorder, rotate, duplicate, delete, reverse, undo, extract, split, page numbering, header, footer, and watermark operations on a working copy.
- Added safety blocks for page duplication, deletion, extraction, splitting, and normalization when forms, XFA, signatures, or outlines would otherwise be silently lost.
- Added merge and image-to-PDF support.
- Added page-by-page English OCR with progress, cancellation, auto-orientation, positioned invisible text, and a searchable PDF result.
- Added secure redaction by drawn box, selected text, text search, or regular-expression search.
- Added permanent redaction through full-document rasterization into a fresh PDF, followed by local string verification where a search term is known. Every page is rebuilt so shared hidden resources from the source cannot survive in the result.
- Added PDF cleanup presets and selective removal of metadata, comments and annotations, attachments, JavaScript and actions, external links, and stored form values. Every mode creates a fresh page-only document and flattens forms, with collateral loss disclosed in the interface.
- Added PDF health reporting for searchable coverage, likely scans, encryption indicators, page sizes, metadata, active or embedded content, forms, signature indicators, image indicators, font indicators, and review content.
- Added standard AcroForm inspection, WinAnsi-compatible Latin fill values, reset, and flatten operations.
- Added PDF normalization and a lossless optimize rewrite with before and after size reporting.

#### Binder, conversion, batch, and inspection

- Added mixed-file Binder with source reordering, PDF page ranges, item-level error isolation, optional divider pages, source labels, continuous numbering, table of contents, and bookmarks.
- Added local conversion to PDF, plain text, clean HTML, Markdown, basic DOCX, and PDF page images where supported.
- Added semantic extraction for DOCX, XLSX, PPTX, ODT, RTF, PDF, CSV, Markdown, HTML, and text.
- Added HTML sanitization with scripts, active elements, and remote-resource markup removed before display or conversion.
- Added sequential Batch Tools for inspection, conversion to PDF, metadata removal, page numbering, watermarking, and lossless PDF optimization.
- Added individual result saving and ZIP packaging for multi-result conversion and batch jobs.
- Added a cross-format Document Health Check and expanded DOCX inspection for counts, review content, hidden runs, media, notes, custom properties, embedded content, macros, external relationships, and metadata.

#### Offline, build, and release engineering

- Added a multi-asset static production build in `dist/` while preserving `index.html` as the entry point.
- Added pinned local runtime assets for PDF.js, pdf-lib, Tesseract.js, English OCR data, Mammoth.js, Marked, and DOMPurify.
- Added a build manifest with a content-derived build ID, file sizes, and SHA-256 hashes.
- Added a versioned service worker that precaches exact core assets and caches only exact optional engine assets after use.
- Added an explicit optional-engine cache clearing path.
- Added deterministic synthetic PDF fixtures and 29 focused v7 unit regressions, plus 4 dedicated privacy regressions.
- Added 19 Playwright specifications for desktop and mobile Home, route navigation, file suggestions, DOCX and PDF opening, navigable DOCX comparison output, OCR, secure redaction, sanitation, binder, conversion, batch inspection, Clean Word, external-request interception, hostile HTML, exact cache allowlists, and offline shell reload.
- Added a GitHub Actions workflow that installs the lockfile, runs QA, verifies a deterministic static artifact, and deploys `dist/` to GitHub Pages from `main`.
- Added full third-party notices and deployed upstream license files.

### Changed

- Bumped the product and package version from 6.3.0 to 7.0.0.
- Replaced automatic external-link probing with a local-only link inventory. Document-derived URLs are no longer contacted.
- Updated PDF and tool operations to use cancellable progress UI and page or file level yielding for long tasks.
- Changed ordinary PDF edits to work on an in-memory copy and warn before leaving with unsaved PDF changes.
- Changed result saving to use File System Access handles where supported and safe browser downloads elsewhere.
- Changed the Pages artifact from the repository root to a deterministic, allowlisted `dist/` directory.

### Security and privacy

- Added a restrictive Content Security Policy that blocks third-party origins, forms, embedded objects, and base URL changes.
- Disabled PDF JavaScript evaluation, XFA rendering, streaming, and automatic remote fetching in PDF.js loading paths.
- Prevented imported DOCX conversion from using external file access.
- Added same-origin-only service-worker caching with exact asset allowlists and no arbitrary runtime cache.
- Added limits for file size, aggregate selection size, file count, PDF page count, decoded pixels, ZIP entries, package paths, per-entry and aggregate expanded package size, comparison size, and Word undo memory.
- Added CRC and required-part checks for DOCX input plus generated-package integrity validation for edited, comparison, and Clean Word outputs.
- Added XML parser rejection for DTD and entity declarations.
- Added explicit cleanup of object URLs and OCR workers through Clear Local Workspace.

### Browser-only limitations

- OCR data is English only in this release.
- Office and PDF-to-DOCX conversion prioritize text and readable structure rather than exact desktop Office layout.
- Normalize PDF is a parse-and-rewrite operation for readable files, not a general qpdf-equivalent repair engine.
- Lossless optimize can produce an equal-size or larger result. It does not promise compression.
- Secure redaction rasterizes every page. The result loses the original searchable text layer and source catalog structures, so OCR must be run afterward if searchable text is required.
- Every sanitation mode creates a fresh page-only PDF and flattens forms. Original outlines, tags, page labels, attachments, signatures, and other catalog structures are not preserved.
- Standard PDF form filling is limited to WinAnsi-compatible Latin values.
- Page-subset products and normalization fail closed when forms, XFA, signatures, or outlines would be discarded.
- Signature support is detection and field inspection only. Certificate trust, revocation, signer identity, and signing are not implemented.
- Password entry and encrypted PDF editing are not implemented.
- XFA form editing is not implemented.

## Earlier releases

The repository contains the detailed [v6.3.0 report](REPORT_v6.3.0.md) and archived application entry points for selected earlier versions. Version 7 documentation starts this consolidated changelog.

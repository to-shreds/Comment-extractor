# Comment Master

Comment Master v7.0.1 is a private, browser-local document workbench for Word review, PDF work, document comparison, conversion, binders, cleanup, inspection, and batch processing.

The application is a static site. It does not require an installer, a local server, a browser extension, a cloud document-processing service, or a third-party account. Documents are processed in the browser and are not uploaded by Comment Master.

## Workspaces

The global navigation keeps the application focused while making the larger toolset discoverable:

- **Home** accepts one or many files and suggests an appropriate next task.
- **Word** preserves the established Overview-first DOCX review and editing workflow.
- **PDF** provides a viewer plus page, OCR, redaction, cleanup, form, and export tools.
- **Compare & Combine** handles DOCX comparison, formatted-text comparison, and multi-reviewer commentary consolidation.
- **Tools** contains Binder, Convert, Batch, Inspect, and Clean Word workflows.

The original file is never overwritten automatically. Results are saved as new files with readable names such as `Benefit Plan (Edit 1.9.26).docx`.

## Current capabilities

### Word review and comparison

- Inspect comments, tracked changes, replies, authors, dates, relationships, metadata, package parts, and review activity.
- Edit review attribution, dates, text, links, metadata, and supported OOXML content with undo and explicit export.
- Apply Quick Edits, filters, selections, regular-expression replacement, Ghost Writer, Forensics, and existing advanced tools.
- Compare two DOCX files with word-level changes for ordinary paragraphs and tracked paragraph-format changes.
- Preview a comparison as an inline redline, original, revised, or synchronized side-by-side view, move between changes, then save the redlined DOCX.
- Compare formatted text pasted into two rich-text inputs and export the result as a DOCX redline.
- Combine reviewed copies against one base document while preserving reviewer attribution, importing and deduplicating comments, and keeping overlapping alternatives separately attributed.
- Create a clean DOCX copy by accepting revisions and selectively removing comments, review attribution, personal metadata, hidden runs, custom properties, external relationships, or embedded and active content.

The comparison engine preserves unchanged package parts and uses minimal token changes for ordinary paragraphs. If a changed or inserted paragraph contains structure that cannot be revised safely at token level, comparison fails closed with a clear error instead of flattening or replacing that paragraph wholesale.

### PDF workspace

- Render pages with thumbnails, page navigation, fit-page and fit-width zoom, selectable text, search, keyboard page navigation, scanned-document detection, and local decoder support for common scan encodings including JPEG 2000 and JBIG2.
- Reorder pages by drag and drop, rotate, duplicate, delete, reverse, undo pending page changes, extract ranges, and split every page. Page-subset products are blocked when forms, XFA, signatures, or outlines would be silently discarded.
- Add page numbers, headers, footers, and text watermarks.
- Merge PDFs and create PDFs from PNG, JPEG, WebP, or GIF images.
- Run English OCR on the current page, a range, or the whole document, with progress, cancellation, optional auto-orientation, and an invisible searchable text layer.
- Mark secure redactions by drawing boxes, selecting text, plain-text search, or regular-expression search.
- Apply redactions by rasterizing every page into a fresh PDF, then run local extracted-text and raw-string checks for marked terms. Rebuilding the entire document prevents shared hidden resources from carrying removed content forward.
- Inspect file size, page count and dimensions, searchable coverage, likely scans, metadata, forms, annotations, external-link indicators, attachments, JavaScript and automatic-action indicators, signatures, image and font indicators, and inconsistent page sizes.
- Sanitize selected metadata, annotations, attachments, JavaScript and actions, external links, and stored form values. Every sanitization mode creates a fresh page-only PDF and flattens forms, with the resulting loss of interactive and catalog-level structures disclosed before export.
- Fill, reset, or flatten standard AcroForm fields using standard WinAnsi-compatible Latin values. XFA and signature fields are inspection-only.
- Normalize a parsable PDF by copying its pages into a fresh document and perform a lossless rewrite that reports the actual resulting size.

### Binder, conversion, and batch tools

- Build a PDF binder from supported mixed files, reorder source cards, select PDF page ranges, continue past item-level errors, and optionally add divider pages, source labels, continuous page numbers, a table of contents, and source bookmarks.
- Convert supported files to PDF, plain text, clean HTML, Markdown, basic DOCX, or PDF page images where the selected input and output are compatible.
- Convert DOCX through a semantic HTML and text path, and extract readable text from XLSX, PPTX, ODT, RTF, PDF, CSV, Markdown, HTML, and plain text.
- Sanitize imported HTML before it is displayed or used for conversion.
- Process a queue sequentially for inspection, PDF conversion, metadata removal, page numbering, watermarking, or lossless PDF optimization.
- Save batch outputs individually or package successful results in a ZIP.
- Inspect DOCX, PDF, and supported text-bearing formats in one local workflow.

## Browser-local technology

| Component | Purpose | Loading and offline behavior |
| --- | --- | --- |
| Existing OOXML and JSZip code | DOCX inspection, editing, comparison, export, cleanup, and ZIP output | Core application code |
| PDF.js 6.3.289 | PDF rendering, text extraction, search, page rasterization, and local JPEG 2000 and JBIG2 image decoding | Core same-origin module, worker, decoders, character maps, fonts, and color profile |
| pdf-lib 1.17.1 | PDF page operations, forms, marks, metadata cleanup, and export | Core same-origin module |
| Tesseract.js 7.0.0 and English trained data | English OCR | Lazy-loaded on first OCR use, then eligible for same-origin optional caching |
| Mammoth.js 1.12.2 | Semantic DOCX to HTML and text conversion | Lazy-loaded on first applicable conversion, then eligible for optional caching |
| Marked 18.0.11 | Markdown parsing | Core same-origin module |
| DOMPurify 3.4.14 | Imported HTML sanitization | Core same-origin module |

All production runtime assets are committed under the repository root and served directly by GitHub Pages. The deployed application does not load these libraries from public CDNs.

## Privacy and security

- No document upload endpoint, analytics, or telemetry is present.
- The Content Security Policy permits connections only to the same origin and browser-created blob URLs.
- External links found inside Word files are inventoried without being contacted.
- The service worker caches an exact allowlist of application assets. It does not cache arbitrary requests or opened documents.
- Document state is held in memory for the current tab. Comment Master does not place document contents in `localStorage`, IndexedDB, OPFS, or the service-worker cache.
- Clear Local Workspace releases in-memory queues, PDF state, OCR workers, results, and object URLs. Optional cached engines can be cleared separately.
- ZIP-based inputs are checked for unsafe paths, unreasonable entry counts, per-entry and aggregate expanded size, and CRC integrity where applicable. DOCX loading requires core package parts, and edited, comparison, and Clean Word outputs are reopened with CRC checks and validated required or changed XML parts before delivery. Imported XML rejects entity declarations and malformed documents.
- Expanded workbench selection limits are 250 MB per file, 500 MB combined, and 100 files. The PDF viewer also applies a 2,000-page limit and decoded-pixel limits.

See [Privacy architecture](docs/PRIVACY.md) for the complete data-flow and cache boundaries.

## Important browser-only limits

- OCR currently ships English data only.
- Office conversion is semantic, not an embedded desktop Office suite. Text and readable structure are prioritized. Exact pagination, floating objects, charts, macros, fields, and complex layout can differ.
- PDF-to-DOCX creates a basic text document. It is not a high-fidelity page reconstruction.
- Normalize PDF is a fresh parse-and-rewrite path for PDFs that pdf-lib can read. It is not a general qpdf-equivalent repair engine.
- Lossless optimize rewrites the PDF and reports the actual size. It does not guarantee a smaller file and does not rasterize a good text PDF merely to claim compression.
- Secure redaction intentionally rasterizes every page into a new PDF. The entire output loses existing selectable text until OCR is run afterward, and the fresh document does not retain original catalog structures such as forms, bookmarks, tags, metadata, attachments, or signatures.
- Every PDF sanitization mode creates a fresh page-only document. Forms are flattened even when form cleanup was not selected, and catalog structures such as outlines, tags, page labels, attachments, and signatures are not preserved.
- Standard PDF form filling supports WinAnsi-compatible Latin values. Other scripts and characters may not be representable with the built-in standard font path.
- Page duplication, deletion, extraction, splitting, and normalization are refused when detected forms, XFA, signatures, or outlines would be discarded. Create an intentional flattened or sanitized copy first.
- Signature inspection detects signature fields or indicators. Comment Master does not establish certificate trust, revocation status, signer identity, or long-term validation, and it does not create certificate-based signatures.
- Password entry and encrypted PDF editing are not supported. Use a decrypted copy for editing operations.
- Editing any signed PDF can invalidate its signature. XFA forms are not edited.

## Build and test

Requirements for contributors:

- Node.js 24
- npm with the committed `package-lock.json`

```bash
npm ci --ignore-scripts --no-audit --fund=false
npx playwright install chromium
npm run qa
```

Useful commands:

```bash
npm run build        # Create the static production site in dist/
npm run build:pages  # Build and synchronize the committed root Pages runtime
npm run test:legacy  # Established Word and export regressions
npm run test:unit    # Core, PDF, privacy, filename, and Word v7 regressions
npm run test:e2e     # 19 Playwright browser, privacy, offline, and responsive tests
```

`npm run qa` remains the release contract. On the current branch it performs a production build, the legacy regression suites, 34 Node unit tests, 4 dedicated privacy tests, and 19 Playwright Chromium specifications. Three of the Node tests cover the separately packaged Word add-in reviewer-name helper added after the v7.0.1 workbench release.

Playwright requires its matching Chromium executable. In a new development environment, prepare it with `npx playwright install chromium` before running `npm run qa` or `npm run test:e2e`. The browser suite starts the generated `dist/` site on a loopback-only static QA server and does not change the browser-only production architecture.

The build copies only the production entry point, workbench assets, pinned same-origin vendor files, PDF.js support assets, license notices, web manifest, and generated service worker into `dist/`. It also generates `asset-manifest.json` with a content-derived build ID plus byte sizes and SHA-256 values for every other packaged runtime file. `npm run build:pages` then synchronizes the generated `assets/`, `vendor/`, service worker, and asset manifest to the repository root. GitHub Pages publishes that committed root directly from `main`; there is no custom deployment Action.

See [Architecture](docs/ARCHITECTURE.md), [Deployment](docs/DEPLOYMENT.md), [Test report](TEST_REPORT.md), [Changelog](CHANGELOG.md), and [Third-party notices](THIRD_PARTY_NOTICES.md).

## Accessibility and compatibility

Comment Master includes a skip link, semantic landmarks, labeled controls, status regions, dialog labels, tab and route state, keyboard PDF navigation, visible focus treatment, responsive layouts, reduced-motion treatment, and forced-colors support.

Current Chrome and Edge on desktop are the primary target because they provide the most complete File System Access API. Other current browsers use normal file inputs and download fallbacks. JavaScript modules, Web Workers, WebAssembly, Canvas, Blob URLs, and modern DOM APIs are required. Service-worker offline behavior requires HTTPS, which GitHub Pages provides.

## License notices

Third-party component versions and licenses are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The repository owner should separately define the license for Comment Master source code if redistribution terms are required.

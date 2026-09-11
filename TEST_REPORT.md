# Comment Master v7.0.1 test report

Date: 2026-09-01

Recovery audit: 2026-09-11

Release contracts: `npm run qa` and `npm run build:pages`
Local runtime used for the recorded run: Node.js 24.19.0, npm 11.9.0

## Release status

Version 7.0.1 is a focused patch for local PDF.js support assets and direct branch-based GitHub Pages publishing. The production build and synchronized Pages runtime are deterministic. Both established regression scripts, all 31 workbench Node unit tests, and all 4 dedicated privacy tests pass on the patch bytes. The current branch also passes three later Word add-in unit tests, for 34 Node unit tests total. Playwright discovers all 19 Chromium specifications, including the JPEG 2000 OCR regression, but browser execution was not run locally. The dependency audit reports zero vulnerabilities. The live deployment is verified against the committed release bytes. Complete file-based manual browser verification remains pending. This report does not substitute the successful v7.0.0 browser run for execution against changed v7.0.1 bytes.

The immediately preceding v7.0.0 baseline at commit `f8fd44c36e1b25b9b00d347be664a5c79910570e` completed the full automated suite: both established scripts passed, all 29 Node unit tests passed, all 4 dedicated privacy tests passed, and all 19 Playwright Chromium specifications passed in 29.5 seconds. That baseline is relevant regression evidence, but the current patch must also pass its local release checks.

## Version 7.0.1 automated result

Local release commands:

```bash
npm run build
npm run test:legacy
npm run test:unit
npm run test:privacy
npx playwright test --list --browser=chromium
npm audit
npm run build:pages
```

Result:

| Stage | Result |
| --- | --- |
| Production static build | Passed; v7.0.1 build `aeae40724ca0f1b88dd74903` |
| Established export regression script | Passed |
| Established Word comparison regression script | Passed |
| Node unit tests | 34 passed, 0 failed, 0 skipped, 0 cancelled on the current branch; 31 are part of the v7.0.1 workbench release and 3 cover the later Word add-in helper |
| Dedicated privacy tests | 4 passed, 0 failed, 0 skipped, 0 cancelled |
| Playwright browser specifications | 19 discovered; execution not run locally |
| Dependency audit | 0 vulnerabilities |
| Root Pages synchronization | Passed; two consecutive builds produced identical files |
| Overall `npm run qa` | Not run because local Playwright Chromium is unavailable; all non-browser stages passed |

The generated service worker, asset manifest, synchronized root runtime, and packaged PDF.js support-asset regression are confirmed for Comment Master v7.0.1.

The 2026-09-11 recovery audit also downloaded the deployed `index.html`, `service-worker.js`, and `asset-manifest.json`. Each file is byte-for-byte identical to the committed root runtime. The live manifest reports v7.0.1 build `aeae40724ca0f1b88dd74903`.

## Automated coverage

### Established Word and export regressions

`npm run test:legacy` executes two established scripts:

- `tests/comment_master_exports.test.js`
- `tests/comment_master_v6_3.test.js`

The export script verifies the application syntax and UI contract, output filenames, long comment context handling, reply association, and generated DOCX report packages in portrait and landscape layouts.

The comparison script verifies:

- required Compare Documents, Compare Text, and Combine Commentary controls;
- unique IDs and mapped Word UI actions;
- minimal word-level insertion and deletion behavior;
- one-word and punctuation-aware comparison primitives;
- formatting-aware token comparison;
- existing tracked revisions treated as accepted text for a new comparison;
- insertion and deletion of paragraphs;
- imported comments and reviewer attribution;
- multi-reviewer commentary combining with separately attributed alternatives;
- comment deduplication;
- Strict WordprocessingML input;
- preservation of untouched custom XML and binary media parts;
- readable comparison filenames using the local `d.m.yy` convention.

Both scripts passed.

### Workbench core

`tests/unit/workbench-core.test.mjs` contains eight tests covering:

- v7 version constant and format detection;
- exact edited and product filename rules, including uppercase source extensions and unencoded spaces;
- long product filenames that preserve the complete suffix and target extension;
- ordered page-range parsing, descending ranges, duplicate removal, and invalid input;
- contextual task suggestions for one DOCX, two DOCX files, several DOCX files, one PDF, several PDFs, mixed files, and text;
- selection admission limits, readable-file checks, path safety, the 250 MB per-file cap, the 500 MB aggregate cap, and the 100-file cap;
- size formatting, rotation normalization, and HTML escaping;
- cancellation before and after a cooperative event-loop yield.

All eight tests passed.

### PDF engine and generated fixtures

`tests/fixtures/generate-fixtures.mjs` creates deterministic synthetic PDFs and PNG data. The fixtures contain no real documents, personal data, PHI, or confidential material.

The fixtures exercise:

- stable page dimensions and rotation;
- metadata canaries;
- text, check-box, and dropdown form fields;
- comments and annotations;
- an external link canary;
- an embedded-file canary;
- JavaScript and automatic-action indicators;
- a deliberately damaged cross-reference location that the parser can normalize;
- a raw secret-string canary for redaction reconstruction;
- a fixed JPEG 2000 scan with high-contrast image content.

`tests/unit/pdf-engine.test.mjs` contains 13 tests covering:

- byte-for-byte deterministic fixture generation;
- a real JPX image stream in the synthetic scanned-PDF fixture;
- structural inspection of metadata, forms, page sizes, annotations, links, attachments, JavaScript, actions, and catalog actions stored inside object streams;
- merge, page reorder, duplicate page selection, rotation, extraction, split output, progress phases, and invalid page rejection;
- Unicode binder labels rendered safely while bookmarks retain the source title;
- form fill, strict Boolean check-box values, reset across supported controls, and flattening;
- clearing dropdown and radio canaries before form flattening;
- fresh page-only rebuilding for every sanitation mode, including physical removal of page-scoped metadata and attachments;
- fresh-context sanitation that does not retain detached canary objects;
- maximum sanitation of metadata, active content, attachments, annotations, links, actions, and form interactivity;
- fresh raster-page replacement without retaining the source secret canary or metadata;
- readable normalization and lossless-rewrite outputs, result-size accounting, Blob MIME type, and friendly unreadable-PDF failure.

All 13 tests passed.

### PDF.js decoder packaging

`tests/unit/pdfjs-decoders.test.mjs` contains one rendering test. It loads the synthetic JPEG 2000 scan through the packaged OpenJPEG WebAssembly decoder in `dist/vendor/pdfjs/wasm/`, renders the page to a real canvas, and requires visible blue, dark-text, and non-white pixel ratios. This directly guards against a scanned PDF loading while its page image remains blank.

The decoder packaging test passed.

### Word v7 focused regressions

`tests/unit/word-v7-regressions.test.mjs` contains nine tests covering:

- paragraph-formatting-only comparison and tracked `w:pPrChange` output;
- one minimal paragraph-formatting revision with combined attribution when reviewers propose the same formatting change;
- fail-closed handling for changed or inserted structurally complex paragraphs instead of flattened whole-paragraph replacement;
- paragraph-aligned comparison preview rows;
- preservation of a base header when a reviewed copy does not include that story part;
- acceptance of table cell revisions and move and custom-XML range markers;
- local-only external link inventory with a failing fetch stub and zero production fetch calls;
- exact edited, comparison, and combined-commentary filenames;
- complete clearing of prepared comparison state.

All nine tests passed.

### Privacy, offline, and production artifact

`tests/unit/privacy-offline.test.mjs` contains four tests covering:

- a production Content Security Policy that limits runtime connections to the same origin and blob URLs;
- absence of external network probes and persistent document archive APIs in document workflows;
- exact allowlist behavior in the service worker, including rejection of range requests, query variants, arbitrary same-origin files, and cross-origin requests;
- resolution of every generated offline asset from `asset-manifest.json` and absence of source or test archives in the production artifact.

All four tests passed.

The Word v7 link test separately evaluates the production link-inventory function with a `fetch` stub that would fail if called. Together, these tests cover the source-level and generated-artifact privacy contract without using real documents.

### Playwright browser specifications

`tests/browser/workbench.spec.mjs` contains 19 Chromium specifications covering:

- desktop Home hierarchy and lack of horizontal overflow;
- focused global route navigation;
- mixed-file staging and contextual suggestions;
- single-column mobile Home and responsive navigation;
- generated DOCX opening in the preserved Overview-first Word workspace and surviving route changes;
- generated PDF rendering, search, page reorder, unsaved state, and export summary;
- two staged DOCX files prefilling Compare Documents;
- navigable inline, original, revised, and synchronized side-by-side comparison views plus parsed redline DOCX output;
- direct staged-DOCX handoff to Create Clean Copy;
- visible rendering of a synthetic JPEG 2000 scan before OCR, local recognition and search of its text, and preserved visible pixels after searchable output is created;
- secure redaction export as a fully rasterized PDF without the approved text;
- maximum sanitation export as a passive flattened PDF;
- binder creation from PDF and TXT inputs with parsed page-count verification;
- TXT conversion into a parsed one-page PDF;
- batch inspection packaging parsed PDF and DOCX health reports;
- Clean Word export with revisions accepted and review data removed;
- runtime interception of external requests while opening a DOCX link canary and active-content PDF canary;
- hostile imported HTML without remote image, link, or style requests;
- exact service-worker cache allowlists and an offline shell reload.

Specification discovery reports all 19 tests. They were not executed for this recorded result. No browser assertion is marked passed or failed here.

To execute the suite in a Playwright-capable test environment:

```bash
npx playwright install chromium
npm run test:e2e
```

The browser suite is part of `npm run qa`. The matching Chromium build must be installed locally with `npx playwright install chromium` before the full release command is run.

## Build and direct Pages checks

The local release process verifies both the generated build and the branch-published root runtime:

- installs only from the committed lockfile with lifecycle scripts disabled;
- uses the lockfile-installed Playwright runner and its matching installed Chromium build;
- runs the complete QA contract, including all 19 browser specifications;
- verifies required top-level production files;
- rejects unexpected top-level artifacts and symlinks;
- requires all service-worker template placeholders to be replaced;
- hashes every packaged runtime file other than the manifest itself and records those exact files in `asset-manifest.json`;
- synchronizes generated `assets/`, `vendor/`, `service-worker.js`, and `asset-manifest.json` to the repository root;
- verifies the root entry, web manifest, and third-party notice against the generated versions;
- verifies `.nojekyll` for direct GitHub Pages branch publishing.

GitHub Pages is configured to publish `main` and `/ (root)`. The repository has no custom build or deployment Action. GitHub's own branch-publication job may still appear after a push.

## Manual browser verification

Status: **Partial**

The 2026-09-11 recovery audit opened the public GitHub Pages deployment in cloud Chrome and confirmed:

- the v7.0.1 Home screen loads with the expected Home, Word, PDF, Compare & Combine, and Tools navigation;
- Home presents the local-processing promise, drag-and-drop target, primary Word and PDF actions, and progressive Binder, Convert, and Batch actions without horizontal overflow at the inspected desktop width;
- Word, PDF, and Tools navigation each reveals the expected focused workspace;
- Compare & Combine opens as a labeled dialog with separate Compare documents, Compare text, and Combine commentary tabs;
- Compare Text produced a one-change minimal inline redline for the required `30` to `45` example while preserving the unchanged sentence text, and exposed Redline, Original, Revised, Side by side, previous/next change, and DOCX save controls;
- no warning or error from the Comment Master origin appeared during those checks.

The cloud browser's file-chooser bridge timed out when attaching the synthetic JPEG 2000 PDF, and the local environment could not download Playwright Chromium because the download host returned a 502 response followed by repeated timeouts. Therefore DOCX/PDF file workflows, OCR, redaction, conversion, binder, batch, offline, and Edge checks below remain pending on the v7.0.1 bytes. The synthetic OpenJPEG canvas unit regression still verifies that the reported blank scanned-page defect is fixed at the packaged decoder level.

The release owner must replace this section with dated results for the final deployed or final production-equivalent artifact. At minimum, record current desktop Chrome and Edge results for:

- first-launch Home clarity at common desktop widths;
- keyboard navigation, visible focus, dialogs, and no modal traps;
- file picker and drag-and-drop behavior;
- one DOCX in the existing review workspace;
- two DOCX files in Compare Documents;
- formatted Compare Text;
- several reviewed DOCX files in Combine Commentary;
- one text PDF and one scanned PDF;
- PDF thumbnails, navigation, search, zoom, text selection, and page organization;
- OCR progress, cancellation, English searchable output, and offline reuse after first preparation;
- drawn, selected-text, search, and regular-expression redaction marks;
- secure redaction output inspection, including absence of recoverable marked text where testable;
- sanitation presets, health report, form fill, reset, and flatten;
- mixed-file binder, item-level error continuation, bookmarks, table of contents, labels, and numbering;
- semantic conversion outputs and clear fidelity notices;
- batch status, error isolation, cancellation, individual saves, and ZIP output;
- File System Access save path where supported and download fallback;
- browser Back behavior where relevant;
- unsaved PDF navigation warning;
- Clear Local Workspace and optional-engine cache clearing;
- offline core use, stale-cache replacement, and update-ready behavior;
- Network interception after application assets load, confirming no filename, source bytes, extracted text, metadata, hash, or document-derived URL leaves the origin;
- Cache Storage inspection confirming that no document or arbitrary request was cached;
- visual clipping, overlap, blank states, horizontal overflow, tiny controls, and responsive navigation.

No pending entry should be treated as passed until the final report records the browser version, platform, fixture, outcome, and any defect resolution.

## Test boundaries

The passing Node suite does not by itself establish:

- browser rendering fidelity or PDF.js text-layer alignment;
- OCR accuracy for a particular scan, font, language, or page orientation;
- maximum-memory behavior for every device and browser;
- cryptographic PDF signature validity, certificate trust, or revocation status;
- exact Office conversion layout fidelity;
- repair of every malformed PDF;
- guaranteed PDF size reduction;
- successful password entry or encrypted PDF editing;
- complete accessibility of untagged source PDFs;
- runtime network behavior of a modified browser extension or compromised browser.

The 19 Playwright browser specifications are part of `npm run qa`. The mandatory manual browser verification above remains a separate release gate for this version even after automated Playwright passes.

## Conclusion

The v7.0.0 baseline completed the entire automated suite, including all 19 Playwright specifications. On the current branch, the deterministic v7.0.1 build and root synchronization pass; both established regression scripts, all 34 Node unit tests, and all 4 privacy tests pass, including the packaged OpenJPEG canvas regression; all 19 browser specifications are discovered; the dependency audit reports zero vulnerabilities; and the live Pages entry, service worker, and manifest match the committed bytes. Browser execution and the remaining file-based manual matrix remain pending and must not be described as passed.

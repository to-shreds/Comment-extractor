# Comment Master v7.1.1 test report

Date: 2026-10-01

Release contracts: `npm run qa` and `npm run build:pages`.
Runtime: Node.js 24.19.0, npm 11.9.0, Playwright 1.62.1, Chromium 151.0.7922.34.

## Scope and results

The release preserves the browser-local, file-first interface and repairs demonstrated workflow, output-fidelity, and cleanup defects. Tests use synthetic documents; no client documents were used.

| Check | Result |
| --- | --- |
| Production build | Passed |
| Established Word/export regression scripts | Both passed |
| Node unit tests | 46 passed |
| Dedicated privacy tests | 4 passed |
| Chromium browser tests | 49 passed in 55.4 seconds, no retries required |
| Desktop and mobile visual inspection | Meaningful page content, working controls, compact mobile header, no error overlay or root horizontal overflow |
| Pages runtime synchronization | Verified; manifest build `5d8251752eae0ee36cb45d76` |

The browser count includes the original 19 specifications, 20 reliability regressions, and 10 Word stress specifications. Unit test counts include the separately packaged Word add-in reviewer helper.

## Stress coverage and repairs

- File picker: cancelled fallback dialogs release listeners and pending state; repeated attempts produce one open.
- Document loading: malformed inputs preserve the current document; slow reads cannot replace a later selection or repopulate a cleared workspace. Reopening the same File keeps in-memory edits.
- PDF exports: cancelled native Save preserves unsaved work; page order and rotation remain intact. Open another invokes the picker even after Home staging.
- Queues: repeated admissions enforce the total 100-file and 500 MB limits atomically; external drag text cannot corrupt the binder; matching ZIP output names preserve every result.
- Word: reviewer editing, Undo, export, and reopen preserve actual review content. Clean Copy uses the edited document. Closing removes document text, reviewer names, and previews from the DOM.
- Comparison: 80 deterministic edit sequences and a 2,000-paragraph repetitive document preserve accepted revised content, trailing insertion order, and duplicate occurrences. Unsupported inserted table containers fail closed.
- PDF transformations: a 240-page reverse-order fixture checks output order and cancellation without altering source bytes.
- PDF cleanup: shape/multimedia annotations and image-resource XMP canaries are removed. External action chains are detected; explicit and named internal destinations still navigate to the correct output page, verified through PDF.js.
- OCR: long identifiers retain their beginnings; word placement follows crop bounds and every right-angle page rotation. The real JPEG 2000 scan remains visible after OCR.
- Privacy and offline: embedded external URLs and hostile HTML cause no document-derived external requests; service-worker caching matches the exact asset allowlist; the shell reloads offline.
- Interface: Home retains one main picker and progressive disclosure. More dismisses on an outside click. PDF Export is usable at 320 px without root horizontal overflow, and its controls appear above the long page preview.

## Baseline evidence

The original v7.1.0 source at `516a4ee00a009bc622250f98aa1d32088c5e4905`, manifest build `695e2bfbba651b1bb53b04ff`, was exercised in an isolated checkout. Every one of the first 18 reliability regressions has a failing-before reproduction across targeted baseline runs. The initial 11-test run had 10 failures and one prematurely passing same-file check; a strengthened awaited-open assertion demonstrated that failure as well. The final two tests check returning to the current PDF during a pending replacement and 320 px PDF Export. New Word and PDF defects were also reproduced before their targeted fixes.

## Practical limits

Automated Chromium results and inspected exported packages establish the tested browser behavior, not native Microsoft Word rendering or every PDF producer's compatibility. OCR remains English-only. Office conversion remains semantic, and arbitrary scripts or emoji are not supported by the built-in standard PDF text font. Secure PDF redaction intentionally rasterizes every page. PDF sanitization intentionally flattens forms and rebuilds pages, so original catalog-level structures such as outlines, tags, signatures, and page labels are not preserved. Retained local links are rebound to the actual rebuilt pages.

The previous application is preserved on `archive/v7.1.0-before-stress-test`; the complete runtime must be restored together if rolling back.

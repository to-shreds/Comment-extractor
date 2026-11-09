# Third-party notices

Comment Master distributes the following third-party software. This file records third-party terms only and does not grant a license to Comment Master itself.

The committed Pages runtime includes this notice at `THIRD_PARTY_NOTICES.md` and the license files supplied by each package under `vendor/`. Source links below identify the corresponding upstream projects.

## Directly distributed components

| Component | Version | License used | Source | Deployed license |
| --- | ---: | --- | --- | --- |
| JSZip | 3.10.1 | MIT option from `(MIT OR GPL-3.0-or-later)` | <https://github.com/Stuk/jszip> | `vendor/jszip/LICENSE.markdown` |
| PDF.js | 6.3.289 | Apache-2.0 | <https://github.com/mozilla/pdf.js> | `vendor/pdfjs/LICENSE` |
| pdf-lib | 1.17.1 | MIT | <https://github.com/Hopding/pdf-lib> | `vendor/pdf-lib/LICENSE` |
| Mammoth.js | 1.12.2 | BSD-2-Clause | <https://github.com/mwilliamson/mammoth.js> | `vendor/mammoth/LICENSE` |
| Marked | 18.0.11 | MIT | <https://github.com/markedjs/marked> | `vendor/marked/LICENSE` |
| DOMPurify | 3.4.14 | Apache-2.0 option from `(MPL-2.0 OR Apache-2.0)` | <https://github.com/cure53/DOMPurify> | `vendor/dompurify/LICENSE` |
| Tesseract.js | 7.0.0 | Apache-2.0 | <https://github.com/naptha/tesseract.js> | `vendor/tesseract/LICENSE` |
| tesseract.js-core | 7.0.0 | Apache-2.0 | <https://github.com/naptha/tesseract.js-core> | `vendor/tesseract/core/LICENSE` |
| English Tesseract trained data | 1.0.0 | MIT, as declared by package metadata | <https://github.com/naptha/tessdata> | This file, under "English trained data MIT notice" |

The Tesseract minified files refer to generated license notices. Those notices are deployed beside the files as `vendor/tesseract/tesseract.min.js.LICENSE.txt` and `vendor/tesseract/worker.min.js.LICENSE.txt`.


## Locally bundled interface typefaces

The editorial interface bundles six Latin-subset WOFF2 files under `assets/fonts/`. All fonts are served from Comment Master's own origin and included in its offline asset inventory. They are sourced from the pinned open-source [Fontsource font-files repository](https://github.com/fontsource/font-files/tree/5a72889057f592bb0659629e38337359f94d53b2); the development bootstrap verifies each file's upstream Git blob hash before writing it.

| Typeface | License | Deployed license |
| --- | --- | --- |
| IBM Plex Sans (upright and italic variable weight) | SIL Open Font License 1.1 | `assets/fonts/LICENSE-IBM-Plex-Sans.txt` |
| Source Serif 4 (upright and italic variable weight) | SIL Open Font License 1.1 | `assets/fonts/LICENSE-Source-Serif-4.txt` |
| IBM Plex Mono (regular and semibold) | SIL Open Font License 1.1 | `assets/fonts/LICENSE-IBM-Plex-Mono.txt` |

No font request is sent to Google Fonts, Fontsource, or another outside host while using the application.

## PDF.js support assets

Comment Master distributes the following pinned assets from the PDF.js 6.3.289 package so PDFs render entirely from the same origin, including scanned pages encoded with JPEG 2000 or JBIG2. The complete upstream terms are deployed beside the assets.

| Asset | Upstream terms | Deployed terms |
| --- | --- | --- |
| Adobe binary character maps | BSD-style 3-clause terms | `vendor/pdfjs/cmaps/LICENSE` |
| Foxit standard fonts | BSD-style 3-clause terms | `vendor/pdfjs/standard_fonts/LICENSE_FOXIT` |
| Liberation standard fonts | GPL-2.0 with the embedded-document and physical-product exceptions reproduced by upstream | `vendor/pdfjs/standard_fonts/LICENSE_LIBERATION` |
| ICC color profile | CC0-1.0 | `vendor/pdfjs/iccs/LICENSE` |
| OpenJPEG decoder | BSD-2-Clause | `vendor/pdfjs/wasm/LICENSE_OPENJPEG` |
| PDF.js OpenJPEG integration | BSD-2-Clause | `vendor/pdfjs/wasm/LICENSE_PDFJS_OPENJPEG` |
| PDFium JBIG2 decoder | BSD-style 3-clause and Apache-2.0 terms reproduced by upstream | `vendor/pdfjs/wasm/LICENSE_JBIG2` |
| PDF.js JBIG2 integration | Apache-2.0 | `vendor/pdfjs/wasm/LICENSE_PDFJS_JBIG2` |
| qcms color management | MIT | `vendor/pdfjs/wasm/LICENSE_QCMS` |
| PDF.js qcms integration | MIT | `vendor/pdfjs/wasm/LICENSE_PDFJS_QCMS` |

PDF.js also contains an optional QuickJS evaluation module. Comment Master disables PDF JavaScript evaluation and does not copy `quickjs-eval.js` or `quickjs-eval.wasm` into the production runtime.

## Components embedded in browser bundles

The published Mammoth.js browser bundle declares these embedded modules in its own license header: `@xmldom/xmldom` 0.8.6 (MIT), `base64-js` 1.5.1 (MIT), `bluebird` 3.4.7 (MIT), `buffer` 4.9.1 (MIT), `dingbat-to-unicode` 1.0.1 (BSD-2-Clause), `ieee754` 1.1.8 (BSD-3-Clause), `isarray` 1.0.0 (MIT), `jszip` 3.7.1 (MIT option), `lop` 0.4.2 (BSD-2-Clause), `option` 0.2.4 (BSD-2-Clause), `process` 0.11.9 (MIT), `underscore` 1.13.1 (MIT), and `xmlbuilder` 10.0.0 (MIT).

The JSZip browser bundle also contains Pako. Pako 1.0.11 is licensed under `(MIT AND Zlib)` and its supplied license is deployed as `vendor/jszip/pako-LICENSE`.

The pdf-lib bundle contains TypeScript helper code whose Apache-2.0 notice remains in the minified file. PDF.js and DOMPurify also retain their upstream license banners in the deployed modules.

## English trained data MIT notice

The `@tesseract.js-data/eng` 1.0.0 package metadata identifies Balearica as the author and declares the package license as MIT. The package does not include a separate license file. The MIT terms are reproduced here with that package attribution:

Copyright (c) Balearica

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

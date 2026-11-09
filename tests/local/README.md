# Local Word-only browser harness

This optional diagnostic runs the actual inline Word engine and the new workspace/summary code in Chromium without loading pages over the network. It inlines modules into a local Playwright document and substitutes only the PDF imports. It does not test PDF processing, real module loading, service-worker upgrades, or deployed hosting.

Dependencies: Python, Playwright, Chromium, python-docx, lxml. Set `CM_LOCAL_OUTPUT` for result files. Run `python tests/local/linear_checks.py`. The results include actual file-chooser interactions, generated DOCX package checks, editing/navigation/status tests, and 390/320-pixel layout checks. This is not a substitute for `npm run qa` before deployment.

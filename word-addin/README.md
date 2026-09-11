# Comment Master Word add-in: Reviewer Names

A deliberately small Word add-in for one Comment Master operation: change reviewer names on comments and tracked changes in the currently open DOCX, then open the revised package as a new Word document.

## What it does

1. Open a DOCX in Word.
2. Click **Reviewer Names** in the **Comment Master** group on the Home ribbon.
3. Choose one detected reviewer name, or **All reviewer names**.
4. Enter the replacement name.
5. Click **Change & open copy**.

The original open document is not overwritten. The add-in gets a temporary compressed copy from Word, changes only the reviewer `author` attributes used by the existing Comment Master global rename workflow, rebuilds the DOCX locally, and asks Word to open the result as a new document. Save that new document normally if you want to keep it.

## Privacy

Document contents are processed locally in the Word add-in runtime. The add-in does not upload the DOCX to Comment Master or another document-processing service. Microsoft Office.js itself is loaded from Microsoft's required Office CDN.

## Installation for testing

The manifest is `word-addin/manifest.xml`.

For Word on the web, Microsoft currently documents sideloading an add-in-only manifest through **Home > Add-ins > More Settings/Advanced > Upload My Add-in**. For desktop Word, use Microsoft's sideloading instructions for your platform if that command is not exposed directly.

Microsoft sideloading documentation:
https://learn.microsoft.com/en-us/office/dev/add-ins/testing/test-debug-office-add-ins

Once installed, the command appears on the **Home** tab in the **Comment Master** group.

## Scope and intentional limits

- Changes the reviewer `author` attribution on Word comments and tracked-change/revision markup across the main document, headers, footers, footnotes, endnotes, and comment parts.
- Mirrors Comment Master's existing reviewer-name operation. It does not rewrite initials, document properties, or unrelated identity metadata.
- Supports normal ZIP-based DOCX packages using stored or DEFLATE-compressed entries.
- Rejects encrypted, multi-volume, ZIP64, malformed, or unsafe packages rather than attempting a partial rewrite.
- Uses the same 250 MB package-size, 20,000-entry, and 750 MB estimated-expanded-size safety ceilings as the Comment Master browser workbench.
- Requires WordApi 1.3, the Office `CompressedFile` requirement set, and a Word runtime with native raw-DEFLATE support.

## Hosting

The task pane is hosted from the same GitHub Pages deployment as Comment Master:

`https://to-shreds.github.io/Comment-extractor/word-addin/`

The add-in files live directly under the repository-root `word-addin/` directory, which GitHub Pages serves alongside Comment Master from `main`. The existing Comment Master build does not need to be rerun for an add-in-only change, and no GitHub Action is required or used for deployment.

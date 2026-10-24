# CampusAccess

**CampusAccess** is a complete, responsive, accessible learning-material converter built with **only HTML, CSS, and vanilla JavaScript**. It runs entirely in your browser — no server, no build step, no API keys, and no paid external AI services. Just open `index.html`.

---

## Features

| Feature | Description |
|---|---|
| **Dashboard** | Clean, modern student interface with navigation, stats, and recent documents. |
| **Document upload** | Drag-and-drop **and** file picker with validation, file-size limits, progress feedback, and clear error messages. |
| **Supported formats** | TXT, CSV, HTML, MD, JSON, XML, LOG (native); PDF, DOCX, PPTX, XLSX (via client-side libraries). |
| **Study resources** | Detailed summaries, bullet points, key terms & definitions, comparison tables, formulas/examples, revision sheets, simplified reading. |
| **Ask Your Files** | Search the text of every uploaded document; matching passages are shown with source filenames and highlighted terms. |
| **Document preview** | View extracted text and source metadata in a modal. |
| **Exports** | Download any generated resource or full document text as `.txt` files. |
| **Accessibility** | Adjustable text size (4 levels), high-contrast / dark / sepia themes, dyslexia-friendly font, reduce-motion, keyboard navigation, focus indicators, and browser text-to-speech with Play / Pause / Resume / Stop and adjustable speed. |
| **Storage** | Documents and preferences persist in `localStorage`. |
| **Responsive** | Mobile, tablet, and desktop layouts. |
| **Privacy** | Files are processed locally. No document content is uploaded to any server. |

---

## How to run

1. Download and unzip the project.
2. Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).
3. That's it — no installation, no server, no dependencies to install.

> **Note:** The first time you process a PDF, DOCX, XLSX, or PPTX, the browser fetches a small client-side library from a CDN (see below). An internet connection is needed for those formats **only**. TXT, CSV, HTML, and other text formats work fully offline.

---

## Supported file formats

| Format | Method | Library | Online? |
|---|---|---|---|
| TXT, CSV, HTML, HTM, MD, JSON, XML, LOG | Native `FileReader` | None | Offline |
| RTF | Basic regex text extraction | None | Offline |
| **PDF** | `pdf.js` by Mozilla | `pdf.min.js` (CDN) | First use |
| **DOCX** | `mammoth.js` | `mammoth.browser.min.js` (CDN) | First use |
| **XLSX** | `SheetJS` (community) | `xlsx.full.min.js` (CDN) | First use |
| **PPTX** | `JSZip` — extracts slide XML text | `jszip.min.js` (CDN) | First use |

If a library fails to load (e.g. no internet), the app reports a clear error and **never** pretends an unsupported file was processed.

### Limitations

- **PPTX** extraction reads text runs from slide XML; embedded images, charts, and speaker notes are not extracted.
- **Scanned PDFs** (image-only) have no extractable text layer — the app will report "No text could be extracted."
- **DOCX** that are actually old `.doc` (binary) format are **not** supported; use `.docx`.
- Maximum file size: **8 MB** per file (configurable in `script.js` → `MAX_BYTES`).
- Resource generation uses **deterministic text-analysis heuristics** (keyword frequency, sentence scoring, pattern matching). It is **not** a trained ML model or generative AI, and the app does not claim to be.

---

## Accessibility

- **Text size:** A− / A / A+ / A++ (persisted).
- **Themes:** Light, Dark, High contrast, Sepia (persisted).
- **Reading aids:** Dyslexia-friendly font, line-focus mode, reduce-motion (persisted).
- **Keyboard:** All navigation and actions are keyboard-reachable; visible focus rings; `Esc` closes panels/modals; skip-to-content link.
- **Read Aloud:** Uses the browser's Web Speech API. Select any text on the page to auto-populate the reader, or type/paste text. Controls: Play, Pause, Resume, Stop, and speed (0.5×–2×).

---

## Storage & privacy

- Documents, generated resources, preferences, and usage stats are stored in the browser's `localStorage`.
- **Browser-local storage is NOT secure multi-user account storage.** Anyone with access to this browser profile can read stored data. Clearing browser data erases everything.
- File content is processed in-browser and is never sent to an external server. The only network requests are the optional CDN libraries for PDF/DOCX/XLSX/PPTX extraction.

---

## Project structure

```
CampusAccess/
├── index.html      # App structure and all views
├── style.css       # All styling, themes, responsive layout, accessibility
├── script.js       # All application logic (extraction, resources, search, TTS, storage)
└── README.md       # This file
```

---

## Testing checklist

The following features are implemented and ready to test:

- [x] Upload via drag-drop and file picker
- [x] File-size validation and empty-file detection
- [x] Unsupported-format error messages
- [x] Text extraction for TXT, CSV, HTML, PDF, DOCX, XLSX, PPTX
- [x] Generate: summary, bullets, key terms, comparison table, formulas, revision sheet, simplified reading
- [x] Export resources and full document text as `.txt`
- [x] Search across all documents with highlighted matches and source filenames
- [x] Document preview modal
- [x] Text-to-speech with pause/resume/stop and speed control
- [x] Adjustable text size, high-contrast, dark, sepia themes
- [x] Keyboard navigation and focus indicators
- [x] Responsive layout on mobile, tablet, desktop
- [x] Data persists across reloads via `localStorage`

---

## Browser support

Tested on current versions of Chrome, Edge, Firefox, and Safari. Requires a browser with `localStorage` and (for read-aloud) the Web Speech API.

---

## License

This project is provided as-is for educational use.

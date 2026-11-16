# Paperfold

A local-first, Markdown-native notebook app. All notes save as `.md` files on your disk.

![Paperfold Demo Preview](./docs/demo.webp)

## Features

- **Visual mode** — click and type like Word/Google Docs (no Markdown needed)
- **Markdown mode** — write raw `.md` syntax with toolbar shortcuts
- Switch modes anytime — they stay in sync
- OneNote-style sidebar: Notebooks → Sections → Pages
- **Inline rename & delete** — right-click any notebook, section, or page
- **Title editing** — edit the page title and the file is renamed on disk (titles keep their exact case, spaces and non-Latin characters)
- **Full-text search** — `Ctrl+Shift+F` searches every page in every notebook
- **Search bar in the title bar** — shows the open page and your Quick-open shortcut; click it (or `Ctrl+P`) to jump to a page by title, then press `Tab` to switch to full-text search
- **Rebindable shortcuts** — change New page / Save / Quick open / Search in Settings → Keyboard shortcuts
- **Live folder sync** — edits made in VS Code, Obsidian or Explorer appear without restarting
- **Tables, strikethrough, underline** — all survive Visual ⇄ Markdown switching
- **Safe by default** — atomic saves, unsaved edits flushed on quit, deletes go to the Recycle Bin / Trash
- Real `.md` files on disk — fully portable
- Code blocks with custom language selector & clean text copy button
- Task lists with custom checkboxes
- Auto-save with 800ms debounce and a real save status (Saved / Saving / Save failed)
- Custom title bar with minimize/maximize/close
- Dark mode support
- Accurate word count (Markdown syntax excluded)

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Install & Run

```bash
git clone <your-repo-url>
cd <project-folder>
npm install
npm run dev
```

This opens the Electron window with hot-reload.

### Run the tests

```bash
npm test
```

### Build for Windows

```bash
npm run build
```

Produces a `.exe` installer in the `release/` folder.

## File Structure

```
paperfold/
├── electron/
│   ├── main.js          # Electron main process (window, IPC, file system)
│   ├── pathUtils.js     # Path-safety + filename helpers (unit tested)
│   └── preload.js       # Secure bridge between Electron and React
├── src/
│   ├── components/
│   │   ├── TitleBar.jsx         # Custom draggable title bar
│   │   ├── NotebookSidebar.jsx  # Left sidebar — notebook list (with rename/delete)
│   │   ├── PageSidebar.jsx      # Middle sidebar — sections & pages (with rename/delete)
│   │   ├── Editor.jsx           # Main editor (TipTap + raw MD)
│   │   ├── SearchModal.jsx      # Ctrl+Shift+F full-text search
│   │   └── Toolbar.jsx          # Context-aware toolbar
│   ├── hooks/
│   │   └── useNotebooks.js      # Notebook state, CRUD and the save pipeline
│   ├── styles/
│   │   └── global.css           # CSS variables, Inter font, dark mode
│   ├── App.jsx                  # Root layout, menu wiring, modals
│   └── main.jsx                 # React entry point
├── index.html
├── vite.config.js
└── package.json
```

## Notes Storage

By default, notebooks are stored in:
```
Documents/Paperfold/<NotebookName>/<SectionName>/<Page Title>.md
```

You can change the folder via **File → Open Notebook Folder…**

## Tech Stack

| Layer | Library |
|-------|---------|
| Shell | Electron 42 |
| UI | React 18 + Vite 8 |
| WYSIWYG Editor | TipTap 2 |
| Syntax Highlighting | lowlight + highlight.js |
| MD → HTML | marked |
| HTML → MD | Turndown (+ GFM tables/strikethrough) |
| Persistence | electron-store |
| Icons | lucide-react |
| Typography | Inter (Google Fonts) |

## Troubleshooting

Hardware acceleration is off by default because some Windows GPU drivers crash frameless Electron windows. If yours is stable, turn it on in **Settings → Performance** (needs a restart).

If you edit the open page in another program while you also have unsaved changes in Paperfold, your Paperfold changes win when they save.

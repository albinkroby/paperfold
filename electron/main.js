const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path = require('path')
const fs  = require('fs')
const fsp = fs.promises
const Store = require('electron-store')
const { sanitizeName, isInside, uniquePath, makeSnippet } = require('./pathUtils')
const { SHORTCUT_DEFS, validateBinding, resolveShortcuts } = require('./shortcuts')

const store = new Store()
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const DEV_URL = 'http://localhost:5173'

// ── GPU / crash workaround ───────────────────────────────────────────────────
// Some Windows systems (Intel + certain driver versions) trigger a
// STATUS_BREAKPOINT (0x80000003) renderer crash when GPU-accelerated
// compositing is active inside an Electron frameless window.
// Hardware acceleration therefore stays OFF by default. Users on healthy
// drivers can opt in by setting the "hardwareAcceleration" store key to true.
// These calls MUST happen before app.whenReady().
if (!store.get('hardwareAcceleration', false)) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
}

// ── Logging System ──────────────────────────────────────────────────────────
let logFile = null
function getLogFile() {
  if (!logFile) {
    try {
      const dir = app.getPath('userData')
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      logFile = path.join(dir, 'paperfold.log')
    } catch (e) {
      logFile = path.join(app.getPath('temp'), 'paperfold-fallback.log')
    }
  }
  return logFile
}

function writeLog(level, message) {
  try {
    const file = getLogFile()
    const time = new Date().toISOString()
    const logMessage = `[${time}] [${level}] ${message}\n`
    fs.appendFileSync(file, logMessage, 'utf-8')
    console.log(logMessage.trim())
  } catch (e) {
    console.error('Failed to write log:', e)
  }
}

// Catch crashes/uncaught errors and show a native dialog box
process.on('uncaughtException', (error) => {
  writeLog('CRITICAL', `Uncaught Exception: ${error.message}\nStack: ${error.stack}`)
  try {
    dialog.showErrorBox(
      'Paperfold - Unexpected Error',
      `An unexpected error occurred:\n\n${error.message}\n\nLog file location:\n${getLogFile()}`
    )
  } catch (e) {}
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  writeLog('CRITICAL', `Unhandled Rejection: ${reason}`)
})

writeLog('INFO', `App starting. isDev: ${isDev}, version: ${app.getVersion()}, platform: ${process.platform}`)

// ── Notebooks root + path safety ─────────────────────────────────────────────
const getRoot = () => store.get('notebooksDir', path.join(app.getPath('documents'), 'Paperfold'))

/** Every renderer-supplied path must resolve inside the notebooks folder. */
function safePath(p) {
  if (typeof p !== 'string' || !isInside(getRoot(), p)) {
    throw new Error('Path is outside the notebooks folder.')
  }
  return path.resolve(p)
}

// Atomic write: write to a temp file, then rename over the target so a crash
// mid-write can never leave a truncated page behind.
async function writeFileAtomic(file, content) {
  const tmp = `${file}.${process.pid}.tmp`
  try {
    await fsp.writeFile(tmp, content, 'utf-8')
    markOwnWrite(file)
    await fsp.rename(tmp, file)
  } catch (e) {
    fsp.unlink(tmp).catch(() => {})
    throw e
  }
}

// ── External change detection ────────────────────────────────────────────────
// Watches the notebooks folder so edits made in VS Code / Obsidian / Explorer
// show up in the sidebar and in the open page without restarting the app.
// Our own writes are remembered briefly so they don't trigger a reload.
const ownWrites = new Map() // absolute path → timestamp
function markOwnWrite(file) {
  ownWrites.set(path.resolve(file), Date.now())
}
const isOwnWrite = (file) => {
  const t = ownWrites.get(path.resolve(file))
  if (t === undefined) return false
  if (Date.now() - t > 2000) { ownWrites.delete(path.resolve(file)); return false }
  return true
}

let watcher = null
let watchTimer = null
const changedPaths = new Set()

function startWatcher() {
  try { watcher?.close() } catch {}
  watcher = null
  const root = getRoot()
  if (!fs.existsSync(root)) return
  try {
    watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const full = path.join(root, filename.toString())
      if (/\.tmp$/i.test(full) || isOwnWrite(full)) return
      changedPaths.add(full)
      clearTimeout(watchTimer)
      watchTimer = setTimeout(() => {
        const paths = [...changedPaths]
        changedPaths.clear()
        for (const w of BrowserWindow.getAllWindows()) {
          if (!w.isDestroyed()) w.webContents.send('menu:fs-changed', paths)
        }
      }, 400)
    })
    watcher.on('error', (e) => writeLog('ERROR', `Folder watcher error: ${e.message}`))
  } catch (e) {
    writeLog('ERROR', `Could not watch ${root}: ${e.message}`)
  }
}

// Only these keys may be read/written from the renderer. In particular the
// renderer must not be able to change "notebooksDir" without the folder dialog.
const STORE_KEYS = new Set(['theme', 'editorFontSize', 'editorDefaultMode', 'welcomeShown', 'hardwareAcceleration'])
const assertStoreKey = (key) => {
  if (!STORE_KEYS.has(key)) throw new Error(`Unknown setting: ${key}`)
}

// ── Window ───────────────────────────────────────────────────────────────────
const closeAllowed = new WeakSet()

function createWindow() {
  writeLog('INFO', 'Creating window')
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    backgroundColor: '#18181b', // matches --bg-primary dark token in global.css
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hidden',
  })

  // Never let the app window navigate away or spawn new windows; open real
  // web links in the user's browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith(DEV_URL) : url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })

  if (isDev) {
    writeLog('INFO', `Loading dev server URL: ${DEV_URL}`)
    win.loadURL(DEV_URL)
  } else {
    const prodPath = path.join(__dirname, '../dist/index.html')
    writeLog('INFO', `Loading production file: ${prodPath}`)
    win.loadFile(prodPath)
  }

  win.webContents.on('did-finish-load', () => writeLog('INFO', 'Page finished loading'))
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    writeLog('ERROR', `Failed to load URL: ${validatedURL}. Code: ${errorCode}, Description: ${errorDescription}`)
  })
  win.webContents.on('render-process-gone', (event, details) => {
    writeLog('CRITICAL', `Renderer process gone. Reason: ${details.reason}, Exit Code: ${details.exitCode}`)
  })

  // Ask the renderer to flush any unsaved edits before the window closes.
  win.on('close', (event) => {
    const wc = win.webContents
    if (closeAllowed.has(win) || wc.isDestroyed() || wc.isCrashed()) return
    event.preventDefault()
    if (win.__closeTimer) return
    wc.send('menu:before-close')
    // Safety net: never trap the user in an unresponsive window.
    win.__closeTimer = setTimeout(() => {
      closeAllowed.add(win)
      if (!win.isDestroyed()) win.close()
    }, 3000)
  })

  buildMenu()
  return win
}

// Menu actions go to whichever window is focused (or the first one).
const targetWindow = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
const sendToWindow = (channel) => targetWindow()?.webContents.send(channel)

const getShortcuts = () => resolveShortcuts(store.get('shortcuts', {}))

function buildMenu() {
  const keys = getShortcuts()
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Page',              accelerator: keys.newPage,         click: () => sendToWindow('menu:new-page') },
        { label: 'Save',                  accelerator: keys.save,            click: () => sendToWindow('menu:save') },
        { type: 'separator' },
        { label: 'Quick Open Page…',      accelerator: keys.quickOpen,       click: () => sendToWindow('menu:quick-open') },
        { label: 'Search Notebooks…',     accelerator: keys.search,          click: () => sendToWindow('menu:search') },
        { label: 'Open Notebook Folder…', click: () => sendToWindow('menu:open-folder') },
        { type: 'separator' },
        { label: 'Export as .md',         click: () => sendToWindow('menu:export-md') },
        { type: 'separator' },
        { label: 'Quit',                  accelerator: 'CmdOrCtrl+Q',        click: () => app.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo',       accelerator: 'CmdOrCtrl+Z',       role: 'undo' },
        { label: 'Redo',       accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut',        role: 'cut' },
        { label: 'Copy',       role: 'copy' },
        { label: 'Paste',      role: 'paste' },
        { label: 'Select All', role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        // Dev Tools only visible in development builds
        ...(isDev ? [
          { label: 'Toggle Dev Tools', accelerator: 'F12', click: () => targetWindow()?.webContents.toggleDevTools() },
          { type: 'separator' },
        ] : []),
        { label: 'Reload',     accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { type: 'separator' },
        { label: 'Zoom In',    accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: 'Zoom Out',   accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Helper: scan notebooks from disk (metadata only — no content read) ────────
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
const visibleDirs = (entries) => entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).sort(byName)

async function scanNotebooks(rootDir) {
  const notebooks = []
  const entries = await fsp.readdir(rootDir, { withFileTypes: true })

  for (const entry of visibleDirs(entries)) {
    const nbPath = path.join(rootDir, entry.name)
    const sections = []
    let sectionEntries = []
    try {
      sectionEntries = await fsp.readdir(nbPath, { withFileTypes: true })
    } catch (e) {
      writeLog('ERROR', `Cannot read notebook ${nbPath}: ${e.message}`)
    }

    for (const sec of visibleDirs(sectionEntries)) {
      const secPath = path.join(nbPath, sec.name)
      const pages = []
      let files = []
      try {
        files = (await fsp.readdir(secPath)).filter(f => /\.md$/i.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      } catch (e) {
        writeLog('ERROR', `Cannot read section ${secPath}: ${e.message}`)
      }

      for (const file of files) {
        const filePath = path.join(secPath, file)
        try {
          const stat = await fsp.stat(filePath)
          pages.push({
            // The filename (minus .md) IS the title, so titles round-trip exactly.
            title:    file.replace(/\.md$/i, ''),
            filename: file,
            path:     filePath,
            // content intentionally omitted — loaded lazily on page select
            modified: stat.mtime.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
          })
        } catch (e) {
          writeLog('ERROR', `Cannot stat ${filePath}: ${e.message}`)
        }
      }
      sections.push({ name: sec.name, path: secPath, pages })
    }
    notebooks.push({ name: entry.name, path: nbPath, sections })
  }
  return notebooks
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

// Read all notebooks from a root folder (metadata only)
ipcMain.handle('fs:read-notebooks', async () => {
  const rootDir = getRoot()
  if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true })

  let notebooks = await scanNotebooks(rootDir)

  // Bootstrap a sample notebook ONLY on very first app launch
  const hasInitialized = store.get('hasInitialized', false)
  if (!hasInitialized && notebooks.length === 0) {
    store.set('hasInitialized', true)
    const sampleNb  = path.join(rootDir, 'My Notebook')
    const sampleSec = path.join(sampleNb, 'General')
    fs.mkdirSync(sampleSec, { recursive: true })
    await fsp.writeFile(
      path.join(sampleSec, 'welcome.md'),
      `# Welcome to Paperfold\n\nStart writing here. Use **Visual mode** to write like Word, or switch to **Markdown mode** to write raw syntax.\n\n## Code Blocks\n\n\`\`\`javascript\nconsole.log("Hello from Paperfold!")\n\`\`\`\n\n## Tips\n\n- All notes are saved as \`.md\` files on your disk\n- Open the folder in VS Code, Obsidian, or any editor\n- Use Ctrl+S to save anytime\n- Use Ctrl+Shift+F to search every page\n- Right-click notebooks, sections, or pages to rename or delete them\n`,
      'utf-8'
    )
    notebooks = await scanNotebooks(rootDir)
  }

  return { notebooks, rootDir }
})

// Read a single page's content on demand (lazy loading)
ipcMain.handle('fs:read-page', async (_, { filePath }) => {
  const file = safePath(filePath)
  try {
    const content = await fsp.readFile(file, 'utf-8')
    return { content }
  } catch (e) {
    writeLog('ERROR', `Failed to read page: ${file} — ${e.message}`)
    return { content: '', error: e.message }
  }
})

// Save a page (atomic). Errors propagate so the renderer can show them.
ipcMain.handle('fs:save-page', async (_, { filePath, content }) => {
  const file = safePath(filePath)
  if (!/\.md$/i.test(file)) throw new Error('Only .md pages can be saved.')
  if (typeof content !== 'string') throw new Error('Invalid page content.')
  try {
    await writeFileAtomic(file, content)
  } catch (e) {
    writeLog('ERROR', `Failed to save page: ${file} — ${e.message}`)
    throw e
  }
  return true
})

// Export active page as a .md file via save dialog
ipcMain.handle('fs:export-md', async (_, { title, content }) => {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showSaveDialog(win, {
    title:       'Export page as Markdown',
    defaultPath: `${sanitizeName(title, 'untitled')}.md`,
    filters:     [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (result.canceled || !result.filePath) return false
  await writeFileAtomic(result.filePath, String(content ?? ''))
  return true
})

// Create new page — the title becomes the filename (sanitized, de-duplicated)
ipcMain.handle('fs:create-page', async (_, { sectionPath, title }) => {
  const dir = safePath(sectionPath)
  const base = sanitizeName(title, 'Untitled Page')
  const filePath = uniquePath(dir, base, '.md', fs.existsSync)
  await fsp.writeFile(filePath, '', 'utf-8') // empty body to avoid a duplicate H1 in the editor
  return { filePath, filename: path.basename(filePath), content: '' }
})

// Create new section
ipcMain.handle('fs:create-section', async (_, { notebookPath, name }) => {
  const nb = safePath(notebookPath)
  const secPath = uniquePath(nb, sanitizeName(name, 'New Section'), '', fs.existsSync)
  await fsp.mkdir(secPath, { recursive: true })
  return secPath
})

// Create new notebook
ipcMain.handle('fs:create-notebook', async (_, { name }) => {
  const rootDir = getRoot()
  const nbPath = uniquePath(rootDir, sanitizeName(name, 'New Notebook'), '', fs.existsSync)
  const secPath = path.join(nbPath, 'General')
  await fsp.mkdir(secPath, { recursive: true })
  return { nbPath, secPath }
})

// Rename a notebook / section / page. The main process builds the new path so
// the renderer can never point it outside the notebooks folder.
ipcMain.handle('fs:rename', async (_, { oldPath, newName }) => {
  const from = safePath(oldPath)
  const isPage = /\.md$/i.test(from)
  const to = path.join(path.dirname(from), sanitizeName(newName) + (isPage ? '.md' : ''))
  if (to === from) return from
  // Windows/macOS are case-insensitive: allow "notes" → "Notes" on the same entry.
  const caseOnly = to.toLowerCase() === from.toLowerCase()
  if (!caseOnly && fs.existsSync(to)) throw new Error('An item with that name already exists.')
  await fsp.rename(from, to)
  return to
})

// Deletes go to the Recycle Bin / Trash so mistakes are recoverable.
const trash = (target) => shell.trashItem(safePath(target))
ipcMain.handle('fs:delete-page',     async (_, { filePath })     => { await trash(filePath);     return true })
ipcMain.handle('fs:delete-section',  async (_, { sectionPath })  => { await trash(sectionPath);  return true })
ipcMain.handle('fs:delete-notebook', async (_, { notebookPath }) => { await trash(notebookPath); return true })

// Full-text search across every page (title + content)
ipcMain.handle('fs:search', async (_, { query }) => {
  const q = String(query ?? '').trim()
  if (q.length < 2) return []
  const results = []
  const notebooks = await scanNotebooks(getRoot())
  const needle = q.toLowerCase()

  outer:
  for (const nb of notebooks) {
    for (const sec of nb.sections) {
      for (const page of sec.pages) {
        let content = ''
        try {
          const stat = await fsp.stat(page.path)
          if (stat.size <= 2 * 1024 * 1024) content = await fsp.readFile(page.path, 'utf-8')
        } catch { /* unreadable page: still match on title */ }

        const titleHit = page.title.toLowerCase().includes(needle)
        const bodyHit  = content.toLowerCase().includes(needle)
        if (!titleHit && !bodyHit) continue

        results.push({
          path: page.path,
          title: page.title,
          notebook: nb.name,
          section: sec.name,
          snippet: bodyHit ? makeSnippet(content, q) : '',
          titleHit,
        })
        if (results.length >= 50) break outer
      }
    }
  }
  // Title matches first
  return results.sort((a, b) => Number(b.titleHit) - Number(a.titleHit))
})

// Pick a notebooks folder
ipcMain.handle('fs:choose-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (!result.canceled && result.filePaths.length > 0) {
    store.set('notebooksDir', result.filePaths[0])
    startWatcher()
    return result.filePaths[0]
  }
  return null
})

// Settings store (whitelisted keys only)
ipcMain.handle('store:get', async (_, key) => { assertStoreKey(key); return store.get(key) })
ipcMain.handle('store:set', async (_, key, value) => { assertStoreKey(key); store.set(key, value) })

// App version
ipcMain.handle('app:get-version', async () => app.getVersion())

// Rebindable shortcuts
const shortcutPayload = () => {
  const current = getShortcuts()
  return SHORTCUT_DEFS.map(d => ({ id: d.id, label: d.label, description: d.description, default: d.default, value: current[d.id] }))
}
ipcMain.handle('shortcuts:get', async () => shortcutPayload())
// accelerator === null resets that action to its default
ipcMain.handle('shortcuts:set', async (_, { id, accelerator }) => {
  const def = SHORTCUT_DEFS.find(d => d.id === id)
  if (!def) return { ok: false, error: 'Unknown shortcut.' }
  const overrides = { ...store.get('shortcuts', {}) }
  if (accelerator === null) {
    delete overrides[id]
  } else {
    const check = validateBinding(getShortcuts(), id, accelerator)
    if (!check.ok) return check
    overrides[id] = check.accelerator
  }
  store.set('shortcuts', overrides)
  buildMenu()
  return { ok: true, shortcuts: shortcutPayload() }
})
ipcMain.handle('shortcuts:reset-all', async () => {
  store.delete('shortcuts')
  buildMenu()
  return { ok: true, shortcuts: shortcutPayload() }
})

// Restart (used after toggling hardware acceleration). Quitting goes through the
// normal close path, so unsaved edits are flushed first.
ipcMain.on('app:relaunch', () => {
  app.relaunch()
  app.quit()
})

// Window controls
ipcMain.on('window:minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
ipcMain.on('window:maximize', () => {
  const win = BrowserWindow.getFocusedWindow()
  win?.isMaximized() ? win.unmaximize() : win?.maximize()
})
ipcMain.on('window:close', () => BrowserWindow.getFocusedWindow()?.close())

// Renderer reports back after flushing unsaved edits. ok=false (a save failed)
// keeps the window open so no data is silently lost.
ipcMain.on('app:close-ready', (event, ok = true) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  clearTimeout(win.__closeTimer)
  win.__closeTimer = null
  if (ok) {
    closeAllowed.add(win)
    win.close()
  }
})

app.whenReady().then(() => {
  writeLog('INFO', 'App is ready, creating window')
  createWindow()
  fs.mkdirSync(getRoot(), { recursive: true })
  startWatcher()
})

app.on('will-quit', () => { try { watcher?.close() } catch {} })

app.on('window-all-closed', () => {
  writeLog('INFO', 'All windows closed')
  if (process.platform !== 'darwin') {
    writeLog('INFO', 'Quitting app')
    app.quit()
  }
})

app.on('activate', () => {
  writeLog('INFO', 'App activated')
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

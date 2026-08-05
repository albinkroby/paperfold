const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const Store = require('electron-store')

// Fix STATUS_BREAKPOINT (0x80000003) renderer crash in packaged/installed builds.
// These flags must be set BEFORE app is ready.
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('no-sandbox')

const store = new Store()
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ── Logging System ──────────────────────────────────────────────────────────
let logFile = null
function getLogFile() {
  if (!logFile) {
    try {
      const dir = app.getPath('userData')
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      logFile = path.join(dir, 'folio.log')
    } catch (e) {
      logFile = path.join(app.getPath('temp'), 'folio-fallback.log')
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
      'Folio - Startup Error',
      `An unexpected error occurred during startup:\n\n${error.message}\n\nLog file location:\n${getLogFile()}`
    )
  } catch (e) {}
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  writeLog('CRITICAL', `Unhandled Rejection: ${reason}`)
})

writeLog('INFO', `App starting. isDev: ${isDev}, version: ${app.getVersion()}, platform: ${process.platform}`)

function createWindow() {
  writeLog('INFO', 'Creating window')
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    backgroundColor: '#1a1a1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    // icon: path.join(__dirname, '../dist/icon.ico'),
    titleBarStyle: 'hidden',
  })

  if (isDev) {
    writeLog('INFO', 'Loading dev server URL: http://localhost:5173')
    win.loadURL('http://localhost:5173')
  } else {
    const prodPath = path.join(__dirname, '../dist/index.html')
    writeLog('INFO', `Loading production file: ${prodPath}`)
    win.loadFile(prodPath)
  }

  win.webContents.on('did-finish-load', () => {
    writeLog('INFO', 'Page finished loading')
  })

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    writeLog('ERROR', `Failed to load URL: ${validatedURL}. Code: ${errorCode}, Description: ${errorDescription}`)
  })

  win.webContents.on('render-process-gone', (event, details) => {
    writeLog('CRITICAL', `Renderer process gone. Reason: ${details.reason}, Exit Code: ${details.exitCode}`)
  })

  buildMenu(win)
  return win
}

function buildMenu(win) {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Page',              accelerator: 'CmdOrCtrl+N',        click: () => win.webContents.send('menu:new-page') },
        { label: 'Save',                  accelerator: 'CmdOrCtrl+S',        click: () => win.webContents.send('menu:save') },
        { type: 'separator' },
        { label: 'Open Notebook Folder…', click: () => win.webContents.send('menu:open-folder') },
        { type: 'separator' },
        { label: 'Export as .md',         click: () => win.webContents.send('menu:export-md') },
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
        { label: 'Toggle Dev Tools', accelerator: 'F12',         click: () => win.webContents.toggleDevTools() },
        { label: 'Reload',           accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { type: 'separator' },
        { label: 'Zoom In',          accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: 'Zoom Out',         accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'Reset Zoom',       accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── Helper: scan notebooks from disk ─────────────────────────────────────────
function scanNotebooks(rootDir) {
  const notebooks = []
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const nbPath = path.join(rootDir, entry.name)
    const sections = []
    const sectionEntries = fs.readdirSync(nbPath, { withFileTypes: true })

    for (const sec of sectionEntries) {
      if (!sec.isDirectory()) continue
      const secPath = path.join(nbPath, sec.name)
      const pages = []
      const pageFiles = fs.readdirSync(secPath).filter(f => f.endsWith('.md'))

      for (const file of pageFiles) {
        const filePath = path.join(secPath, file)
        const content = fs.readFileSync(filePath, 'utf-8')
        const stat = fs.statSync(filePath)
        pages.push({
          title: file.replace('.md', '').replace(/-/g, ' '),
          filename: file,
          path: filePath,
          content,
          modified: stat.mtime.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        })
      }
      sections.push({ name: sec.name, path: secPath, pages })
    }
    notebooks.push({ name: entry.name, path: nbPath, sections })
  }
  return notebooks
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

// Read all notebooks from a root folder
ipcMain.handle('fs:read-notebooks', async () => {
  const rootDir = store.get('notebooksDir', path.join(app.getPath('documents'), 'Folio'))
  if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true })

  let notebooks = scanNotebooks(rootDir)

  // If empty, bootstrap a sample notebook then re-scan
  if (notebooks.length === 0) {
    const sampleNb  = path.join(rootDir, 'My Notebook')
    const sampleSec = path.join(sampleNb, 'General')
    fs.mkdirSync(sampleSec, { recursive: true })
    fs.writeFileSync(
      path.join(sampleSec, 'welcome.md'),
      `# Welcome to Folio\n\nStart writing here. Use **Visual mode** to write like Word, or switch to **Markdown mode** to write raw syntax.\n\n## Code Blocks\n\n\`\`\`javascript\nconsole.log("Hello from Folio!")\n\`\`\`\n\n## Tips\n\n- All notes are saved as \`.md\` files on your disk\n- Open the folder in VS Code, Obsidian, or any editor\n- Use Ctrl+S to save anytime\n- Right-click notebooks, sections, or pages to rename or delete them\n`
    )
    notebooks = scanNotebooks(rootDir)
  }

  return { notebooks, rootDir }
})

// Save a page
ipcMain.handle('fs:save-page', async (_, { filePath, content }) => {
  fs.writeFileSync(filePath, content, 'utf-8')
  return true
})

// Create new page
ipcMain.handle('fs:create-page', async (_, { sectionPath, title }) => {
  const filename = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.md'
  const filePath = path.join(sectionPath, filename)
  const content  = `# ${title}\n\n`
  fs.writeFileSync(filePath, content, 'utf-8')
  return { filePath, filename, content }
})

// Create new section
ipcMain.handle('fs:create-section', async (_, { notebookPath, name }) => {
  const secPath = path.join(notebookPath, name)
  fs.mkdirSync(secPath, { recursive: true })
  return secPath
})

// Create new notebook
ipcMain.handle('fs:create-notebook', async (_, { name }) => {
  const rootDir = store.get('notebooksDir', path.join(app.getPath('documents'), 'Folio'))
  const nbPath  = path.join(rootDir, name)
  const secPath = path.join(nbPath, 'General')
  fs.mkdirSync(secPath, { recursive: true })
  return { nbPath, secPath }
})

// Rename a file/folder
ipcMain.handle('fs:rename', async (_, { oldPath, newPath }) => {
  fs.renameSync(oldPath, newPath)
  return true
})

// Delete a page
ipcMain.handle('fs:delete-page', async (_, { filePath }) => {
  fs.unlinkSync(filePath)
  return true
})

// Delete a section (folder + all .md files inside)
ipcMain.handle('fs:delete-section', async (_, { sectionPath }) => {
  fs.rmSync(sectionPath, { recursive: true, force: true })
  return true
})

// Delete a notebook (folder + everything inside)
ipcMain.handle('fs:delete-notebook', async (_, { notebookPath }) => {
  fs.rmSync(notebookPath, { recursive: true, force: true })
  return true
})

// Pick a notebooks folder
ipcMain.handle('fs:choose-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (!result.canceled && result.filePaths.length > 0) {
    store.set('notebooksDir', result.filePaths[0])
    return result.filePaths[0]
  }
  return null
})

// Settings store
ipcMain.handle('store:get', async (_, key) => store.get(key))
ipcMain.handle('store:set', async (_, key, value) => store.set(key, value))

// Window controls
ipcMain.on('window:minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
ipcMain.on('window:maximize', () => {
  const win = BrowserWindow.getFocusedWindow()
  win?.isMaximized() ? win.unmaximize() : win?.maximize()
})
ipcMain.on('window:close', () => BrowserWindow.getFocusedWindow()?.close())

app.whenReady().then(() => {
  writeLog('INFO', 'App is ready, creating window')
  createWindow()
})

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

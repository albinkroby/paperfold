import { useState, useEffect, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar'
import NotebookSidebar from './components/NotebookSidebar'
import PageSidebar from './components/PageSidebar'
import Editor from './components/Editor'
import ConfirmModal from './components/ConfirmModal'
import Settings from './components/Settings'
import styles from './styles/App.module.css'

// Safe filename slug: if all chars are stripped (e.g. pure emoji/non-latin),
// fall back to a timestamp so we never produce an empty ".md" filename.
function toSlug(title) {
  const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  return slug || `page-${Date.now()}`
}

export default function App() {
  const [notebooks, setNotebooks]           = useState([])
  const [rootDir, setRootDir]               = useState('')
  const [activeNotebook, setActiveNotebook] = useState(null)
  const [activePage, setActivePage]         = useState(null)
  const [loading, setLoading]               = useState(true)
  const [confirmState, setConfirmState]     = useState(null) // { title, message, confirmLabel, onConfirm }
  const [settingsOpen, setSettingsOpen]     = useState(false)
  const [sidebarOpen, setSidebarOpen]       = useState(true)
  const [defaultMode, setDefaultMode]       = useState('visual')
  const autoSaveTimer                       = useRef(null)
  // Keep a ref to activePage so event handlers always see the latest value
  const activePageRef                       = useRef(activePage)
  useEffect(() => { activePageRef.current = activePage }, [activePage])

  // ── Apply saved settings on startup ────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      window.api.storeGet('theme'),
      window.api.storeGet('editorFontSize'),
      window.api.storeGet('editorDefaultMode'),
    ]).then(([theme, fontSize, mode]) => {
      if (theme && theme !== 'system') {
        document.documentElement.setAttribute('data-theme', theme)
      }
      if (fontSize) {
        const sizes = { small: '13px', medium: '15px', large: '17px' }
        document.documentElement.style.setProperty('--editor-font-size', sizes[fontSize] || '15px')
      }
      if (mode) setDefaultMode(mode)
    })
  }, [])

  // ── Helper: show confirm modal ──────────────────────────────────────────────
  const showConfirm = useCallback((title, message, confirmLabel, onConfirm) => {
    setConfirmState({ title, message, confirmLabel, onConfirm })
  }, [])

  const closeConfirm = useCallback(() => setConfirmState(null), [])

  // ── Load notebooks (metadata only — no content) ─────────────────────────────
  const loadNotebooks = useCallback(async (keepNotebookPath, keepPagePath) => {
    const result = await window.api.readNotebooks()
    if (!result) { setLoading(false); return }

    setNotebooks(result.notebooks)
    setRootDir(result.rootDir)

    const nb = keepNotebookPath
      ? result.notebooks.find(n => n.path === keepNotebookPath)
      : (result.notebooks[0] || null)

    if (nb) {
      setActiveNotebook(nb)
      const allPages = nb.sections.flatMap(s => s.pages)
      const pageMeta = keepPagePath
        ? allPages.find(p => p.path === keepPagePath)
        : (nb.sections[0]?.pages[0] || null)

      if (pageMeta) {
        // Load content lazily for the initial page
        const { content } = await window.api.readPage({ filePath: pageMeta.path })
        setActivePage({ ...pageMeta, content })
      } else {
        setActivePage(null)
      }
    } else {
      setActiveNotebook(null)
      setActivePage(null)
    }

    setLoading(false)
  }, [])

  useEffect(() => { loadNotebooks() }, [loadNotebooks])

  // ── Flush pending auto-save immediately ─────────────────────────────────────
  const flushSave = useCallback(() => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = null
      const page = activePageRef.current
      if (page?.path && page.content != null) {
        window.api.savePage({ filePath: page.path, content: page.content })
      }
    }
  }, [])

  // ── Menu event listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const handleSave       = () => activePageRef.current && savePage(activePageRef.current)
    const handleNewPage    = () => handleCreatePage()
    const handleOpenFolder = async () => { await window.api.chooseFolder(); loadNotebooks() }
    const handleExportMd   = async () => {
      const page = activePageRef.current
      if (!page) return
      await window.api.exportMd({ title: page.title, content: page.content || '' })
    }

    window.api.onMenu('save',        handleSave)
    window.api.onMenu('new-page',    handleNewPage)
    window.api.onMenu('open-folder', handleOpenFolder)
    window.api.onMenu('export-md',   handleExportMd)
    return () => {
      window.api.offMenu('save',        handleSave)
      window.api.offMenu('new-page',    handleNewPage)
      window.api.offMenu('open-folder', handleOpenFolder)
      window.api.offMenu('export-md',   handleExportMd)
    }
  }, []) // stable — uses ref for activePage

  // ── Save ────────────────────────────────────────────────────────────────────
  const savePage = useCallback(async (page) => {
    if (!page?.path || page.content == null) return
    await window.api.savePage({ filePath: page.path, content: page.content })
  }, [])

  const handleContentChange = useCallback((content) => {
    setActivePage(prev => {
      const updated = { ...prev, content }
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => savePage(updated), 800)
      return updated
    })
  }, [savePage])

  // Flush save + load content lazily when switching pages
  const handleSelectPage = useCallback(async (pageMeta) => {
    flushSave()
    const { content } = await window.api.readPage({ filePath: pageMeta.path })
    setActivePage({ ...pageMeta, content })
  }, [flushSave])

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreatePage = async (sectionPath, name = 'Untitled Page') => {
    if (!activeNotebook) return
    const sec = sectionPath ? { path: sectionPath } : activeNotebook.sections[0]
    if (!sec) return
    const result = await window.api.createPage({ sectionPath: sec.path, title: name })
    if (result) await loadNotebooks(activeNotebook.path, result.filePath)
  }

  const handleCreateNotebook = async (name = 'New Notebook') => {
    await window.api.createNotebook({ name })
    await loadNotebooks()
  }

  const handleCreateSection = async (notebookPath, name = 'New Section') => {
    await window.api.createSection({ notebookPath, name })
    await loadNotebooks(activeNotebook?.path, activePage?.path)
  }

  // ── Rename ──────────────────────────────────────────────────────────────────
  const handleRenameNotebook = async (nb, newName) => {
    if (!newName || newName.trim() === nb.name) return
    const newPath = nb.path.replace(/[^/\\]+$/, newName.trim())
    await window.api.rename({ oldPath: nb.path, newPath })
    const isActive = activeNotebook?.path === nb.path
    await loadNotebooks(isActive ? newPath : activeNotebook?.path, activePage?.path)
  }

  const handleRenameSection = async (sec, newName) => {
    if (!newName || newName.trim() === sec.name) return
    const newPath = sec.path.replace(/[^/\\]+$/, newName.trim())
    await window.api.rename({ oldPath: sec.path, newPath })
    await loadNotebooks(activeNotebook?.path, activePage?.path)
  }

  const handleRenamePage = async (page, newName) => {
    if (!newName || newName.trim() === page.title) return
    const dir         = page.path.replace(/[^/\\]+$/, '')
    const newFilename = toSlug(newName.trim()) + '.md'
    const newPath     = dir + newFilename
    await window.api.savePage({ filePath: page.path, content: page.content || '' })
    await window.api.rename({ oldPath: page.path, newPath })
    await loadNotebooks(activeNotebook?.path, activePage?.path === page.path ? newPath : activePage?.path)
  }

  const handleTitleChange = async (page, newTitle) => {
    const dir         = page.path.replace(/[^/\\]+$/, '')
    const newFilename = toSlug(newTitle) + '.md'
    const newPath     = dir + newFilename
    if (newPath === page.path) return
    await window.api.savePage({ filePath: page.path, content: page.content || '' })
    await window.api.rename({ oldPath: page.path, newPath })
    await loadNotebooks(activeNotebook?.path, newPath)
  }

  // ── Delete (with custom confirm modal) ─────────────────────────────────────
  const handleDeleteNotebook = (nb) => {
    showConfirm(
      `Delete "${nb.name}"?`,
      `This will permanently delete the notebook and all its sections and pages. This action cannot be undone.`,
      'Delete notebook',
      async () => {
        closeConfirm()
        await window.api.deleteNotebook({ notebookPath: nb.path })
        const isActive = activeNotebook?.path === nb.path
        await loadNotebooks(isActive ? null : activeNotebook?.path, isActive ? null : activePage?.path)
      }
    )
  }

  const handleDeleteSection = (sec) => {
    showConfirm(
      `Delete "${sec.name}"?`,
      `This will permanently delete the section and all its pages. This action cannot be undone.`,
      'Delete section',
      async () => {
        closeConfirm()
        await window.api.deleteSection({ sectionPath: sec.path })
        const wasActive = activePage?.path?.startsWith(sec.path)
        await loadNotebooks(activeNotebook?.path, wasActive ? null : activePage?.path)
      }
    )
  }

  const handleDeletePage = (page) => {
    showConfirm(
      `Delete "${page.title}"?`,
      `This will permanently delete this page from your disk. This action cannot be undone.`,
      'Delete page',
      async () => {
        closeConfirm()
        await window.api.deletePage({ filePath: page.path })
        const wasActive = activePage?.path === page.path
        await loadNotebooks(activeNotebook?.path, wasActive ? null : activePage?.path)
      }
    )
  }

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-muted)', background: 'var(--bg-primary)',
      flexDirection: 'column', gap: '12px',
    }}>
      <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.03em' }}>Paperfold</div>
      <div style={{ fontSize: '13px' }}>Loading your notebooks…</div>
    </div>
  )

  return (
    <div className={styles.app}>
      <TitleBar
        title={activePage?.title || 'Paperfold'}
        rootDir={rootDir}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className={styles.body}>
        <NotebookSidebar
          isOpen={sidebarOpen}
          notebooks={notebooks}
          activeNotebook={activeNotebook}
          onSelectNotebook={(nb) => {
            setActiveNotebook(nb)
            const firstPage = nb.sections[0]?.pages[0] || null
            if (firstPage) handleSelectPage(firstPage)
            else setActivePage(null)
          }}
          onCreateNotebook={handleCreateNotebook}
          onRenameNotebook={handleRenameNotebook}
          onDeleteNotebook={handleDeleteNotebook}
        />
        <PageSidebar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
          notebook={activeNotebook}
          activePage={activePage}
          onSelectPage={handleSelectPage}
          onCreatePage={handleCreatePage}
          onCreateSection={handleCreateSection}
          onRenamePage={handleRenamePage}
          onDeletePage={handleDeletePage}
          onRenameSection={handleRenameSection}
          onDeleteSection={handleDeleteSection}
        />
        <Editor
          page={activePage}
          defaultMode={defaultMode}
          onContentChange={handleContentChange}
          onSave={savePage}
          onTitleChange={handleTitleChange}
        />
      </div>

      {/* Custom confirm modal */}
      {confirmState && (
        <ConfirmModal
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          onConfirm={confirmState.onConfirm}
          onCancel={closeConfirm}
        />
      )}

      {/* Settings */}
      {settingsOpen && (
        <Settings
          rootDir={rootDir}
          onClose={() => setSettingsOpen(false)}
          onFolderChange={loadNotebooks}
          onDefaultModeChange={setDefaultMode}
        />
      )}
    </div>
  )
}

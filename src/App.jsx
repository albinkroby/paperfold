import { useState, useEffect, useCallback, useRef } from 'react'
import TitleBar from './components/TitleBar'
import NotebookSidebar from './components/NotebookSidebar'
import PageSidebar from './components/PageSidebar'
import Editor from './components/Editor'
import styles from './styles/App.module.css'

export default function App() {
  const [notebooks, setNotebooks]           = useState([])
  const [rootDir, setRootDir]               = useState('')
  const [activeNotebook, setActiveNotebook] = useState(null)
  const [activePage, setActivePage]         = useState(null)
  const [loading, setLoading]               = useState(true)
  const autoSaveTimer                       = useRef(null)

  // ── Load notebooks ──────────────────────────────────────────────────────────
  const loadNotebooks = useCallback(async (keepNotebookPath, keepPagePath) => {
    const result = await window.api.readNotebooks()
    if (!result) { setLoading(false); return }

    setNotebooks(result.notebooks)
    setRootDir(result.rootDir)

    // Try to restore active notebook
    const nb = keepNotebookPath
      ? result.notebooks.find(n => n.path === keepNotebookPath)
      : (result.notebooks[0] || null)

    if (nb) {
      setActiveNotebook(nb)
      // Try to restore active page
      const allPages = nb.sections.flatMap(s => s.pages)
      const page = keepPagePath
        ? allPages.find(p => p.path === keepPagePath)
        : (nb.sections[0]?.pages[0] || null)
      setActivePage(page || null)
    } else {
      setActiveNotebook(null)
      setActivePage(null)
    }

    setLoading(false)
  }, [])

  useEffect(() => { loadNotebooks() }, [loadNotebooks])

  // ── Menu event listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const handleSave = () => activePage && savePage(activePage)
    const handleNewPage = () => handleCreatePage()
    const handleOpenFolder = async () => {
      await window.api.chooseFolder()
      loadNotebooks()
    }

    window.api.onMenu('save', handleSave)
    window.api.onMenu('new-page', handleNewPage)
    window.api.onMenu('open-folder', handleOpenFolder)
    return () => {
      window.api.offMenu('save', handleSave)
      window.api.offMenu('new-page', handleNewPage)
      window.api.offMenu('open-folder', handleOpenFolder)
    }
  }, [activePage])

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

  const handleSelectPage = useCallback((page) => {
    if (activePage) savePage(activePage)
    setActivePage(page)
  }, [activePage, savePage])

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreatePage = async (sectionPath, name = 'Untitled Page') => {
    if (!activeNotebook) return
    const sec = sectionPath
      ? { path: sectionPath }
      : activeNotebook.sections[0]
    if (!sec) return

    const result = await window.api.createPage({ sectionPath: sec.path, title: name })
    if (result) {
      await loadNotebooks(activeNotebook.path, result.filePath)
    }
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
    const dir = page.path.replace(/[^/\\]+$/, '')
    const newFilename = newName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.md'
    const newPath = dir + newFilename
    await window.api.savePage({ filePath: page.path, content: page.content || '' })
    await window.api.rename({ oldPath: page.path, newPath })
    await loadNotebooks(activeNotebook?.path, activePage?.path === page.path ? newPath : activePage?.path)
  }

  // ── Title input rename (from Editor) ────────────────────────────────────────
  const handleTitleChange = async (page, newTitle) => {
    const dir = page.path.replace(/[^/\\]+$/, '')
    const newFilename = newTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.md'
    const newPath = dir + newFilename
    if (newPath === page.path) return
    await window.api.savePage({ filePath: page.path, content: page.content || '' })
    await window.api.rename({ oldPath: page.path, newPath })
    await loadNotebooks(activeNotebook?.path, newPath)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDeleteNotebook = async (nb) => {
    if (!window.confirm(`Delete notebook "${nb.name}" and all its contents? This cannot be undone.`)) return
    await window.api.deleteNotebook({ notebookPath: nb.path })
    const isActive = activeNotebook?.path === nb.path
    await loadNotebooks(isActive ? null : activeNotebook?.path, isActive ? null : activePage?.path)
  }

  const handleDeleteSection = async (sec) => {
    if (!window.confirm(`Delete section "${sec.name}" and all its pages? This cannot be undone.`)) return
    await window.api.deleteSection({ sectionPath: sec.path })
    // If active page was in this section, clear it
    const wasActive = activePage?.path?.startsWith(sec.path)
    await loadNotebooks(activeNotebook?.path, wasActive ? null : activePage?.path)
  }

  const handleDeletePage = async (page) => {
    if (!window.confirm(`Delete "${page.title}"? This cannot be undone.`)) return
    await window.api.deletePage({ filePath: page.path })
    const wasActive = activePage?.path === page.path
    await loadNotebooks(activeNotebook?.path, wasActive ? null : activePage?.path)
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', background: 'var(--bg-primary)', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.03em' }}>Folio</div>
      <div style={{ fontSize: '13px' }}>Loading your notebooks…</div>
    </div>
  )

  return (
    <div className={styles.app}>
      <TitleBar title={activePage?.title || 'Folio'} rootDir={rootDir} />
      <div className={styles.body}>
        <NotebookSidebar
          notebooks={notebooks}
          activeNotebook={activeNotebook}
          onSelectNotebook={(nb) => {
            setActiveNotebook(nb)
            setActivePage(nb.sections[0]?.pages[0] || null)
          }}
          onCreateNotebook={handleCreateNotebook}
          onRenameNotebook={handleRenameNotebook}
          onDeleteNotebook={handleDeleteNotebook}
        />
        <PageSidebar
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
          onContentChange={handleContentChange}
          onSave={savePage}
          onTitleChange={handleTitleChange}
        />
      </div>
    </div>
  )
}

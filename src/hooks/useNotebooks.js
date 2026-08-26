import { useState, useEffect, useCallback, useRef } from 'react'

// Safe filename slug: if all chars are stripped (e.g. pure emoji/non-latin),
// fall back to a timestamp so we never produce an empty ".md" filename.
function toSlug(title) {
  const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  return slug || `page-${Date.now()}`
}

/**
 * Manages all notebook/section/page state and CRUD operations.
 * Keeps App.jsx focused on layout and UI-only state (sidebar, settings, modals).
 */
export function useNotebooks() {
  const [notebooks, setNotebooks]           = useState([])
  const [rootDir, setRootDir]               = useState('')
  const [activeNotebook, setActiveNotebook] = useState(null)
  const [activePage, setActivePage]         = useState(null)
  const [loading, setLoading]               = useState(true)
  const [confirmState, setConfirmState]     = useState(null) // { title, message, confirmLabel, onConfirm }

  const autoSaveTimer  = useRef(null)
  // Keep a ref to activePage so event handlers always see the latest value
  const activePageRef  = useRef(activePage)
  useEffect(() => { activePageRef.current = activePage }, [activePage])

  // ── Helper: show/close confirm modal ───────────────────────────────────────
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
  const handleCreatePage = useCallback(async (sectionPath, name = 'Untitled Page') => {
    if (!activeNotebook) return
    const sec = sectionPath ? { path: sectionPath } : activeNotebook.sections[0]
    if (!sec) return
    const result = await window.api.createPage({ sectionPath: sec.path, title: name })
    if (result) await loadNotebooks(activeNotebook.path, result.filePath)
  }, [activeNotebook, loadNotebooks])

  const handleCreateNotebook = useCallback(async (name = 'New Notebook') => {
    await window.api.createNotebook({ name })
    await loadNotebooks()
  }, [loadNotebooks])

  const handleCreateSection = useCallback(async (notebookPath, name = 'New Section') => {
    await window.api.createSection({ notebookPath, name })
    await loadNotebooks(activeNotebook?.path, activePage?.path)
  }, [activeNotebook?.path, activePage?.path, loadNotebooks])

  // ── Rename ──────────────────────────────────────────────────────────────────
  const handleRenameNotebook = useCallback(async (nb, newName) => {
    if (!newName || newName.trim() === nb.name) return
    const newPath = nb.path.replace(/[^/\\]+$/, newName.trim())
    try {
      await window.api.rename({ oldPath: nb.path, newPath })
      const isActive = activeNotebook?.path === nb.path
      await loadNotebooks(isActive ? newPath : activeNotebook?.path, activePage?.path)
    } catch {
      showConfirm('Duplicate Name', `A notebook named "${newName.trim()}" already exists. Please choose a different name.`, 'OK', closeConfirm)
    }
  }, [activeNotebook?.path, activePage?.path, closeConfirm, loadNotebooks, showConfirm])

  const handleRenameSection = useCallback(async (sec, newName) => {
    if (!newName || newName.trim() === sec.name) return
    const newPath = sec.path.replace(/[^/\\]+$/, newName.trim())
    try {
      await window.api.rename({ oldPath: sec.path, newPath })
      await loadNotebooks(activeNotebook?.path, activePage?.path)
    } catch {
      showConfirm('Duplicate Name', `A section named "${newName.trim()}" already exists in this notebook.`, 'OK', closeConfirm)
    }
  }, [activeNotebook?.path, activePage?.path, closeConfirm, loadNotebooks, showConfirm])

  const handleRenamePage = useCallback(async (page, newName) => {
    if (!newName || newName.trim() === page.title) return
    const dir         = page.path.replace(/[^/\\]+$/, '')
    const newFilename = toSlug(newName.trim()) + '.md'
    const newPath     = dir + newFilename
    try {
      await window.api.savePage({ filePath: page.path, content: page.content || '' })
      await window.api.rename({ oldPath: page.path, newPath })
      await loadNotebooks(activeNotebook?.path, activePage?.path === page.path ? newPath : activePage?.path)
    } catch {
      showConfirm('Duplicate Name', `A page named "${newName.trim()}" already exists in this section.`, 'OK', closeConfirm)
    }
  }, [activeNotebook?.path, activePage?.path, closeConfirm, loadNotebooks, showConfirm])

  const handleTitleChange = useCallback(async (page, newTitle) => {
    const dir         = page.path.replace(/[^/\\]+$/, '')
    const newFilename = toSlug(newTitle) + '.md'
    const newPath     = dir + newFilename
    if (newPath === page.path) return
    try {
      await window.api.savePage({ filePath: page.path, content: page.content || '' })
      await window.api.rename({ oldPath: page.path, newPath })
      await loadNotebooks(activeNotebook?.path, newPath)
    } catch {
      showConfirm('Duplicate Name', `A page named "${newTitle.trim()}" already exists in this section.`, 'OK', closeConfirm)
    }
  }, [activeNotebook?.path, closeConfirm, loadNotebooks, showConfirm])

  // ── Delete (with custom confirm modal) ─────────────────────────────────────
  const handleDeleteNotebook = useCallback((nb) => {
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
  }, [activeNotebook?.path, activePage?.path, closeConfirm, loadNotebooks, showConfirm])

  const handleDeleteSection = useCallback((sec) => {
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
  }, [activeNotebook?.path, activePage?.path, closeConfirm, loadNotebooks, showConfirm])

  const handleDeletePage = useCallback((page) => {
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
  }, [activeNotebook?.path, activePage?.path, closeConfirm, loadNotebooks, showConfirm])

  return {
    // State
    notebooks,
    rootDir,
    activeNotebook,
    activePage,
    loading,
    confirmState,
    // Setters needed by App for notebook/page switching UI
    setActiveNotebook,
    setActivePage,
    // Helpers
    closeConfirm,
    loadNotebooks,
    // Handlers
    savePage,
    flushSave,
    handleContentChange,
    handleSelectPage,
    handleCreatePage,
    handleCreateNotebook,
    handleCreateSection,
    handleRenameNotebook,
    handleRenameSection,
    handleRenamePage,
    handleTitleChange,
    handleDeleteNotebook,
    handleDeleteSection,
    handleDeletePage,
  }
}

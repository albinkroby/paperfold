import { useState, useEffect, useCallback, useRef } from 'react'

// Re-point `p` after `from` was renamed to `to` (handles files nested inside).
function remapPath(p, from, to) {
  if (!p) return p
  if (p === from) return to
  if (p.startsWith(from) && /[\\/]/.test(p[from.length])) return to + p.slice(from.length)
  return p
}

const isInside = (p, dir) => !!p && p.startsWith(dir) && /[\\/]/.test(p[dir.length] || '')

/**
 * Manages all notebook/section/page state and CRUD operations.
 * Keeps App.jsx focused on layout and UI-only state (sidebar, settings, modals).
 *
 * Saving model
 * ------------
 * The editor reports edits by handing us a *getter* (`getContent`) rather than a
 * converted string, so HTML→Markdown conversion only runs when we actually
 * write to disk, not on every keystroke. Edits are debounced (800 ms) and are
 * always flushed before anything that could lose them: switching page/notebook,
 * rename, reload of the tree, and closing the window.
 */
export function useNotebooks() {
  const [notebooks, setNotebooks]           = useState([])
  const [rootDir, setRootDir]               = useState('')
  const [activeNotebook, setActiveNotebook] = useState(null)
  const [activePage, setActivePage]         = useState(null)
  const [loading, setLoading]               = useState(true)
  const [confirmState, setConfirmState]     = useState(null) // { title, message, confirmLabel, onConfirm }
  const [saveStatus, setSaveStatus]         = useState('saved') // saved | unsaved | saving | error

  const pendingRef    = useRef(null)            // { path, getContent } — latest unsaved edit
  const timerRef      = useRef(null)
  const chainRef      = useRef(Promise.resolve()) // serialises writes so they never overlap
  const activePageRef = useRef(activePage)
  const notebooksRef  = useRef(notebooks)
  const activeNotebookRef = useRef(activeNotebook)
  useEffect(() => { activeNotebookRef.current = activeNotebook }, [activeNotebook])
  useEffect(() => { activePageRef.current = activePage }, [activePage])
  useEffect(() => { notebooksRef.current = notebooks }, [notebooks])

  // ── Helper: show/close confirm modal ───────────────────────────────────────
  const showConfirm = useCallback((title, message, confirmLabel, onConfirm) => {
    setConfirmState({ title, message, confirmLabel, onConfirm })
  }, [])

  const closeConfirm = useCallback(() => setConfirmState(null), [])

  const showError = useCallback((title, message) => {
    showConfirm(title, message, 'OK', () => setConfirmState(null))
  }, [showConfirm])

  // ── Save pipeline ───────────────────────────────────────────────────────────
  const doFlush = useCallback(async () => {
    const pending = pendingRef.current
    if (!pending) return true
    pendingRef.current = null

    let content
    try {
      content = pending.getContent()
      setSaveStatus('saving')
      await window.api.savePage({ filePath: pending.path, content })
      // Keep the in-memory copy current (used for export and as the load baseline)
      setActivePage(prev => (prev?.path === pending.path ? { ...prev, content } : prev))
      if (!pendingRef.current) setSaveStatus('saved')
      return true
    } catch {
      // Keep the unsaved text (as a plain string — the editor may move on) so a
      // later flush can retry, unless newer edits already replaced it.
      if (!pendingRef.current && content != null) {
        pendingRef.current = { path: pending.path, getContent: () => content }
      }
      setSaveStatus('error')
      return false
    }
  }, [])

  /** Writes any pending edit now. Resolves false if the write failed. */
  const flushSave = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = null
    const run = chainRef.current.then(doFlush, doFlush)
    chainRef.current = run
    return run
  }, [doFlush])

  /** Drop unsaved edits that belong to something that is about to be deleted. */
  const discardPendingIn = useCallback((target) => {
    const p = pendingRef.current?.path
    if (p && (p === target || isInside(p, target))) {
      pendingRef.current = null
      clearTimeout(timerRef.current)
      timerRef.current = null
      setSaveStatus('saved')
    }
  }, [])

  // Editor hands us a getter; we only convert + write after the debounce.
  const handleContentChange = useCallback((getContent) => {
    const page = activePageRef.current
    if (!page?.path) return
    pendingRef.current = { path: page.path, getContent }
    setSaveStatus('unsaved')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flushSave, 800)
  }, [flushSave])

  // Explicit save (Ctrl+S / Save button): editor passes the fresh page content.
  const savePage = useCallback(async (page) => {
    if (!page?.path || page.content == null) return false
    pendingRef.current = { path: page.path, getContent: () => page.content }
    return flushSave()
  }, [flushSave])

  const getActiveContent = useCallback(() => {
    if (pendingRef.current) return pendingRef.current.getContent()
    return activePageRef.current?.content ?? ''
  }, [])

  // Flush when the main process says the window is closing
  useEffect(() => {
    const onBeforeClose = async () => {
      const ok = await flushSave()
      window.api.closeReady(ok)
      if (!ok) showError('Could not save', 'Your latest changes could not be written to disk, so the window was kept open. Check that the folder is writable and try again.')
    }
    window.api.onMenu('before-close', onBeforeClose)
    return () => window.api.offMenu('before-close', onBeforeClose)
  }, [flushSave, showError])

  // Read a page; null (+ error dialog) if it can't be read, so we never open an
  // "empty" page that would overwrite the real file on the next keystroke.
  const readPageSafe = useCallback(async (pageMeta) => {
    const res = await window.api.readPage({ filePath: pageMeta.path })
    if (res?.error) {
      showError('Could not open page', `"${pageMeta.title}" could not be read from disk.`)
      return null
    }
    return { ...pageMeta, content: res?.content ?? '' }
  }, [showError])

  // ── Load notebooks (metadata only — no content) ─────────────────────────────
  const loadNotebooks = useCallback(async (keepNotebookPath, keepPagePath) => {
    await flushSave()
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

      setActivePage(pageMeta ? await readPageSafe(pageMeta) : null)
    } else {
      setActiveNotebook(null)
      setActivePage(null)
    }

    setSaveStatus('saved')
    setLoading(false)
  }, [flushSave, readPageSafe])

  useEffect(() => { loadNotebooks() }, [loadNotebooks])

  // ── External changes (VS Code, Obsidian, Explorer…) ─────────────────────────
  // Light refresh: update the sidebar tree, and re-read the open page only if it
  // changed on disk AND we have no unsaved edits of our own for it (ours win).
  const handleExternalChange = useCallback(async (changed = []) => {
    const result = await window.api.readNotebooks()
    if (!result) return
    setNotebooks(result.notebooks)
    setRootDir(result.rootDir)

    const nbPath = activeNotebookRef.current?.path
    if (!nbPath) return
    const nb = result.notebooks.find(n => n.path === nbPath)
    if (!nb) {                       // the open notebook was removed or renamed outside
      setActiveNotebook(result.notebooks[0] || null)
      setActivePage(null)
      return
    }
    setActiveNotebook(nb)

    const page = activePageRef.current
    if (!page) return
    const meta = nb.sections.flatMap(s => s.pages).find(p => p.path === page.path)
    if (!meta) {                     // the open page was removed or renamed outside
      if (!pendingRef.current) setActivePage(null)
      return
    }
    if (pendingRef.current?.path === page.path) return
    const touched = changed.some(c => c.toLowerCase() === page.path.toLowerCase())
    if (!touched) return

    const res = await window.api.readPage({ filePath: page.path })
    if (res?.error || res.content === page.content) return
    setActivePage(prev => (prev?.path === page.path && !pendingRef.current)
      ? { ...prev, content: res.content, reloadKey: (prev.reloadKey || 0) + 1 }
      : prev)
  }, [])

  useEffect(() => {
    const cb = (_e, changed) => handleExternalChange(changed)
    window.api.onMenu('fs-changed', cb)
    return () => window.api.offMenu('fs-changed', cb)
  }, [handleExternalChange])

  // ── Navigation (always flush first; stay put if the save failed) ────────────
  const guardedFlush = useCallback(async () => {
    const ok = await flushSave()
    if (!ok) showError('Could not save', 'Your changes could not be saved, so the page was not switched. Check that the folder is writable and try again.')
    return ok
  }, [flushSave, showError])

  const handleSelectPage = useCallback(async (pageMeta) => {
    if (!(await guardedFlush())) return
    const page = await readPageSafe(pageMeta)
    if (page) { setActivePage(page); setSaveStatus('saved') }
  }, [guardedFlush, readPageSafe])

  const handleSelectNotebook = useCallback(async (nb) => {
    if (!(await guardedFlush())) return
    setActiveNotebook(nb)
    const first = nb.sections.flatMap(s => s.pages)[0] || null
    setActivePage(first ? await readPageSafe(first) : null)
    setSaveStatus('saved')
  }, [guardedFlush, readPageSafe])

  // Jump to any page by path (used by search results)
  const openPageByPath = useCallback(async (pagePath) => {
    for (const nb of notebooksRef.current) {
      const pageMeta = nb.sections.flatMap(s => s.pages).find(p => p.path === pagePath)
      if (!pageMeta) continue
      if (!(await guardedFlush())) return
      const page = await readPageSafe(pageMeta)
      if (page) { setActiveNotebook(nb); setActivePage(page); setSaveStatus('saved') }
      return
    }
  }, [guardedFlush, readPageSafe])

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreatePage = useCallback(async (sectionPath, name = 'Untitled Page') => {
    if (!activeNotebook) return
    const sec = sectionPath ? { path: sectionPath } : activeNotebook.sections[0]
    if (!sec) return
    try {
      const result = await window.api.createPage({ sectionPath: sec.path, title: name })
      if (result) await loadNotebooks(activeNotebook.path, result.filePath)
    } catch {
      showError('Could not create page', 'The page could not be created. Check that the folder is writable.')
    }
  }, [activeNotebook, loadNotebooks, showError])

  const handleCreateNotebook = useCallback(async (name = 'New Notebook') => {
    try {
      const res = await window.api.createNotebook({ name })
      await loadNotebooks(res?.nbPath)
    } catch {
      showError('Could not create notebook', 'The notebook could not be created. Check that the folder is writable.')
    }
  }, [loadNotebooks, showError])

  const handleCreateSection = useCallback(async (notebookPath, name = 'New Section') => {
    try {
      await window.api.createSection({ notebookPath, name })
      await loadNotebooks(activeNotebook?.path, activePage?.path)
    } catch {
      showError('Could not create section', 'The section could not be created. Check that the folder is writable.')
    }
  }, [activeNotebook?.path, activePage?.path, loadNotebooks, showError])

  // ── Rename ──────────────────────────────────────────────────────────────────
  // The main process validates + builds the new path and returns it.
  const renameEntry = useCallback(async (kind, oldPath, newName, reload) => {
    await flushSave()
    try {
      const newPath = await window.api.rename({ oldPath, newName })
      await reload(newPath)
      return true
    } catch (e) {
      const msg = /already exists/i.test(e?.message || '')
        ? `A ${kind} named "${newName}" already exists here. Please choose a different name.`
        : `The ${kind} could not be renamed.`
      showError(/already exists/i.test(e?.message || '') ? 'Duplicate Name' : 'Rename failed', msg)
      return false
    }
  }, [flushSave, showError])

  const handleRenameNotebook = useCallback(async (nb, newName) => {
    const name = newName?.trim()
    if (!name || name === nb.name) return false
    return renameEntry('notebook', nb.path, name, (newPath) => {
      const isActive = activeNotebook?.path === nb.path
      return loadNotebooks(
        isActive ? newPath : activeNotebook?.path,
        remapPath(activePageRef.current?.path, nb.path, newPath)
      )
    })
  }, [activeNotebook?.path, loadNotebooks, renameEntry])

  const handleRenameSection = useCallback(async (sec, newName) => {
    const name = newName?.trim()
    if (!name || name === sec.name) return false
    return renameEntry('section', sec.path, name, (newPath) =>
      loadNotebooks(activeNotebook?.path, remapPath(activePageRef.current?.path, sec.path, newPath))
    )
  }, [activeNotebook?.path, loadNotebooks, renameEntry])

  // Page rename and title edit are the same operation: the title IS the filename.
  const handleRenamePage = useCallback(async (page, newName) => {
    const name = newName?.trim()
    if (!name || name === page.title) return false
    return renameEntry('page', page.path, name, (newPath) =>
      loadNotebooks(activeNotebook?.path, activePageRef.current?.path === page.path ? newPath : activePageRef.current?.path)
    )
  }, [activeNotebook?.path, loadNotebooks, renameEntry])

  const handleTitleChange = handleRenamePage

  // ── Delete (to Recycle Bin / Trash, with custom confirm modal) ─────────────
  const confirmDelete = useCallback((title, message, confirmLabel, targetPath, doDelete, reload) => {
    showConfirm(title, message, confirmLabel, async () => {
      closeConfirm()
      try {
        discardPendingIn(targetPath)   // never resurrect a deleted file with a late save
        await doDelete()
        await reload()
      } catch {
        showError('Delete failed', 'The item could not be moved to the Recycle Bin / Trash.')
      }
    })
  }, [closeConfirm, discardPendingIn, showConfirm, showError])

  const handleDeleteNotebook = useCallback((nb) => {
    confirmDelete(
      `Delete "${nb.name}"?`,
      'This moves the notebook and all its sections and pages to the Recycle Bin / Trash. You can restore it from there.',
      'Delete notebook',
      nb.path,
      () => window.api.deleteNotebook({ notebookPath: nb.path }),
      () => {
        const isActive = activeNotebook?.path === nb.path
        return loadNotebooks(isActive ? null : activeNotebook?.path, isActive ? null : activePageRef.current?.path)
      }
    )
  }, [activeNotebook?.path, confirmDelete, loadNotebooks])

  const handleDeleteSection = useCallback((sec) => {
    confirmDelete(
      `Delete "${sec.name}"?`,
      'This moves the section and all its pages to the Recycle Bin / Trash. You can restore it from there.',
      'Delete section',
      sec.path,
      () => window.api.deleteSection({ sectionPath: sec.path }),
      () => {
        const wasActive = isInside(activePageRef.current?.path, sec.path)
        return loadNotebooks(activeNotebook?.path, wasActive ? null : activePageRef.current?.path)
      }
    )
  }, [activeNotebook?.path, confirmDelete, loadNotebooks])

  const handleDeletePage = useCallback((page) => {
    confirmDelete(
      `Delete "${page.title}"?`,
      'This moves the page to the Recycle Bin / Trash. You can restore it from there.',
      'Delete page',
      page.path,
      () => window.api.deletePage({ filePath: page.path }),
      () => {
        const wasActive = activePageRef.current?.path === page.path
        return loadNotebooks(activeNotebook?.path, wasActive ? null : activePageRef.current?.path)
      }
    )
  }, [activeNotebook?.path, confirmDelete, loadNotebooks])

  return {
    // State
    notebooks,
    rootDir,
    activeNotebook,
    activePage,
    loading,
    confirmState,
    saveStatus,
    // Helpers
    closeConfirm,
    loadNotebooks,
    getActiveContent,
    // Handlers
    savePage,
    flushSave,
    handleContentChange,
    handleSelectPage,
    handleSelectNotebook,
    openPageByPath,
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

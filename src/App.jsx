import { useState, useEffect, useCallback, useMemo } from 'react'
import TitleBar from './components/TitleBar'
import NotebookSidebar from './components/NotebookSidebar'
import PageSidebar from './components/PageSidebar'
import Editor from './components/Editor'
import ConfirmModal from './components/ConfirmModal'
import WelcomeModal from './components/WelcomeModal'
import Settings from './components/Settings'
import SearchModal from './components/SearchModal'
import { useNotebooks } from './hooks/useNotebooks'
import styles from './styles/App.module.css'

export default function App() {
  const [settingsOpen, setSettingsOpen]   = useState(false)
  const [sidebarOpen, setSidebarOpen]     = useState(true)
  const [defaultMode, setDefaultMode]     = useState('visual')
  const [showWelcome, setShowWelcome]     = useState(false)
  const [searchMode, setSearchMode]       = useState(null) // null | 'content' | 'quick'

  const {
    notebooks,
    rootDir,
    activeNotebook,
    activePage,
    loading,
    confirmState,
    saveStatus,
    closeConfirm,
    loadNotebooks,
    getActiveContent,
    flushSave,
    savePage,
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
  } = useNotebooks()

  // Current Quick-open shortcut, shown inside the title-bar search pill.
  // Re-read whenever Settings closes, since that is where it can be rebound.
  const [quickOpenKeys, setQuickOpenKeys] = useState('')
  useEffect(() => {
    if (settingsOpen) return
    window.api.getShortcuts().then(list => {
      setQuickOpenKeys(list?.find(s => s.id === 'quickOpen')?.value || '')
    }).catch(() => {})
  }, [settingsOpen])

  // Flat page list for Ctrl+P quick open
  const quickPages = useMemo(() => notebooks.flatMap(nb =>
    nb.sections.flatMap(sec => sec.pages.map(p => ({
      path: p.path, title: p.title, notebook: nb.name, section: sec.name,
    })))
  ), [notebooks])

  // ── Apply saved settings on startup ────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      window.api.storeGet('theme'),
      window.api.storeGet('editorFontSize'),
      window.api.storeGet('editorDefaultMode'),
      window.api.storeGet('welcomeShown'),
    ]).then(([theme, fontSize, mode, welcomeShown]) => {
      if (theme && theme !== 'system') {
        document.documentElement.setAttribute('data-theme', theme)
      }
      if (fontSize) {
        const sizes = { small: '13px', medium: '15px', large: '17px' }
        document.documentElement.style.setProperty('--editor-font-size', sizes[fontSize] || '15px')
      }
      if (mode) setDefaultMode(mode)
      // Show welcome modal on very first launch
      if (!welcomeShown) setShowWelcome(true)
    })
  }, [])

  // Settings is a full page; opening it first saves any pending edit.
  const toggleSettings = useCallback(async () => {
    if (settingsOpen) { setSettingsOpen(false); return }
    await flushSave()
    setSettingsOpen(true)
  }, [settingsOpen, flushSave])

  const handleCloseWelcome =useCallback(() => {
    setShowWelcome(false)
    // Mark as shown so it never appears again
    window.api.storeSet('welcomeShown', true)
  }, [])

  // ── Menu event listeners ────────────────────────────────────────────────────
  useEffect(() => {
    // (File → Save is handled inside <Editor>, which owns the live content.)
    const handleNewPage    = () => handleCreatePage()
    const handleSearch     = () => setSearchMode('content')
    const handleQuickOpen  = () => setSearchMode('quick')
    const handleOpenFolder = async () => { await flushSave(); await window.api.chooseFolder(); loadNotebooks() }
    const handleExportMd   = async () => {
      if (!activePage) return
      await window.api.exportMd({ title: activePage.title, content: getActiveContent() })
    }

    window.api.onMenu('new-page',    handleNewPage)
    window.api.onMenu('search',      handleSearch)
    window.api.onMenu('quick-open',  handleQuickOpen)
    window.api.onMenu('open-folder', handleOpenFolder)
    window.api.onMenu('export-md',   handleExportMd)
    return () => {
      window.api.offMenu('new-page',    handleNewPage)
      window.api.offMenu('search',      handleSearch)
      window.api.offMenu('quick-open',  handleQuickOpen)
      window.api.offMenu('open-folder', handleOpenFolder)
      window.api.offMenu('export-md',   handleExportMd)
    }
  }, [activePage, flushSave, getActiveContent, handleCreatePage, loadNotebooks])

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className={styles.loading}>
      <div className={styles.loadingTitle}>Paperfold</div>
      <div className={styles.loadingText}>Loading your notebooks…</div>
    </div>
  )

  return (
    <div className={styles.app}>
      <TitleBar
        title={settingsOpen ? 'Settings' : (activePage?.title || 'Search pages…')}
        shortcut={quickOpenKeys}
        onOpenSearch={() => setSearchMode('quick')}
        onOpenSettings={toggleSettings}
      />
      {/* Notes stay mounted (just hidden) while Settings is open, so the editor
          keeps its mode, undo history and scroll position. */}
      <div className={styles.body} style={settingsOpen ? { display: 'none' } : undefined}>
        <NotebookSidebar
          isOpen={sidebarOpen}
          notebooks={notebooks}
          activeNotebook={activeNotebook}
          onSelectNotebook={handleSelectNotebook}
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
          saveStatus={saveStatus}
          onContentChange={handleContentChange}
          onSave={savePage}
          onTitleChange={handleTitleChange}
        />
      </div>

      {/* Settings page */}
      {settingsOpen && (
        <Settings
          rootDir={rootDir}
          onClose={() => setSettingsOpen(false)}
          onFolderChange={loadNotebooks}
          onDefaultModeChange={setDefaultMode}
        />
      )}

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

      {/* Search (Ctrl+Shift+F) */}
      {searchMode && (
        <SearchModal
          initialMode={searchMode}
          pages={quickPages}
          onSelect={(p) => { setSettingsOpen(false); openPageByPath(p) }}
          onClose={() => setSearchMode(null)}
        />
      )}

      {/* Welcome modal — shown on very first launch */}
      {showWelcome && (
        <WelcomeModal onClose={handleCloseWelcome} />
      )}
    </div>
  )
}

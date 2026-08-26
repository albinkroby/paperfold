import { useState, useEffect, useCallback } from 'react'
import TitleBar from './components/TitleBar'
import NotebookSidebar from './components/NotebookSidebar'
import PageSidebar from './components/PageSidebar'
import Editor from './components/Editor'
import ConfirmModal from './components/ConfirmModal'
import WelcomeModal from './components/WelcomeModal'
import Settings from './components/Settings'
import { useNotebooks } from './hooks/useNotebooks'
import styles from './styles/App.module.css'

export default function App() {
  const [settingsOpen, setSettingsOpen]   = useState(false)
  const [sidebarOpen, setSidebarOpen]     = useState(true)
  const [defaultMode, setDefaultMode]     = useState('visual')
  const [showWelcome, setShowWelcome]     = useState(false)

  const {
    notebooks,
    rootDir,
    activeNotebook,
    activePage,
    loading,
    confirmState,
    setActiveNotebook,
    setActivePage,
    closeConfirm,
    loadNotebooks,
    savePage,
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
  } = useNotebooks()

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

  const handleCloseWelcome = useCallback(() => {
    setShowWelcome(false)
    // Mark as shown so it never appears again
    window.api.storeSet('welcomeShown', true)
  }, [])

  // ── Menu event listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const handleSave       = () => activePage && savePage(activePage)
    const handleNewPage    = () => handleCreatePage()
    const handleOpenFolder = async () => { await window.api.chooseFolder(); loadNotebooks() }
    const handleExportMd   = async () => {
      if (!activePage) return
      await window.api.exportMd({ title: activePage.title, content: activePage.content || '' })
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
  }, [activePage, handleCreatePage, loadNotebooks, savePage])

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

      {/* Welcome modal — shown on very first launch */}
      {showWelcome && (
        <WelcomeModal onClose={handleCloseWelcome} />
      )}
    </div>
  )
}

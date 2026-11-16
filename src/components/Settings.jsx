import { useState, useEffect } from 'react'
import { FolderOpen, Moon, Sun, Monitor, FileCode, Eye, Info, Palette, Type, Gauge, ArrowLeft } from 'lucide-react'
import styles from './Settings.module.css'

// ── Segmented control ─────────────────────────────────────────────────────────
function SegmentedControl({ options, value, onChange }) {
  return (
    <div className={styles.segmented}>
      {options.map(opt => (
        <button
          key={opt.value}
          className={`${styles.segBtn} ${value === opt.value ? styles.segActive : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon && <span className={styles.segIcon}>{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Setting row ───────────────────────────────────────────────────────────────
function Row({ label, description, children }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        <span className={styles.rowName}>{label}</span>
        {description && <span className={styles.rowDesc}>{description}</span>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  )
}

const CATEGORIES = [
  { id: 'appearance',  label: 'Appearance',  icon: Palette },
  { id: 'editor',      label: 'Editor',      icon: Type },
  { id: 'notebooks',   label: 'Notebooks',   icon: FolderOpen },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'about',       label: 'About',       icon: Info },
]

// ── Settings page ─────────────────────────────────────────────────────────────
export default function Settings({ onClose, rootDir, onFolderChange, onDefaultModeChange }) {
  const [category,    setCategory]         = useState('appearance')
  const [theme,       setThemeState]       = useState('system')
  const [editorMode,  setEditorModeState]  = useState('visual')
  const [fontSize,    setFontSizeState]    = useState('medium')
  const [currentDir,  setCurrentDir]       = useState(rootDir)
  const [appVersion,  setAppVersion]       = useState('')
  const [hwAccel,     setHwAccel]          = useState(false)
  const [hwAccelChanged, setHwAccelChanged] = useState(false)

  // Load saved settings on mount
  useEffect(() => {
    Promise.all([
      window.api.storeGet('theme'),
      window.api.storeGet('editorDefaultMode'),
      window.api.storeGet('editorFontSize'),
      window.api.getVersion(),
      window.api.storeGet('hardwareAcceleration'),
    ]).then(([t, m, f, v, hw]) => {
      if (t) setThemeState(t)
      if (m) setEditorModeState(m)
      if (f) setFontSizeState(f)
      if (v) setAppVersion(v)
      setHwAccel(!!hw)
    })
  }, [])

  useEffect(() => { setCurrentDir(rootDir) }, [rootDir])

  const setHardwareAcceleration = (value) => {
    const on = value === 'on'
    setHwAccel(on)
    setHwAccelChanged(true)
    window.api.storeSet('hardwareAcceleration', on)
  }

  // Apply theme immediately when changed
  const setTheme = (value) => {
    setThemeState(value)
    window.api.storeSet('theme', value)
    if (value === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', value)
    }
  }

  const setEditorMode = (value) => {
    setEditorModeState(value)
    window.api.storeSet('editorDefaultMode', value)
    onDefaultModeChange?.(value)
  }

  const setFontSize = (value) => {
    setFontSizeState(value)
    window.api.storeSet('editorFontSize', value)
    const sizes = { small: '13px', medium: '15px', large: '17px' }
    document.documentElement.style.setProperty('--editor-font-size', sizes[value])
  }

  const handleChangeFolder = async () => {
    const newDir = await window.api.chooseFolder()
    if (newDir) {
      setCurrentDir(newDir)
      onFolderChange()
    }
  }

  // Back to notes on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const current = CATEGORIES.find(c => c.id === category)

  return (
    <div className={styles.page}>

      {/* Left: category navigation */}
      <nav className={styles.nav} aria-label="Settings categories">
        <button className={styles.backBtn} onClick={onClose} title="Back to notes (Esc)">
          <ArrowLeft size={14} /> Back to notes
        </button>
        <div className={styles.navTitle}>Settings</div>
        {CATEGORIES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`${styles.navItem} ${category === id ? styles.navActive : ''}`}
            onClick={() => setCategory(id)}
            aria-current={category === id ? 'page' : undefined}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {/* Right: selected category */}
      <main className={styles.content}>
        <div className={styles.contentInner}>
          <h2 className={styles.pageTitle}>{current.label}</h2>

          {category === 'appearance' && (
            <div className={styles.sectionBody}>
              <Row label="Theme" description="Choose how Paperfold looks. System follows your OS setting.">
                <SegmentedControl
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'light',  label: 'Light',  icon: <Sun size={13} /> },
                    { value: 'system', label: 'System', icon: <Monitor size={13} /> },
                    { value: 'dark',   label: 'Dark',   icon: <Moon size={13} /> },
                  ]}
                />
              </Row>
            </div>
          )}

          {category === 'editor' && (
            <div className={styles.sectionBody}>
              <Row label="Default mode" description="Mode used when opening a page for the first time.">
                <SegmentedControl
                  value={editorMode}
                  onChange={setEditorMode}
                  options={[
                    { value: 'visual',   label: 'Visual',   icon: <Eye size={13} /> },
                    { value: 'markdown', label: 'Markdown', icon: <FileCode size={13} /> },
                  ]}
                />
              </Row>
              <Row label="Font size" description="Size of text in the editor.">
                <SegmentedControl
                  value={fontSize}
                  onChange={setFontSize}
                  options={[
                    { value: 'small',  label: 'Small'  },
                    { value: 'medium', label: 'Medium' },
                    { value: 'large',  label: 'Large'  },
                  ]}
                />
              </Row>
            </div>
          )}

          {category === 'notebooks' && (
            <div className={styles.sectionBody}>
              <Row label="Storage folder" description="Where your notebooks are saved on disk.">
                <div className={styles.folderRow}>
                  <span className={styles.folderPath} title={currentDir}>{currentDir}</span>
                  <button className={styles.folderBtn} onClick={handleChangeFolder}>
                    <FolderOpen size={13} />
                    Change…
                  </button>
                </div>
              </Row>
            </div>
          )}

          {category === 'performance' && (
            <div className={styles.sectionBody}>
              <Row
                label="Hardware acceleration"
                description="Off by default: some Windows GPU drivers crash the window. Turn on for smoother scrolling if yours is stable. Needs a restart."
              >
                <div className={styles.folderRow}>
                  <SegmentedControl
                    value={hwAccel ? 'on' : 'off'}
                    onChange={setHardwareAcceleration}
                    options={[
                      { value: 'off', label: 'Off' },
                      { value: 'on',  label: 'On'  },
                    ]}
                  />
                  {hwAccelChanged && (
                    <button className={styles.folderBtn} onClick={() => window.api.relaunch()}>
                      Restart now
                    </button>
                  )}
                </div>
              </Row>
            </div>
          )}

          {category === 'about' && (
            <div className={styles.about}>
              <div className={styles.aboutLogo}>
                <span className={styles.aboutMark}>P</span>
              </div>
              <div className={styles.aboutInfo}>
                <div className={styles.aboutHeader}>
                  <h4 className={styles.aboutAppName}>Paperfold</h4>
                  <span className={styles.aboutVersion}>v{appVersion || '1.0.0'}</span>
                </div>
                <p className={styles.aboutDesc}>
                  A Markdown-native notebook app. All notes save as <code>.md</code> files.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

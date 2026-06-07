import { useState, useEffect } from 'react'
import { X, FolderOpen, Moon, Sun, Monitor, Type, FileCode, Eye, Info } from 'lucide-react'
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

// ── Section header ────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.sectionBody}>{children}</div>
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

// ── Main Settings component ───────────────────────────────────────────────────
export default function Settings({ onClose, rootDir, onFolderChange }) {
  const [theme,       setThemeState]       = useState('system')
  const [editorMode,  setEditorModeState]  = useState('visual')
  const [fontSize,    setFontSizeState]    = useState('medium')
  const [currentDir,  setCurrentDir]       = useState(rootDir)

  // Load saved settings on mount
  useEffect(() => {
    Promise.all([
      window.api.storeGet('theme'),
      window.api.storeGet('editorDefaultMode'),
      window.api.storeGet('editorFontSize'),
    ]).then(([t, m, f]) => {
      if (t) setThemeState(t)
      if (m) setEditorModeState(m)
      if (f) setFontSizeState(f)
    })
  }, [])

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

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Settings">

        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Settings</h2>
          <button className={styles.closeBtn} onClick={onClose} title="Close (Esc)">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>

          {/* Appearance */}
          <Section title="Appearance">
            <Row
              label="Theme"
              description="Choose how Folio looks. System follows your OS setting."
            >
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
          </Section>

          {/* Editor */}
          <Section title="Editor">
            <Row
              label="Default mode"
              description="Mode used when opening a page for the first time."
            >
              <SegmentedControl
                value={editorMode}
                onChange={setEditorMode}
                options={[
                  { value: 'visual',    label: 'Visual',    icon: <Eye size={13} /> },
                  { value: 'markdown',  label: 'Markdown',  icon: <FileCode size={13} /> },
                ]}
              />
            </Row>
            <Row
              label="Font size"
              description="Size of text in the editor."
            >
              <SegmentedControl
                value={fontSize}
                onChange={setFontSize}
                options={[
                  { value: 'small',   label: 'Small'  },
                  { value: 'medium',  label: 'Medium' },
                  { value: 'large',   label: 'Large'  },
                ]}
              />
            </Row>
          </Section>

          {/* Notebooks */}
          <Section title="Notebooks">
            <Row
              label="Storage folder"
              description="Where your notebooks are saved on disk."
            >
              <div className={styles.folderRow}>
                <span className={styles.folderPath} title={currentDir}>{currentDir}</span>
                <button className={styles.folderBtn} onClick={handleChangeFolder}>
                  <FolderOpen size={13} />
                  Change…
                </button>
              </div>
            </Row>
          </Section>

          {/* About */}
          <Section title="About">
            <div className={styles.about}>
              <div className={styles.aboutLogo}>
                <span className={styles.aboutMark}>F</span>olio
              </div>
              <div className={styles.aboutInfo}>
                <p className={styles.aboutVersion}>Version 1.0.0</p>
                <p className={styles.aboutDesc}>
                  A Markdown-native notebook app. All notes save as <code>.md</code> files — open them in VS Code, Obsidian, or any editor.
                </p>
              </div>
            </div>
          </Section>

        </div>
      </div>
    </div>
  )
}

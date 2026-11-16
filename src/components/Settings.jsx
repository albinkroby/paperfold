import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FolderOpen, Moon, Sun, Monitor, FileCode, Eye, Info, Palette, Type, Gauge,
  Keyboard, ArrowLeft, RotateCcw,
} from 'lucide-react'
import { accelParts } from '../utils/accelerator'
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

// ── Setting row (lives inside a card) ─────────────────────────────────────────
function Row({ label, description, error, children }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowLabel}>
        <span className={styles.rowName}>{label}</span>
        {description && <span className={styles.rowDesc}>{description}</span>}
        {error && <span className={styles.rowError}>{error}</span>}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  )
}

// ── Keyboard helpers ──────────────────────────────────────────────────────────
function Keys({ accelerator }) {
  return (
    <span className={styles.keys}>
      {accelParts(accelerator).map((part, i) => (
        <kbd key={i} className={styles.kbd}>{part}</kbd>
      ))}
    </span>
  )
}

const CODE_KEYS = {
  Equal: '=', Minus: '-', Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`',
}
const NAMED_KEYS = {
  ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
}

/** KeyboardEvent → Electron accelerator string, or null for modifier-only / unsupported keys. */
function eventToAccelerator(e) {
  let key = null
  if (/^Key[A-Z]$/.test(e.code))        key = e.code.slice(3)
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5)
  else if (/^F\d{1,2}$/.test(e.key))    key = e.key
  else if (CODE_KEYS[e.code])           key = CODE_KEYS[e.code]
  else if (NAMED_KEYS[e.key])           key = NAMED_KEYS[e.key]
  if (!key) return null

  const mods = []
  if (e.ctrlKey || e.metaKey) mods.push('CmdOrCtrl')
  if (e.altKey)               mods.push('Alt')
  if (e.shiftKey)             mods.push('Shift')
  return [...mods, key].join('+')
}

// Fixed shortcuts, shown for reference
const FIXED_SHORTCUTS = [
  ['Bold',               'CmdOrCtrl+B'],
  ['Italic',             'CmdOrCtrl+I'],
  ['Underline',          'CmdOrCtrl+U'],
  ['Undo',               'CmdOrCtrl+Z'],
  ['Redo',               'CmdOrCtrl+Shift+Z'],
  ['Select all',         'CmdOrCtrl+A'],
  ['Zoom in',            'CmdOrCtrl+='],
  ['Zoom out',           'CmdOrCtrl+-'],
  ['Reset zoom',         'CmdOrCtrl+0'],
  ['Reload window',      'CmdOrCtrl+R'],
  ['Quit',               'CmdOrCtrl+Q'],
  ['Leave settings',     'Esc'],
]

const SECTIONS = [
  { id: 'appearance',  label: 'Appearance',          icon: Palette },
  { id: 'editor',      label: 'Editor',              icon: Type },
  { id: 'shortcuts',   label: 'Keyboard shortcuts',  icon: Keyboard },
  { id: 'notebooks',   label: 'Notebooks',           icon: FolderOpen },
  { id: 'performance', label: 'Performance',         icon: Gauge },
  { id: 'about',       label: 'About',               icon: Info },
]

// ── Settings page ─────────────────────────────────────────────────────────────
// One long scrolling page; the left list scrolls to a section and highlights
// whichever section is currently in view.
export default function Settings({ onClose, rootDir, onFolderChange, onDefaultModeChange }) {
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id)
  const [theme,       setThemeState]       = useState('system')
  const [editorMode,  setEditorModeState]  = useState('visual')
  const [fontSize,    setFontSizeState]    = useState('medium')
  const [currentDir,  setCurrentDir]       = useState(rootDir)
  const [appVersion,  setAppVersion]       = useState('')
  const [hwAccel,     setHwAccel]          = useState(false)
  const [hwAccelChanged, setHwAccelChanged] = useState(false)
  const [shortcuts,   setShortcuts]        = useState([])
  const [recordingId, setRecordingId]      = useState(null)
  const [shortcutErrors, setShortcutErrors] = useState({})

  const scrollRef   = useRef(null)
  const sectionRefs = useRef({})

  // Load saved settings on mount
  useEffect(() => {
    Promise.all([
      window.api.storeGet('theme'),
      window.api.storeGet('editorDefaultMode'),
      window.api.storeGet('editorFontSize'),
      window.api.getVersion(),
      window.api.storeGet('hardwareAcceleration'),
      window.api.getShortcuts(),
    ]).then(([t, m, f, v, hw, sc]) => {
      if (t) setThemeState(t)
      if (m) setEditorModeState(m)
      if (f) setFontSizeState(f)
      if (v) setAppVersion(v)
      setHwAccel(!!hw)
      setShortcuts(sc || [])
    })
  }, [])

  useEffect(() => { setCurrentDir(rootDir) }, [rootDir])

  // ── Scroll-spy + nav ────────────────────────────────────────────────────────
  const updateActiveSection = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const probe = el.scrollTop + 96
    let current = SECTIONS[0].id
    for (const { id } of SECTIONS) {
      const node = sectionRefs.current[id]
      if (node && node.offsetTop <= probe) current = id
    }
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) current = SECTIONS[SECTIONS.length - 1].id
    setActiveSection(current)
  }, [])

  const scrollToSection = (id) => {
    const node = sectionRefs.current[id]
    const el = scrollRef.current
    if (!node || !el) return
    setActiveSection(id)
    el.scrollTo({ top: node.offsetTop - 24, behavior: 'smooth' })
  }

  // ── Setters ────────────────────────────────────────────────────────────────
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

  // ── Shortcut recording ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!recordingId) return
    const onKey = async (e) => {
      // Capture phase: swallow everything so the key never reaches the menu,
      // the editor, or the Esc-to-leave handler below.
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecordingId(null); return }
      const accelerator = eventToAccelerator(e)
      if (!accelerator) return                      // modifier only: keep listening
      const res = await window.api.setShortcut(recordingId, accelerator)
      if (res.ok) { setShortcuts(res.shortcuts); setShortcutErrors({}) }
      else setShortcutErrors({ [recordingId]: res.error })
      setRecordingId(null)
      document.activeElement?.blur?.()   // so a trailing Space/Enter keyup can't re-click the button
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recordingId])

  const resetShortcut = async (id) => {
    const res = await window.api.setShortcut(id, null)
    if (res.ok) setShortcuts(res.shortcuts)
    setShortcutErrors({})
  }

  const resetAllShortcuts = async () => {
    const res = await window.api.resetShortcuts()
    if (res.ok) setShortcuts(res.shortcuts)
    setShortcutErrors({})
  }

  // Back to notes on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const section = (id) => (node) => { sectionRefs.current[id] = node }

  return (
    <div className={styles.page}>

      {/* Left: section list */}
      <nav className={styles.nav} aria-label="Settings sections">
        <button className={styles.backBtn} onClick={onClose} title="Back to notes (Esc)">
          <ArrowLeft size={14} /> Back to notes
        </button>
        <div className={styles.navTitle}>Settings</div>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`${styles.navItem} ${activeSection === id ? styles.navActive : ''}`}
            onClick={() => scrollToSection(id)}
            aria-current={activeSection === id ? 'true' : undefined}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {/* Right: everything, scrollable */}
      <main className={styles.content} ref={scrollRef} onScroll={updateActiveSection}>
        <div className={styles.contentInner}>

          {/* Appearance */}
          <section className={styles.section} ref={section('appearance')}>
            <h2 className={styles.sectionTitle}>Appearance</h2>
            <div className={styles.card}>
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
          </section>

          {/* Editor */}
          <section className={styles.section} ref={section('editor')}>
            <h2 className={styles.sectionTitle}>Editor</h2>
            <div className={styles.card}>
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
          </section>

          {/* Keyboard shortcuts */}
          <section className={styles.section} ref={section('shortcuts')}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Keyboard shortcuts</h2>
              <button className={styles.textBtn} onClick={resetAllShortcuts}>
                <RotateCcw size={12} /> Reset all
              </button>
            </div>
            <p className={styles.sectionDesc}>
              Click a shortcut, then press the new key combination. Press Esc to cancel.
            </p>
            <div className={styles.card}>
              {shortcuts.map(sc => {
                const recording = recordingId === sc.id
                const isDefault = sc.value === sc.default
                return (
                  <Row key={sc.id} label={sc.label} description={sc.description} error={shortcutErrors[sc.id]}>
                    <div className={styles.shortcutControls}>
                      <button
                        className={`${styles.keyBtn} ${recording ? styles.keyBtnRecording : ''}`}
                        onClick={() => { setShortcutErrors({}); setRecordingId(recording ? null : sc.id) }}
                        onBlur={() => recording && setRecordingId(null)}
                        title="Click to change"
                      >
                        {recording ? 'Press keys…' : <Keys accelerator={sc.value} />}
                      </button>
                      <button
                        className={styles.iconBtn}
                        onClick={() => resetShortcut(sc.id)}
                        disabled={isDefault}
                        title={isDefault ? 'Already the default' : 'Reset to default'}
                      >
                        <RotateCcw size={13} />
                      </button>
                    </div>
                  </Row>
                )
              })}
            </div>

            <h3 className={styles.subTitle}>Built-in shortcuts</h3>
            <div className={`${styles.card} ${styles.fixedGrid}`}>
              {FIXED_SHORTCUTS.map(([name, accel]) => (
                <div key={name} className={styles.fixedItem}>
                  <span className={styles.fixedName}>{name}</span>
                  <Keys accelerator={accel} />
                </div>
              ))}
            </div>
          </section>

          {/* Notebooks */}
          <section className={styles.section} ref={section('notebooks')}>
            <h2 className={styles.sectionTitle}>Notebooks</h2>
            <div className={styles.card}>
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
          </section>

          {/* Performance */}
          <section className={styles.section} ref={section('performance')}>
            <h2 className={styles.sectionTitle}>Performance</h2>
            <div className={styles.card}>
              <Row
                label="Hardware acceleration"
                description="Off by default: some Windows GPU drivers crash the window. Turn on for smoother scrolling if yours is stable. Needs a restart."
              >
                <div className={styles.shortcutControls}>
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
          </section>

          {/* About */}
          <section className={styles.section} ref={section('about')}>
            <h2 className={styles.sectionTitle}>About</h2>
            <div className={`${styles.card} ${styles.aboutCard}`}>
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
            </div>
          </section>

          <div className={styles.endSpacer} />
        </div>
      </main>
    </div>
  )
}

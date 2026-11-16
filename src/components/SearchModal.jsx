import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, FileText } from 'lucide-react'
import styles from './SearchModal.module.css'

/**
 * Two modes, switchable inside the popup (toggle or Tab):
 *  "quick":   instant jump-to-page by title/notebook/section (local list)
 *  "content": full-text search across every page (via main process)
 * `initialMode` is which one opens first (Ctrl+P → quick, Ctrl+Shift+F → content).
 */
export default function SearchModal({ initialMode = 'quick', pages = [], onSelect, onClose }) {
  const [mode, setMode]       = useState(initialMode)
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [active, setActive]   = useState(0)
  const [busy, setBusy]       = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // "Pages" mode is computed synchronously (no flash of an empty list on open)
  const quickResults = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return pages
      .filter(p => !needle || `${p.title} ${p.notebook} ${p.section}`.toLowerCase().includes(needle))
      .slice(0, 50)
      .map(p => ({ ...p, snippet: '' }))
  }, [pages, query])

  // "Full text" mode: debounced main-process search; stale responses are ignored
  useEffect(() => {
    if (mode !== 'content') return
    const q = query.trim()
    if (q.length < 2) { setResults([]); setBusy(false); return }
    let cancelled = false
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const res = await window.api.search({ query: q })
        if (!cancelled) setResults(res)
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, mode])

  useEffect(() => { setActive(0) }, [query, mode])

  const shown = mode === 'quick' ? quickResults : results

  const choose = (r) => { onSelect(r.path); onClose() }

  const toggleMode = () => setMode(m => (m === 'quick' ? 'content' : 'quick'))

  const onKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'Tab') { e.preventDefault(); toggleMode() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && shown[active]) choose(shown[active])
  }

  const q = query.trim()

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={e => e.stopPropagation()}>
        <div className={styles.inputRow}>
          <Search size={16} className={styles.icon} />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={mode === 'quick' ? 'Go to page…' : 'Search all notebooks…'}
            spellCheck={false}
          />
          {/* onMouseDown preventDefault keeps focus in the input so Esc/arrows still work */}
          <div className={styles.modeToggle} title="Switch search type (Tab)">
            <button
              className={`${styles.modeBtn} ${mode === 'quick' ? styles.modeActive : ''}`}
              onMouseDown={e => { e.preventDefault(); setMode('quick') }}
            >
              Pages
            </button>
            <button
              className={`${styles.modeBtn} ${mode === 'content' ? styles.modeActive : ''}`}
              onMouseDown={e => { e.preventDefault(); setMode('content') }}
            >
              Full text
            </button>
          </div>
        </div>

        <div className={styles.results}>
          {mode === 'content' && q.length < 2 && <div className={styles.hint}>Type at least 2 characters</div>}
          {(mode === 'quick' || q.length >= 2) && !busy && shown.length === 0 && (
            <div className={styles.hint}>{q ? `No pages match “${q}”` : 'No pages yet'}</div>
          )}
          {shown.map((r, i) => (
            <button
              key={r.path}
              className={`${styles.result} ${i === active ? styles.active : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(r)}
            >
              <FileText size={14} className={styles.fileIcon} />
              <span className={styles.body}>
                <span className={styles.title}>{r.title}</span>
                <span className={styles.crumb}>{r.notebook} / {r.section}</span>
                {r.snippet && <span className={styles.snippet}>{r.snippet}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

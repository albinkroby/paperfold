import { useState, useEffect, useRef } from 'react'
import { Search, FileText } from 'lucide-react'
import styles from './SearchModal.module.css'

/**
 * mode="content": full-text search across every page (Ctrl+Shift+F, via main process)
 * mode="quick":   instant jump-to-page by title/notebook/section (Ctrl+P, local list)
 */
export default function SearchModal({ mode = 'content', pages = [], onSelect, onClose }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [active, setActive]   = useState(0)
  const [busy, setBusy]       = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Debounced search; stale responses are ignored
  useEffect(() => {
    const q = query.trim()
    if (mode === 'quick') {
      const needle = q.toLowerCase()
      setResults(
        pages
          .filter(p => !needle || `${p.title} ${p.notebook} ${p.section}`.toLowerCase().includes(needle))
          .slice(0, 50)
          .map(p => ({ ...p, snippet: '' }))
      )
      setActive(0)
      return
    }
    if (q.length < 2) { setResults([]); setBusy(false); return }
    let cancelled = false
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const res = await window.api.search({ query: q })
        if (!cancelled) { setResults(res); setActive(0) }
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, mode, pages])

  const choose = (r) => { onSelect(r.path); onClose() }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && results[active]) choose(results[active])
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
        </div>

        <div className={styles.results}>
          {mode === 'content' && q.length < 2 && <div className={styles.hint}>Type at least 2 characters</div>}
          {(mode === 'quick' || q.length >= 2) && !busy && results.length === 0 && (
            <div className={styles.hint}>{q ? `No pages match “${q}”` : 'No pages yet'}</div>
          )}
          {results.map((r, i) => (
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

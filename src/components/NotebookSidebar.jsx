import { useState, useRef, useEffect } from 'react'
import { BookOpen, Plus, MoreHorizontal } from 'lucide-react'
import styles from './NotebookSidebar.module.css'

// ── Inline editable input (VS Code style) ────────────────────────────────────
function InlineInput({ defaultValue, placeholder, onConfirm, onCancel, icon }) {
  const [value, setValue] = useState(defaultValue)
  const ref = useRef(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    // Slight delay so the element is mounted before we focus
    setTimeout(() => {
      ref.current?.focus()
      ref.current?.select()
    }, 30)
  }, [])

  const confirm = () => {
    if (cancelledRef.current) return
    const v = value.trim()
    if (v) onConfirm(v)
    else onCancel()
  }

  return (
    <div className={styles.inlineRow}>
      {icon && <span className={styles.inlineIcon}>{icon}</span>}
      <input
        ref={ref}
        className={styles.inlineInput}
        value={value}
        placeholder={placeholder}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); confirm() }
          if (e.key === 'Escape') { cancelledRef.current = true; onCancel() }
          e.stopPropagation()
        }}
        onBlur={confirm}
      />
    </div>
  )
}

// ── Context menu ─────────────────────────────────────────────────────────────
function CtxMenu({ x, y, onRename, onDelete, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    // Slight delay so the triggering mousedown doesn't immediately close it
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  return (
    <div ref={ref} className={styles.ctxMenu} style={{ top: y, left: x }}>
      <button className={styles.ctxItem} onMouseDown={e => e.stopPropagation()} onClick={() => { onRename(); onClose() }}>
        Rename
      </button>
      <button className={`${styles.ctxItem} ${styles.ctxDanger}`} onMouseDown={e => e.stopPropagation()} onClick={() => { onDelete(); onClose() }}>
        Delete
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function NotebookSidebar({
  isOpen = true,
  notebooks, activeNotebook,
  onSelectNotebook, onCreateNotebook, onRenameNotebook, onDeleteNotebook,
}) {
  // editing: null | 'new' | nb.path (for rename)
  const [editing, setEditing] = useState(null)
  const [menu, setMenu]       = useState(null) // { nb, x, y }

  const openMenu = (e, nb) => {
    e.stopPropagation()
    const rect      = e.currentTarget.getBoundingClientRect()
    const menuW     = 140  // approximate menu width
    const menuH     = 72   // approximate menu height (2 items)
    const x = Math.min(rect.right + 4, window.innerWidth  - menuW - 8)
    const y = Math.min(rect.top,       window.innerHeight - menuH - 8)
    setMenu({ nb, x, y })
  }

  return (
    <div className={`${styles.sidebar} ${!isOpen ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <span>Notebooks</span>
        <button className={styles.addBtn} onClick={() => setEditing('new')} title="New notebook (VS Code style)">
          <Plus size={14} />
        </button>
      </div>

      <div className={styles.list}>
        {notebooks.map(nb => {
          const isActive  = activeNotebook?.path === nb.path
          const isEditing = editing === nb.path

          return (
            <div key={nb.path} className={`${styles.row} ${isActive ? styles.rowActive : ''}`}>
              {isEditing ? (
                <InlineInput
                  defaultValue={nb.name}
                  placeholder="Notebook name"
                  icon={<BookOpen size={14} />}
                  onConfirm={name => { onRenameNotebook(nb, name); setEditing(null) }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <>
                  <button className={styles.item} onClick={() => onSelectNotebook(nb)}>
                    <BookOpen size={14} className={styles.itemIcon} />
                    <span className={styles.name}>{nb.name}</span>
                  </button>
                  <button
                    className={styles.moreBtn}
                    onClick={e => openMenu(e, nb)}
                    title="Options"
                  >
                    <MoreHorizontal size={13} />
                  </button>
                </>
              )}
            </div>
          )
        })}

        {/* New notebook inline input */}
        {editing === 'new' && (
          <div className={styles.row}>
            <InlineInput
              defaultValue="New Notebook"
              placeholder="Notebook name"
              icon={<BookOpen size={14} />}
              onConfirm={name => { onCreateNotebook(name); setEditing(null) }}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}
      </div>

      {menu && (
        <CtxMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRename={() => { setEditing(menu.nb.path); setMenu(null) }}
          onDelete={() => { onDeleteNotebook(menu.nb); setMenu(null) }}
        />
      )}
    </div>
  )
}

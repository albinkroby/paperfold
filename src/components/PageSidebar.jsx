import { useState, useRef, useEffect } from 'react'
import { FileText, Plus, FolderPlus, MoreHorizontal, Folder, PanelLeft, PanelLeftClose } from 'lucide-react'
import styles from './PageSidebar.module.css'

// ── Inline editable input (VS Code style) ────────────────────────────────────
function InlineInput({ defaultValue, placeholder, onConfirm, onCancel, icon, indent }) {
  const [value, setValue] = useState(defaultValue)
  const ref = useRef(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
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
    <div className={styles.inlineRow} style={indent ? { paddingLeft: 16 } : {}}>
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
export default function PageSidebar({
  sidebarOpen, onToggleSidebar,
  notebook, activePage,
  onSelectPage, onCreatePage, onCreateSection,
  onRenamePage, onDeletePage,
  onRenameSection, onDeleteSection,
}) {
  // editing: null
  //   | { type: 'new-section' }
  //   | { type: 'new-page',    sectionPath: string }
  //   | { type: 'rename-section', sec: object }
  //   | { type: 'rename-page',    page: object }
  const [editing, setEditing] = useState(null)
  const [menu,    setMenu]    = useState(null) // { kind, item, x, y }

  const openMenu = (e, kind, item) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenu({ kind, item, x: rect.right + 4, y: rect.top })
  }

  if (!notebook) return <div className={styles.sidebar} />

  return (
    <div className={styles.sidebar}>
      {/* Header */}
      <div className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
          <button
            className={styles.sidebarToggleBtn}
            onClick={onToggleSidebar}
            title={sidebarOpen ? "Hide Notebooks" : "Show Notebooks"}
          >
            {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
          </button>
          <span className={styles.nbName}>{notebook.name}</span>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.iconBtn}
            onClick={() => setEditing({ type: 'new-page', sectionPath: notebook.sections[0]?.path })}
            title="New page"
          >
            <Plus size={13} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => setEditing({ type: 'new-section' })}
            title="New section"
          >
            <FolderPlus size={13} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className={styles.list}>
        {notebook.sections.length === 0 && !editing && (
          <div className={styles.emptyNotebook}>No sections yet — click the folder icon above</div>
        )}

        {notebook.sections.map(sec => {
          const isRenaming = editing?.type === 'rename-section' && editing.sec.path === sec.path

          return (
            <div key={sec.path}>
              {/* ── Section row ── */}
              <div className={styles.sectionRow}>
                {isRenaming ? (
                  <InlineInput
                    defaultValue={sec.name}
                    placeholder="Section name"
                    icon={<Folder size={12} />}
                    onConfirm={name => { onRenameSection(sec, name); setEditing(null) }}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <span className={styles.sectionLabel}>{sec.name}</span>
                    <div className={styles.sectionActions}>
                      <button
                        className={styles.secAddBtn}
                        onClick={() => setEditing({ type: 'new-page', sectionPath: sec.path })}
                        title="New page in section"
                      >
                        <Plus size={11} />
                      </button>
                      <button
                        className={styles.secMoreBtn}
                        onClick={e => openMenu(e, 'section', sec)}
                        title="Section options"
                      >
                        <MoreHorizontal size={12} />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* ── Pages ── */}
              {sec.pages.map(pg => {
                const isActive   = activePage?.path === pg.path
                const isRenamingPage = editing?.type === 'rename-page' && editing.page.path === pg.path

                return (
                  <div
                    key={pg.path}
                    className={`${styles.pageRow} ${isActive ? styles.pageActive : ''}`}
                  >
                    {isRenamingPage ? (
                      <InlineInput
                        defaultValue={pg.title}
                        placeholder="Page name"
                        icon={<FileText size={12} />}
                        indent
                        onConfirm={name => { onRenamePage(pg, name); setEditing(null) }}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <>
                        <button
                          className={styles.pageBtn}
                          onClick={() => onSelectPage(pg)}
                        >
                          <FileText size={13} className={styles.pageIcon} />
                          <div className={styles.pageInfo}>
                            <span className={styles.pageTitle}>{pg.title}</span>
                            <span className={styles.pageDate}>{pg.modified}</span>
                          </div>
                        </button>
                        <button
                          className={styles.moreBtn}
                          onClick={e => openMenu(e, 'page', pg)}
                          title="Page options"
                        >
                          <MoreHorizontal size={12} />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}

              {/* New page inline input inside this section */}
              {editing?.type === 'new-page' && editing.sectionPath === sec.path && (
                <div className={styles.pageRow}>
                  <InlineInput
                    defaultValue="Untitled Page"
                    placeholder="Page name"
                    icon={<FileText size={12} />}
                    indent
                    onConfirm={name => { onCreatePage(sec.path, name); setEditing(null) }}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              )}

              {sec.pages.length === 0 && !(editing?.type === 'new-page' && editing.sectionPath === sec.path) && (
                <div className={styles.emptySection}>No pages yet</div>
              )}
            </div>
          )
        })}

        {/* New section inline input */}
        {editing?.type === 'new-section' && (
          <div className={styles.newSectionRow}>
            <InlineInput
              defaultValue="New Section"
              placeholder="Section name"
              icon={<Folder size={12} />}
              onConfirm={name => { onCreateSection(notebook.path, name); setEditing(null) }}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}
      </div>

      {/* Context menu */}
      {menu && (
        <CtxMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRename={() => {
            if (menu.kind === 'page')    setEditing({ type: 'rename-page',    page: menu.item })
            if (menu.kind === 'section') setEditing({ type: 'rename-section', sec:  menu.item })
            setMenu(null)
          }}
          onDelete={() => {
            if (menu.kind === 'page')    onDeletePage(menu.item)
            if (menu.kind === 'section') onDeleteSection(menu.item)
            setMenu(null)
          }}
        />
      )}
    </div>
  )
}

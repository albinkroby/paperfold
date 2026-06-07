import {
  Bold, Italic, Underline, Strikethrough,
  Code, Code2, List, ListOrdered, ListChecks,
  Heading1, Heading2, Heading3, Quote,
  Save, Eye, FileCode, RotateCcw, RotateCw
} from 'lucide-react'
import styles from './Toolbar.module.css'

const Divider = ({ id }) => <div key={id} className={styles.divider} />

export default function Toolbar({ editor, mode, onSwitchMode, onSave, onMdInsert }) {
  const visualItems = editor ? [
    { type: 'btn', action: () => editor.chain().focus().toggleBold().run(),               icon: <Bold size={14} />,          title: 'Bold (Ctrl+B)',   active: editor.isActive('bold') },
    { type: 'btn', action: () => editor.chain().focus().toggleItalic().run(),             icon: <Italic size={14} />,        title: 'Italic (Ctrl+I)', active: editor.isActive('italic') },
    { type: 'btn', action: () => editor.chain().focus().toggleUnderline().run(),          icon: <Underline size={14} />,     title: 'Underline',       active: editor.isActive('underline') },
    { type: 'btn', action: () => editor.chain().focus().toggleStrike().run(),             icon: <Strikethrough size={14} />, title: 'Strikethrough',   active: editor.isActive('strike') },
    { type: 'div' },
    { type: 'btn', action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), icon: <Heading1 size={15} />, title: 'Heading 1', active: editor.isActive('heading', { level: 1 }) },
    { type: 'btn', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), icon: <Heading2 size={15} />, title: 'Heading 2', active: editor.isActive('heading', { level: 2 }) },
    { type: 'btn', action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), icon: <Heading3 size={15} />, title: 'Heading 3', active: editor.isActive('heading', { level: 3 }) },
    { type: 'div' },
    { type: 'btn', action: () => editor.chain().focus().toggleBulletList().run(),         icon: <List size={15} />,          title: 'Bullet list',    active: editor.isActive('bulletList') },
    { type: 'btn', action: () => editor.chain().focus().toggleOrderedList().run(),        icon: <ListOrdered size={15} />,   title: 'Numbered list',  active: editor.isActive('orderedList') },
    { type: 'btn', action: () => editor.chain().focus().toggleTaskList().run(),           icon: <ListChecks size={15} />,    title: 'Task list',      active: editor.isActive('taskList') },
    { type: 'div' },
    { type: 'btn', action: () => editor.chain().focus().toggleBlockquote().run(),         icon: <Quote size={15} />,         title: 'Quote',          active: editor.isActive('blockquote') },
    { type: 'btn', action: () => editor.chain().focus().toggleCode().run(),               icon: <Code size={14} />,          title: 'Inline code',    active: editor.isActive('code') },
    { type: 'btn', action: () => editor.chain().focus().toggleCodeBlock().run(),          icon: <Code2 size={14} />,         title: 'Code block',     active: editor.isActive('codeBlock') },
    { type: 'div' },
    { type: 'btn', action: () => editor.chain().focus().undo().run(),                     icon: <RotateCcw size={14} />,     title: 'Undo (Ctrl+Z)' },
    { type: 'btn', action: () => editor.chain().focus().redo().run(),                     icon: <RotateCw size={14} />,      title: 'Redo (Ctrl+Y)' },
  ] : []

  const mdItems = [
    { type: 'btn', action: () => onMdInsert('**', '**'),          icon: <Bold size={14} />,        title: 'Bold' },
    { type: 'btn', action: () => onMdInsert('*', '*'),            icon: <Italic size={14} />,      title: 'Italic' },
    { type: 'btn', action: () => onMdInsert('`', '`'),            icon: <Code size={14} />,        title: 'Inline code' },
    { type: 'div' },
    { type: 'btn', action: () => onMdInsert('\n## ', ''),         icon: <Heading2 size={15} />,    title: 'Heading 2' },
    { type: 'btn', action: () => onMdInsert('\n### ', ''),        icon: <Heading3 size={15} />,    title: 'Heading 3' },
    { type: 'div' },
    { type: 'btn', action: () => onMdInsert('\n- ', ''),          icon: <List size={15} />,        title: 'Bullet list' },
    { type: 'btn', action: () => onMdInsert('\n1. ', ''),         icon: <ListOrdered size={15} />, title: 'Numbered list' },
    { type: 'btn', action: () => onMdInsert('\n- [ ] ', ''),      icon: <ListChecks size={15} />,  title: 'Task item' },
    { type: 'div' },
    { type: 'btn', action: () => onMdInsert('\n> ', ''),          icon: <Quote size={15} />,       title: 'Quote' },
    { type: 'btn', action: () => onMdInsert('\n```js\n', '\n```\n'), icon: <Code2 size={14} />,    title: 'Code block' },
  ]

  const items = mode === 'visual' ? visualItems : mdItems

  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        {items.map((item, i) =>
          item.type === 'div'
            ? <div key={`div-${i}`} className={styles.divider} />
            : (
              <button
                key={item.title}
                className={`${styles.btn} ${item.active ? styles.active : ''}`}
                onMouseDown={(e) => { e.preventDefault(); item.action() }}
                title={item.title}
              >
                {item.icon}
              </button>
            )
        )}
      </div>
      <div className={styles.right}>
        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeBtn} ${mode === 'visual' ? styles.modeBtnActive : ''}`}
            onClick={() => onSwitchMode('visual')}
            title="Visual mode — click and type like Word"
          >
            <Eye size={13} /> Visual
          </button>
          <button
            className={`${styles.modeBtn} ${mode === 'markdown' ? styles.modeBtnActive : ''}`}
            onClick={() => onSwitchMode('markdown')}
            title="Markdown mode — write raw .md syntax"
          >
            <FileCode size={13} /> Markdown
          </button>
        </div>
        <button className={styles.saveBtn} onClick={onSave} title="Save (Ctrl+S)">
          <Save size={14} /> Save
        </button>
      </div>
    </div>
  )
}

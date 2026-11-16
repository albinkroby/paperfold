import { useState, useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import dart from 'highlight.js/lib/languages/dart'
import { BookOpen, FilePlus } from 'lucide-react'
import Toolbar from './Toolbar'
import CodeBlockComponent from './CodeBlock'
import TurndownService from 'turndown'
import { tables, strikethrough } from 'turndown-plugin-gfm'
import { marked } from 'marked'
import styles from './Editor.module.css'

// ── Custom CodeBlock with NodeView ───────────────────────────────────────────
const CustomCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent)
  },
})

// ── Setup lowlight ────────────────────────────────────────────────────────────
// `common` covers ~35 popular languages (js/ts, python, bash, json, java, c/c++,
// c#, go, rust, sql, yaml, xml/html, css, markdown…); Dart is added on top.
const lowlight = createLowlight(common)
lowlight.register({ dart })

// ── TrailingNode extension ────────────────────────────────────────────────────
// Ensures there is always a paragraph after block nodes like code blocks.
// Without this, clicking below a code block at the end of a page traps the
// caret inside the code block (ProseMirror selects the nearest node).
const TrailingNode = Extension.create({
  name: 'trailingNode',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('trailingNode'),
        appendTransaction(_, __, state) {
          const { doc, tr, schema } = state
          const lastNode = doc.lastChild
          // Only insert a trailing paragraph when the last node is not already a paragraph
          if (!lastNode || lastNode.type === schema.nodes.paragraph) return null
          const paragraph = schema.nodes.paragraph.create()
          return tr.insert(doc.content.size, paragraph)
        },
      }),
    ]
  },
})

// ── Turndown (HTML → Markdown) ────────────────────────────────────────────────
const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

// GFM tables (| a | b |) and ~~strikethrough~~ so they survive a mode switch.
td.use([tables, strikethrough])

// The plugin emits a single "~"; double tildes are the portable GFM form.
td.addRule('strikeDouble', {
  filter: ['del', 's', 'strike'],
  replacement: (content) => (content ? `~~${content}~~` : ''),
})

// Markdown has no underline; keep it as inline HTML (marked passes it through
// and TipTap's Underline extension parses <u> back).
td.addRule('underline', {
  filter: ['u'],
  replacement: (content) => (content ? `<u>${content}</u>` : ''),
})

// TipTap wraps table-cell text in <p>; a pipe-table cell must stay on one line.
td.addRule('tableCellParagraph', {
  filter: (node) => node.nodeName === 'P' && /^(TD|TH)$/.test(node.parentNode?.nodeName || ''),
  replacement: (content, node) => content + (node.nextElementSibling ? ' ' : ''),
})

// Override the default ul rule to handle task lists separately
td.addRule('taskList', {
  filter: (node) => node.nodeName === 'UL' && node.getAttribute('data-type') === 'taskList',
  replacement: (content) => content,
})

td.addRule('taskItem', {
  filter: (node) => node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem',
  replacement: (content, node) => {
    const checked = node.getAttribute('data-checked') === 'true'
    // content includes the converted label (input+span → empty) and div (text)
    // Strip any blank lines and take only the actual text
    const text = content.replace(/\n+/g, ' ').trim()
    return `- [${checked ? 'x' : ' '}] ${text}\n`
  },
})

// Strip Markdown syntax for clean word count
function countWords(text) {
  const stripped = text
    .replace(/^#{1,6}\s+/gm, '')          // headings
    .replace(/[*_~`]/g, '')               // bold/italic/code chars
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')    // images
    .replace(/^\s*[-*+]\s+/gm, '')        // list markers
    .replace(/^\s*\d+\.\s+/gm, '')        // ordered list markers
    .replace(/^\s*>\s+/gm, '')            // blockquotes
    .trim()
  return stripped ? stripped.split(/\s+/).filter(Boolean).length : 0
}

// ── Markdown → TipTap-compatible HTML ────────────────────────────────────────
// marked emits  <li><input type="checkbox" [checked]> text</li>  for GFM tasks.
// TipTap's TaskItem parseHTML only matches  li[data-checked]  and TaskList only
// matches  ul[data-type="taskList"].  We post-process the raw HTML to add those
// attributes before handing it to editor.commands.setContent().
function markdownToTiptapHtml(markdown) {
  const rawHtml = marked.parse(markdown || '')
  const parser = new DOMParser()
  const doc = parser.parseFromString(rawHtml, 'text/html')

  doc.querySelectorAll('li > input[type="checkbox"]').forEach(input => {
    const li = input.parentElement
    const checked = input.checked || input.hasAttribute('checked')
    li.setAttribute('data-type', 'taskItem')
    li.setAttribute('data-checked', String(checked))
    input.remove()           // TipTap re-creates the input via addNodeView

    const ul = li.parentElement
    if (ul && ul.tagName === 'UL') {
      ul.setAttribute('data-type', 'taskList')
    }
  })

  return doc.body.innerHTML
}

const SAVE_LABEL = {
  saved:   { text: '● Saved',      color: 'var(--text-muted)' },
  unsaved: { text: '○ Unsaved',    color: 'var(--accent)' },
  saving:  { text: '○ Saving…',    color: 'var(--accent)' },
  error:   { text: '⚠ Save failed', color: '#e5484d' },
}

export default function Editor({ page, defaultMode = 'visual', saveStatus = 'saved', onContentChange, onSave, onTitleChange }) {
  const [mode, setMode] = useState(defaultMode)
  const [mdText, setMdText] = useState('')
  const [pageTitle, setPageTitle] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const mdTextareaRef  = useRef(null)
  const wordTimer      = useRef(null)

  // Word count is cheap but not free on long pages — debounce it.
  const scheduleWordCount = useCallback((getText) => {
    clearTimeout(wordTimer.current)
    wordTimer.current = setTimeout(() => setWordCount(countWords(getText())), 250)
  }, [])
  useEffect(() => () => clearTimeout(wordTimer.current), [])

  // ── TipTap editor ───────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      CustomCodeBlock.configure({ lowlight }),
      TrailingNode,
    ],
    content: '',
    onUpdate: ({ editor }) => {
      // Hand over a lazy getter: the (comparatively expensive) HTML → Markdown
      // conversion only runs when the content is actually written to disk.
      onContentChange(() => td.turndown(editor.getHTML()))
      scheduleWordCount(() => editor.getText())
    },
  })

  // ── Load page ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!page) return
    setMdText(page.content || '')
    setWordCount(countWords(page.content || ''))
    if (mode === 'visual' && editor) {
      const html = markdownToTiptapHtml(page.content || '')
      // Defer: TipTap's React node views (code blocks) call flushSync, which React
      // forbids while it is still committing this effect.
      queueMicrotask(() => { if (!editor.isDestroyed) editor.commands.setContent(html, false) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.path, page?.reloadKey, editor])

  // Keep the title box in sync with the real (sanitised) title on disk
  useEffect(() => { setPageTitle(page?.title ?? '') }, [page?.path, page?.title])

  // ── Mode switch ─────────────────────────────────────────────────────────────
  const switchMode = useCallback((newMode) => {
    if (newMode === mode) return
    if (newMode === 'markdown') {
      const html = editor?.getHTML() || ''
      setMdText(td.turndown(html))
    } else {
      const html = markdownToTiptapHtml(mdText)
      editor?.commands.setContent(html, false)
    }
    setMode(newMode)
  }, [mode, editor, mdText])

  const handleMdChange = (e) => {
    const val = e.target.value
    setMdText(val)
    onContentChange(() => val)
    setWordCount(countWords(val))
  }

  const currentMarkdown = () => (mode === 'visual' ? td.turndown(editor?.getHTML() || '') : mdText)

  const handleSaveNow = () => {
    if (page) onSave({ ...page, content: currentMarkdown() })
  }

  // File → Save (Ctrl+S) is a native menu item; always call the latest handler.
  const saveRef = useRef(handleSaveNow)
  saveRef.current = handleSaveNow
  useEffect(() => {
    const cb = () => saveRef.current()
    window.api.onMenu('save', cb)
    return () => window.api.offMenu('save', cb)
  }, [])

  // ── Title change ─────────────────────────────────────────────────────────────
  const handleTitleChange = (e) => {
    setPageTitle(e.target.value)
  }

  const handleTitleBlur = async () => {
    const next = pageTitle.trim()
    if (!page || !next || next === page.title) {
      setPageTitle(page?.title ?? '')
      return
    }
    const ok = await onTitleChange(page, next)
    if (!ok) setPageTitle(page.title)   // rename failed: show the real title again
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur()
    } else if (e.key === 'Escape') {
      setPageTitle(page?.title ?? '')
      e.target.blur()
    }
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!page) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyInner}>
          <BookOpen size={40} className={styles.emptyIcon} />
          <h2 className={styles.emptyTitle}>No page selected</h2>
          <p className={styles.emptyDesc}>Select a page from the sidebar or create a new one to start writing.</p>
          <div className={styles.emptyHint}>
            <FilePlus size={13} /> <span>Ctrl+N to create a new page</span>
          </div>
        </div>
      </div>
    )
  }

  const status = SAVE_LABEL[saveStatus] || SAVE_LABEL.saved

  return (
    <div className={styles.editorArea}>
      <Toolbar
        editor={editor}
        mode={mode}
        onSwitchMode={switchMode}
        onSave={handleSaveNow}
        mdText={mdText}
        onMdInsert={(before, after) => {
          const ta = mdTextareaRef.current
          if (!ta) return
          const s = ta.selectionStart, e = ta.selectionEnd
          const selected = ta.value.substring(s, e)
          const newVal = ta.value.substring(0, s) + before + selected + after + ta.value.substring(e)
          setMdText(newVal)
          onContentChange(() => newVal)
          setTimeout(() => { ta.selectionStart = s + before.length; ta.selectionEnd = s + before.length + selected.length; ta.focus() }, 0)
        }}
      />

      <div className={styles.titleRow}>
        <input
          className={styles.titleInput}
          value={pageTitle}
          onChange={handleTitleChange}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          placeholder="Untitled page"
        />
      </div>

      <div className={styles.contentWrap}>
        {mode === 'visual' ? (
          <EditorContent editor={editor} className={styles.tiptap} />
        ) : (
          <textarea
            ref={mdTextareaRef}
            className={styles.mdTextarea}
            value={mdText}
            onChange={handleMdChange}
            spellCheck={false}
            placeholder="# Start writing in Markdown..."
          />
        )}
      </div>

      <div className={styles.statusbar}>
        <span className={styles.statusPath}>{page.path?.split(/[\\\/]/).slice(-3).join(' / ')}</span>
        <span>{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
        <span style={{ color: status.color }}>{status.text}</span>
        <span style={{ color: mode === 'visual' ? 'var(--accent)' : 'var(--text-muted)' }}>
          {mode === 'visual' ? 'Visual' : 'Markdown'}
        </span>
      </div>
    </div>
  )
}

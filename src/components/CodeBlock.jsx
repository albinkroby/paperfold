import { useState, useRef, useEffect } from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { Copy, Check, ChevronDown, Code2 } from 'lucide-react'
import styles from './CodeBlock.module.css'

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'dart', label: 'Dart' },
  { value: 'java', label: 'Java' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'swift', label: 'Swift' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'css', label: 'CSS' },
  { value: 'xml', label: 'HTML / XML' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'text', label: 'Plain Text' },
]

export default function CodeBlockComponent({ node, updateAttributes }) {
  const [copied, setCopied] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  const handleCopy = () => {
    const rawText = node.textContent || ''
    
    // Clean text: strip non-breaking spaces, zero-width spaces, BOM, curly quotes, normalize linebreaks
    const cleanText = rawText
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')

    navigator.clipboard.writeText(cleanText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const currentLangValue = node.attrs.language || 'text'
  const currentLang = LANGUAGES.find(l => l.value === currentLangValue) || { label: currentLangValue || 'Plain Text', value: currentLangValue }

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <NodeViewWrapper className={styles.codeBlockContainer}>
      <div className={styles.header} contentEditable={false}>
        <div className={styles.dropdownWrapper} ref={menuRef}>
          <button
            type="button"
            className={`${styles.customSelectTrigger} ${isOpen ? styles.active : ''}`}
            onClick={() => setIsOpen(!isOpen)}
            title="Change programming language"
          >
            <Code2 size={12} className={styles.langIcon} />
            <span>{currentLang.label}</span>
            <ChevronDown size={12} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
          </button>

          {isOpen && (
            <div className={styles.dropdownMenu}>
              {LANGUAGES.map((lang) => {
                const isSelected = lang.value === currentLangValue
                return (
                  <button
                    key={lang.value}
                    type="button"
                    className={`${styles.menuItem} ${isSelected ? styles.selected : ''}`}
                    onClick={() => {
                      updateAttributes({ language: lang.value })
                      setIsOpen(false)
                    }}
                  >
                    <span>{lang.label}</span>
                    {isSelected && <Check size={12} className={styles.checkIcon} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button
          className={`${styles.copyBtn} ${copied ? styles.copied : ''}`}
          onClick={handleCopy}
          title="Copy clean code to clipboard"
          type="button"
        >
          {copied ? <Check size={13} className={styles.iconSuccess} /> : <Copy size={13} />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>

      <pre className={styles.pre}>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  )
}

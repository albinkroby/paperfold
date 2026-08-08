import { useEffect, useRef } from 'react'
import {
  BookOpen, FolderOpen, Keyboard, Columns2,
  ArrowRight, Github
} from 'lucide-react'
import styles from './WelcomeModal.module.css'

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Notebooks & Pages',
    desc: 'Organise notes into notebooks, sections, and pages — just like a real notebook.',
  },
  {
    icon: Columns2,
    title: 'Visual & Markdown modes',
    desc: 'Write with a rich WYSIWYG editor or drop into raw Markdown — switch any time.',
  },
  {
    icon: FolderOpen,
    title: 'Plain files, always yours',
    desc: 'Every page is a .md file on your disk. Open them in VS Code, Obsidian, or any editor.',
  },
  {
    icon: Keyboard,
    title: 'Keyboard shortcuts',
    desc: 'Ctrl+N new page · Ctrl+S save · Ctrl+B bold · Ctrl+I italic ·',
  },
]

export default function WelcomeModal({ onClose }) {
  const btnRef = useRef(null)

  // Focus the CTA button on mount
  useEffect(() => {
    const id = setTimeout(() => btnRef.current?.focus(), 80)
    return () => clearTimeout(id)
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className={styles.modal}>

        {/* ── Hero ── */}
        <div className={styles.hero}>
          <div className={styles.logoWrap}>
            <BookOpen size={28} strokeWidth={1.8} />
          </div>
          <h1 id="welcome-title" className={styles.appName}>Paperfold</h1>
          <p className={styles.tagline}>
            A local-first, distraction-free notebook that saves everything as plain&nbsp;Markdown.
          </p>
        </div>

        {/* ── Feature grid ── */}
        <div className={styles.grid}>
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className={styles.card}>
              <div className={styles.cardIcon}>
                <Icon size={16} strokeWidth={2} />
              </div>
              <div>
                <div className={styles.cardTitle}>{title}</div>
                <div className={styles.cardDesc}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div className={styles.footer}>
          <a
            className={styles.githubLink}
            href="https://github.com/albinkroby/paperfold"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github size={13} />
            View on GitHub
          </a>

          <button
            ref={btnRef}
            className={styles.ctaBtn}
            onClick={onClose}
            id="welcome-get-started-btn"
          >
            Get started
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

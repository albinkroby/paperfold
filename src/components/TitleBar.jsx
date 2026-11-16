import { Minus, Square, X, Settings, Search } from 'lucide-react'
import { accelParts } from '../utils/accelerator'
import styles from './TitleBar.module.css'

export default function TitleBar({ title, shortcut, onOpenSearch, onOpenSettings }) {
  const keys = accelParts(shortcut)
  return (
    <div className={styles.titlebar}>
      <div className={styles.drag}>
        <img src="./logo.png" className={styles.logo} alt="Paperfold Logo" />
        <span className={styles.appName}>
          Paperfold
        </span>
      </div>

      {/* Search-bar style title: shows the current page, opens quick search on click */}
      <div className={styles.center}>
        <button className={styles.searchPill} onClick={onOpenSearch} title="Search pages">
          <Search size={13} className={styles.pillIcon} />
          <span className={styles.pillTitle}>{title}</span>
          {keys.length > 0 && (
            <span className={styles.pillKeys}>
              {keys.map((k, i) => <kbd key={i} className={styles.pillKbd}>{k}</kbd>)}
            </span>
          )}
        </button>
      </div>

      <div className={styles.controls}>
        <button
          className={styles.settingsBtn}
          onClick={onOpenSettings}
          title="Settings"
        >
          <Settings size={14} />
        </button>
        <div className={styles.sep} />
        <button className={styles.btn} onClick={() => window.api.minimize()} title="Minimize">
          <Minus size={12} />
        </button>
        <button className={styles.btn} onClick={() => window.api.maximize()} title="Maximize">
          <Square size={11} />
        </button>
        <button className={`${styles.btn} ${styles.close}`} onClick={() => window.api.close()} title="Close">
          <X size={13} />
        </button>
      </div>
    </div>
  )
}

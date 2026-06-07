import { Minus, Square, X, Settings } from 'lucide-react'
import styles from './TitleBar.module.css'

export default function TitleBar({ title, rootDir, onOpenSettings }) {
  return (
    <div className={styles.titlebar}>
      <div className={styles.drag}>
        <span className={styles.appName}>
          <span className={styles.folioMark}>F</span>olio
        </span>
        {rootDir && <span className={styles.rootDir}>{rootDir}</span>}
      </div>

      <div className={styles.pageTitle}>{title}</div>

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

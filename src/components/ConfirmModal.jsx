import { useEffect, useRef } from 'react'
import { TriangleAlert } from 'lucide-react'
import styles from './ConfirmModal.module.css'

export default function ConfirmModal({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  const cancelRef = useRef(null)

  // Focus cancel button by default (safer UX)
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        {/* Icon */}
        <div className={styles.iconWrap}>
          <TriangleAlert size={22} />
        </div>

        {/* Content */}
        <div className={styles.content}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.message}>{message}</p>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            ref={cancelRef}
            className={styles.cancelBtn}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={styles.confirmBtn}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * The admin console's dialog shell.
 *
 * Shared by the pages that open one — the content editor and the user list —
 * so the backdrop, the Escape key and the scroll lock behave identically
 * everywhere. Only presentation lives here; the body is the caller's.
 */

import { useEffect, type ReactNode } from 'react'
import { useT } from '../lib/i18n'

export function Modal({
  title,
  size = 'default',
  onClose,
  children,
}: {
  title: string
  size?: 'default' | 'wide'
  onClose: () => void
  children: ReactNode
}) {
  const t = useT()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    // The page behind must not scroll while a dialog is over it.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div
      className="admin-modal-backdrop"
      // Only a click that starts on the backdrop itself dismisses, so a drag
      // that ends outside a text selection does not close the dialog.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`admin-modal${size === 'wide' ? ' admin-modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="admin-modal-head">
          <h2>{title}</h2>
          <button
            className="admin-modal-close"
            type="button"
            onClick={onClose}
            aria-label={t('关闭', 'Close')}
          >
            ×
          </button>
        </header>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  )
}

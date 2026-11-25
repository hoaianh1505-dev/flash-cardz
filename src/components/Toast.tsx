'use client';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

interface ToastProps {
  id: number;
  msg: string;
  type: ToastType;
  visible: boolean;
  durationMs?: number;
  onClose: () => void;
}

export default function Toast({
  id,
  msg,
  type,
  visible,
  durationMs = 2600,
  onClose,
}: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast toast-${type} ${visible ? 'show' : ''}`}
    >
      <span className={`toastBadge toastBadge-${type}`} aria-hidden="true">
        {type === 'success' && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {type === 'error' && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="7" x2="12" y2="13" />
            <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
          </svg>
        )}
        {type === 'warning' && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="8" x2="12" y2="13" />
            <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
          </svg>
        )}
        {type === 'info' && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
            <line x1="12" y1="11.5" x2="12" y2="17" />
          </svg>
        )}
      </span>

      <span className="toastText">{msg}</span>

      <button
        type="button"
        className="toastClose"
        onClick={onClose}
        aria-label="Đóng thông báo"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      {visible && (
        <span
          key={id}
          className={`toastProgress toastProgress-${type}`}
          style={{ animationDuration: `${durationMs}ms` }}
        />
      )}
    </div>
  );
}

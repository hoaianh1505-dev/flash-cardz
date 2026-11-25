'use client';

import { useRef, useState } from 'react';

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
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!visible) return;
    startXRef.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    setDragX(dx > 0 ? dx : 0);
  };

  const handlePointerEnd = () => {
    if (startXRef.current === null) return;
    const shouldDismiss = dragX > 70;
    startXRef.current = null;
    setDragging(false);
    setDragX(0);
    if (shouldDismiss) {
      onClose();
    }
  };

  const dragStyle =
    dragging && dragX > 0
      ? {
          transform: `translateX(${dragX}px)`,
          opacity: Math.max(0.2, 1 - dragX / 220),
          transition: 'none',
        }
      : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast toast-${type} ${visible ? 'show' : ''}`}
      style={dragStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      title="Kéo sang phải để tắt thông báo"
    >
      <span className={`toastBadge toastBadge-${type}`} aria-hidden="true">
        {type === 'success' && (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {type === 'error' && (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="7" x2="12" y2="13" />
            <circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        )}
        {type === 'warning' && (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="8" x2="12" y2="13" />
            <circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none" />
          </svg>
        )}
        {type === 'info' && (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
            <line x1="12" y1="11.5" x2="12" y2="17" />
          </svg>
        )}
      </span>

      <span className="toastText">{msg}</span>

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

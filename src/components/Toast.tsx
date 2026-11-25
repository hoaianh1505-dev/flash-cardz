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
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!startRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startRef.current.x;
    const dy = e.touches[0].clientY - startRef.current.y;
    // Allow swiping right (dx > 0) or swiping up (dy < 0)
    setDragOffset({
      x: dx > 0 ? dx : 0,
      y: dy < 0 ? dy : 0,
    });
  };

  const handleTouchEnd = () => {
    if (!startRef.current) return;
    const shouldDismiss = dragOffset.x > 64 || dragOffset.y < -36;
    startRef.current = null;
    setDragging(false);
    setDragOffset({ x: 0, y: 0 });
    if (shouldDismiss) {
      onClose();
    }
  };

  const dragStyle =
    dragging && (dragOffset.x !== 0 || dragOffset.y !== 0)
      ? {
          transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
          opacity: Math.max(0.25, 1 - Math.max(dragOffset.x / 180, -dragOffset.y / 90)),
          transition: 'none',
        }
      : undefined;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast toast-${type} ${visible ? 'show' : ''}`}
      style={dragStyle}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
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
        title="Đóng thông báo"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

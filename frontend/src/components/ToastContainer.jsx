import React, { useContext, useState, useEffect } from 'react';
import ToastContext from '../contexts/ToastContext';
import './ToastContainer.css';

const icons = {
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
};

const closeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ToastItem = ({ toast, onRemove }) => {
  const [exiting, setExiting] = useState(false);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  };

  const handleAction = (e) => {
    e.stopPropagation();
    try { toast.action?.onClick?.(); } catch { /* ignore */ }
    handleDismiss();
  };

  useEffect(() => {
    if (toast.duration > 0) {
      const exitTimer = setTimeout(() => setExiting(true), toast.duration - 300);
      return () => clearTimeout(exitTimer);
    }
  }, [toast.duration]);

  // Role semântico: alerts para erros, status para o resto
  const role = toast.type === 'error' ? 'alert' : 'status';

  return (
    <div
      className={`toast-item toast-${toast.type} ${exiting ? 'toast-exit' : ''}`}
      role={role}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    >
      <span className="toast-icon">{icons[toast.type]}</span>
      <span className="toast-message">{toast.message}</span>
      {toast.action?.label && (
        <button
          type="button"
          className="toast-action"
          onClick={handleAction}
          style={{
            background: 'transparent', border: 'none', color: 'inherit',
            fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
            padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase',
            letterSpacing: '0.03em', marginRight: 4,
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button className="toast-close" onClick={handleDismiss} aria-label="Fechar notificação">
        {closeIcon}
      </button>
      {toast.duration > 0 && (
        <div
          className="toast-progress"
          style={{ animationDuration: `${toast.duration}ms` }}
        />
      )}
    </div>
  );
};

const ToastContainer = () => {
  const { toasts, removeToast } = useContext(ToastContext);

  if (!toasts.length) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
};

export default ToastContainer;

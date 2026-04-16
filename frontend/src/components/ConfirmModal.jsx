import React, { useEffect, useRef } from 'react';
import './ConfirmModal.css';

/**
 * ConfirmModal acessível com:
 *   - ESC cancela
 *   - Enter confirma
 *   - Auto-focus no botão de cancelar (padrão seguro)
 *   - aria-modal, aria-labelledby
 *   - Focus trap entre Cancelar e Confirmar
 */
const ConfirmModal = ({
  open,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel,
  autoFocus = 'cancel',
}) => {
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const previousActiveRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    previousActiveRef.current = document.activeElement;
    // Auto-focus — padrão é cancelar (escolha segura para ações destrutivas)
    (autoFocus === 'confirm' ? confirmRef : cancelRef).current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
      else if (e.key === 'Enter' && document.activeElement === confirmRef.current) {
        e.preventDefault();
        onConfirm?.();
      } else if (e.key === 'Tab') {
        // Trap foco entre os dois botões
        const focusables = [cancelRef.current, confirmRef.current].filter(Boolean);
        if (!focusables.length) return;
        const idx = focusables.indexOf(document.activeElement);
        if (idx === -1) { focusables[0].focus(); e.preventDefault(); return; }
        const next = e.shiftKey ? (idx - 1 + focusables.length) % focusables.length : (idx + 1) % focusables.length;
        focusables[next].focus();
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      try { previousActiveRef.current?.focus?.(); } catch { /* ignore */ }
    };
  }, [open, onConfirm, onCancel, autoFocus]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" onClick={onCancel} role="presentation">
      <div
        className="confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title ? 'confirm-title' : undefined}
        aria-describedby={message ? 'confirm-message' : undefined}
      >
        {title && <h3 id="confirm-title" className="confirm-title">{title}</h3>}
        {message && <p id="confirm-message" className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="confirm-cancel-btn"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`confirm-ok-btn ${variant}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;

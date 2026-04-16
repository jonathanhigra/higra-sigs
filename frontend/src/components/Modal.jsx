import { useEffect, useRef, useId } from 'react';
import './Modal.css';

/**
 * Modal com:
 *   - ESC fecha
 *   - Click fora fecha (pode ser desabilitado com closeOnBackdrop={false})
 *   - Focus trap
 *   - Auto-focus no primeiro input (ou no elemento `initialFocusRef.current`)
 *   - aria-modal, aria-labelledby
 *   - Restaura foco ao elemento que abriu o modal
 */
export default function Modal({
  open,
  onClose,
  title,
  size,
  children,
  footer,
  closeOnBackdrop = true,
  initialFocusRef,
}) {
  const containerRef = useRef(null);
  const previousActiveRef = useRef(null);
  const titleId = useId();

  // Scroll lock + ESC
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';

    const handleKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }

      // Focus trap
      if (e.key === 'Tab' && containerRef.current) {
        const focusables = containerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const visible = Array.from(focusables).filter(el => !el.disabled && el.offsetParent !== null);
        if (!visible.length) return;
        const first = visible[0];
        const last = visible[visible.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  // Focus management
  useEffect(() => {
    if (!open) return;
    previousActiveRef.current = document.activeElement;
    const focusTarget =
      initialFocusRef?.current ||
      containerRef.current?.querySelector('input:not([type="hidden"]):not([readonly]), textarea, select') ||
      containerRef.current?.querySelector('button.btn-primary') ||
      containerRef.current?.querySelector('button');
    focusTarget?.focus?.();

    return () => {
      // Restaura foco ao fechar
      try { previousActiveRef.current?.focus?.(); } catch { /* ignore */ }
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (!closeOnBackdrop) return;
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        className={`modal-container ${size || ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        ref={containerRef}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

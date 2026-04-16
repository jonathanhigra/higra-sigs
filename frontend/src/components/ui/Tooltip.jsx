import { cloneElement, useState, useRef, useEffect } from 'react';

/**
 * Tooltip leve — envolve um elemento filho e mostra um balão ao hover/focus.
 *
 *   <Tooltip text="Excluir"><button><Icon .../></button></Tooltip>
 *
 * O filho DEVE aceitar ref e onMouseEnter/onMouseLeave/onFocus/onBlur.
 */
export default function Tooltip({ text, children, placement = 'top', delay = 300 }) {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  const timer = useRef(null);

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    let top, left;
    if (placement === 'top')    { top = r.top - gap;    left = r.left + r.width / 2; }
    if (placement === 'bottom') { top = r.bottom + gap; left = r.left + r.width / 2; }
    if (placement === 'left')   { top = r.top + r.height / 2; left = r.left - gap; }
    if (placement === 'right')  { top = r.top + r.height / 2; left = r.right + gap; }
    setCoords({ top, left });
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!text) return children;

  const open = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { measure(); setShow(true); }, delay);
  };
  const close = () => {
    clearTimeout(timer.current);
    setShow(false);
  };

  const child = cloneElement(children, {
    ref: (node) => { ref.current = node; },
    onMouseEnter: (e) => { open(); children.props.onMouseEnter?.(e); },
    onMouseLeave: (e) => { close(); children.props.onMouseLeave?.(e); },
    onFocus:     (e) => { open();  children.props.onFocus?.(e);  },
    onBlur:      (e) => { close(); children.props.onBlur?.(e);   },
  });

  const transforms = {
    top:    'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left:   'translate(-100%, -50%)',
    right:  'translate(0, -50%)',
  };

  return (
    <>
      {child}
      {show && (
        <div
          role="tooltip"
          style={{
            position: 'fixed', top: coords.top, left: coords.left,
            transform: transforms[placement], zIndex: 9999,
            background: 'var(--bg-primary, #1a1a1f)', color: 'var(--text-primary, #f1f1f6)',
            border: '1px solid var(--border-primary, #26262b)',
            padding: '5px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 500,
            whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          {text}
        </div>
      )}
    </>
  );
}

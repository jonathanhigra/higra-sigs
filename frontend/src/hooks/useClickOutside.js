import { useEffect, useRef } from 'react';

/**
 * Dispara handler quando um clique acontece fora do elemento ref.
 *
 *   const ref = useRef();
 *   useClickOutside(ref, () => setOpen(false));
 *   return <div ref={ref}>...</div>;
 */
export default function useClickOutside(ref, handler, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onDown = (e) => {
      const el = ref?.current;
      if (!el || el.contains(e.target)) return;
      handlerRef.current?.(e);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [ref, enabled]);
}

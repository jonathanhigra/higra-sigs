import { useEffect, useRef } from 'react';

/**
 * useKeyboardShortcut('mod+k', handler) — mod = Ctrl no Windows/Linux, Cmd no Mac
 * Também aceita array: useKeyboardShortcut(['mod+k', '/'], handler)
 *
 * Por padrão ignora quando o foco está em input/textarea, a menos que allowInInput seja true.
 */
export default function useKeyboardShortcut(keys, handler, options = {}) {
  const { allowInInput = false, enabled = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const shortcuts = Array.isArray(keys) ? keys : [keys];

    const matches = (e, combo) => {
      const parts = combo.toLowerCase().split('+').map(s => s.trim());
      const key = parts[parts.length - 1];
      const mods = parts.slice(0, -1);
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const wantCtrl = mods.includes('ctrl') || (mods.includes('mod') && !isMac);
      const wantCmd  = mods.includes('cmd')  || (mods.includes('mod') &&  isMac);
      const wantShift = mods.includes('shift');
      const wantAlt = mods.includes('alt');
      if (wantCtrl  !== e.ctrlKey)  return false;
      if (wantCmd   !== e.metaKey)  return false;
      if (wantShift !== e.shiftKey) return false;
      if (wantAlt   !== e.altKey)   return false;
      return e.key.toLowerCase() === key;
    };

    const onKey = (e) => {
      if (!allowInInput) {
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
          // Permite mod+k mesmo em inputs
          const isModKey = e.ctrlKey || e.metaKey;
          if (!isModKey) return;
        }
      }
      for (const combo of shortcuts) {
        if (matches(e, combo)) {
          e.preventDefault();
          handlerRef.current?.(e);
          return;
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [JSON.stringify(keys), allowInInput, enabled]);
}

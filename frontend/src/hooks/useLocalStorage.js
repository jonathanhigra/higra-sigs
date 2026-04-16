import { useCallback, useEffect, useState } from 'react';

/**
 * useState persistido no localStorage.
 * Sincroniza entre abas via storage event.
 */
export default function useLocalStorage(key, initialValue) {
  const read = () => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initialValue;
    } catch { return initialValue; }
  };

  const [value, setValue] = useState(read);

  const update = useCallback((next) => {
    setValue(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      try {
        if (resolved === undefined || resolved === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(resolved));
      } catch { /* quota exceeded, ignore */ }
      return resolved;
    });
  }, [key]);

  useEffect(() => {
    const sync = (e) => {
      if (e.key !== key) return;
      try {
        setValue(e.newValue != null ? JSON.parse(e.newValue) : initialValue);
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key, initialValue]);

  return [value, update];
}

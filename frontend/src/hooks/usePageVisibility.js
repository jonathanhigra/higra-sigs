import { useEffect, useState } from 'react';

/**
 * true quando a aba está visível, false quando em background.
 * Útil para pausar polling/refresh em abas ocultas.
 */
export default function usePageVisibility() {
  const [visible, setVisible] = useState(() =>
    typeof document !== 'undefined' ? !document.hidden : true
  );

  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return visible;
}

import { useEffect, useRef } from 'react';

/**
 * setInterval como hook — pausa quando delay é null.
 *
 *   useInterval(() => fetchData(), 30000);   // a cada 30s
 *   useInterval(() => tick(), paused ? null : 1000);
 */
export default function useInterval(callback, delay) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (delay == null) return;
    const id = setInterval(() => savedCallback.current?.(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

import { useEffect, useRef } from 'react';

/**
 * Retorna uma ref que indica se o componente ainda está montado.
 * Útil para evitar setState após unmount em calls async.
 *
 *   const mounted = useMountedRef();
 *   await fetch(...);
 *   if (mounted.current) setState(...);
 */
export default function useMountedRef() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}

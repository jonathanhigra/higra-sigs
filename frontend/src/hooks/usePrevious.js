import { useEffect, useRef } from 'react';

/**
 * Retorna o valor anterior de uma variável entre renders.
 *
 *   const previousCount = usePrevious(count);
 */
export default function usePrevious(value) {
  const ref = useRef();
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}

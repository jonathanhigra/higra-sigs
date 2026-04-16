import { useEffect, useState } from 'react';

/**
 * Debounça um valor — útil para inputs de busca.
 *
 *   const debouncedSearch = useDebouncedValue(search, 300);
 *   useEffect(() => { fetchData(debouncedSearch); }, [debouncedSearch]);
 */
export default function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

import { useCallback, useState } from 'react';
import { copyToClipboard } from '../utils/format';

/**
 * const [copied, copy] = useCopyToClipboard();
 * <button onClick={() => copy('texto')}>{copied ? 'Copiado!' : 'Copiar'}</button>
 */
export default function useCopyToClipboard(resetMs = 1500) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), resetMs);
    }
    return ok;
  }, [resetMs]);

  return [copied, copy];
}

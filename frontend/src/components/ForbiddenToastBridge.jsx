import { useEffect } from 'react';
import { useToast } from '../contexts/ToastContext';

/**
 * Ponte entre `api.js` (que não tem acesso ao React tree) e o ToastContext.
 *
 * O interceptor do axios dispara `window.dispatchEvent(new CustomEvent('api-forbidden', ...))`
 * quando recebe 403. Este componente escuta o evento e mostra um toast de warning.
 *
 * Dedupe é feito no `api.js` (por URL + janela de 3s) — aqui apenas renderizamos.
 */
export default function ForbiddenToastBridge() {
  const toast = useToast();

  useEffect(() => {
    const handler = (e) => {
      const { message, key } = e.detail || {};
      toast.warning(message || 'Sem permissão para acessar este recurso.', {
        dedupeKey: `forbidden::${key}`,
        duration: 5000,
      });
    };
    window.addEventListener('api-forbidden', handler);
    return () => window.removeEventListener('api-forbidden', handler);
  }, [toast]);

  return null;
}

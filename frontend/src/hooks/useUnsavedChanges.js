import { useEffect } from 'react';

/**
 * Avisa o usuário antes de sair da página (refresh/fechar aba) quando houver
 * mudanças não salvas. Para navegação SPA, use isDirty como guarda manual.
 */
export default function useUnsavedChanges(isDirty) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}

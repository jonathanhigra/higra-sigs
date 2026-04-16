import { useEffect } from 'react';

const BASE_TITLE = 'SIGS';

/**
 * useDocumentTitle('Tarefas') → document.title = "Tarefas · SIGS"
 * Restaura o título anterior no unmount.
 */
export default function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
    return () => { document.title = previous; };
  }, [title]);
}

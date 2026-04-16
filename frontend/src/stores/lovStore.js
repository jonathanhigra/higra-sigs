/**
 * Cache de LOVs (listas de valores) para evitar refetch em cada componente (#22).
 * Stale-while-revalidate: serve stale data imediatamente (TTL 1h),
 * depois revalida em background sem bloquear a UI.
 */
import { create } from 'zustand';
import { lovService } from '../services/lovService';

const TTL_MS = 60 * 60 * 1000; // 1 hora

function isStale(ts) {
  return !ts || Date.now() - ts > TTL_MS;
}

const useLovStore = create((set, get) => ({
  usuarios: [],
  filiais: [],
  _usuariosTs: null,
  _filiaisTs: null,

  getUsuarios: async () => {
    const { usuarios, _usuariosTs } = get();
    const stale = isStale(_usuariosTs);
    // Serve stale data imediatamente (stale-while-revalidate)
    if (usuarios.length > 0 && !stale) return usuarios;
    if (usuarios.length > 0 && stale) {
      // Revalida em background
      (async () => {
        try {
          const { data } = await lovService.usuarios();
          set({ usuarios: data.items || [], _usuariosTs: Date.now() });
        } catch {}
      })();
      return usuarios;
    }
    // Primeira carga — aguarda
    try {
      const { data } = await lovService.usuarios();
      const items = data.items || [];
      set({ usuarios: items, _usuariosTs: Date.now() });
      return items;
    } catch {
      return [];
    }
  },

  getFiliais: async () => {
    const { filiais, _filiaisTs } = get();
    const stale = isStale(_filiaisTs);
    if (filiais.length > 0 && !stale) return filiais;
    if (filiais.length > 0 && stale) {
      (async () => {
        try {
          const { data } = await lovService.minhasFiliais();
          set({ filiais: data.items || [], _filiaisTs: Date.now() });
        } catch {}
      })();
      return filiais;
    }
    try {
      const { data } = await lovService.minhasFiliais();
      const items = data.items || [];
      set({ filiais: items, _filiaisTs: Date.now() });
      return items;
    } catch {
      return [];
    }
  },

  invalidate: () => set({ _usuariosTs: null, _filiaisTs: null }),
}));

export default useLovStore;

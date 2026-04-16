import api from '../../lib/api';
const BASE = '/api/admin/permissoes';
export const permissoesService = {
  listarTipos:       () => api.get(`${BASE}/tipos`),
  obterPermissoes:   (tipoId) => api.get(`${BASE}/tipos/${tipoId}/permissoes`),
  salvarPermissoes:  (tipoId, permissoes) => api.put(`${BASE}/tipos/${tipoId}/permissoes`, { permissoes }),
};

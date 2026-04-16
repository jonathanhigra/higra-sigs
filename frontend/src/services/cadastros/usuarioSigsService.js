import api from '../../lib/api';

const BASE = '/api/cadastros/usuarios';

export const usuarioSigsService = {
  listar:      (params) => api.get(BASE, { params }),
  atualizarSigs: (id, dados) => api.put(`${BASE}/${id}/sigs`, dados),
  listarTipos: () => api.get(`${BASE}/tipos`),
};

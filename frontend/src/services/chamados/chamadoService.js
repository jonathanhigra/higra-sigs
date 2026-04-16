import api from '../../lib/api';
const BASE = '/api/chamados';
export const chamadoService = {
  listar:       (params) => api.get(BASE, { params }),
  obter:        (id) => api.get(`${BASE}/${id}`),
  criar:        (dados) => api.post(BASE, dados),
  atualizar:    (id, dados) => api.put(`${BASE}/${id}`, dados),
  addComentario:(chmId, dados) => api.post(`${BASE}/${chmId}/comentarios`, dados),
};

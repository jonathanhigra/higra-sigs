import api from '../../lib/api';

const BASE = '/api/cadastros/filiais';

export const filialService = {
  listar:    (params) => api.get(BASE, { params }),
  obter:     (id) => api.get(`${BASE}/${id}`),
  criar:     (dados) => api.post(BASE, dados),
  atualizar: (id, dados) => api.put(`${BASE}/${id}`, dados),
};

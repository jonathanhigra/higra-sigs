import api from '../../lib/api';
const BASE = '/api/qualidade/rq49';
export const rq49Service = {
  formOptions:         () => api.get(`${BASE}/form-options`),
  listar:              (params) => api.get(BASE, { params }),
  obter:               (id) => api.get(`${BASE}/${id}`),
  criar:               (dados) => api.post(BASE, dados),
  atualizar:           (id, dados) => api.put(`${BASE}/${id}`, dados),
  analiseSignificancia:(id, dados) => api.put(`${BASE}/${id}/analise-significancia`, dados),
  addAnotacao:         (id, dados) => api.post(`${BASE}/${id}/anotacoes`, dados),
  addAvaliacao:        (id, dados) => api.post(`${BASE}/${id}/avaliacoes`, dados),
  listarProjetos:      (id) => api.get(`${BASE}/${id}/projetos`),
  associarProjeto:     (id, dados) => api.post(`${BASE}/${id}/projetos`, dados),
  desassociarProjeto:  (id, regId) => api.delete(`${BASE}/${id}/projetos/${regId}`),
  buscarProjetos:      (q) => api.get(`${BASE}/buscar-projetos`, { params: { q } }),
  listarTarefas:       (id) => api.get(`${BASE}/${id}/tarefas`),
  associarTarefa:      (id, dados) => api.post(`${BASE}/${id}/tarefas`, dados),
  desassociarTarefa:   (id, regId) => api.delete(`${BASE}/${id}/tarefas/${regId}`),
  buscarTarefas:       (q) => api.get(`${BASE}/buscar-tarefas`, { params: { q } }),
  listarAnexos:        (id, tipo) => api.get(`${BASE}/${id}/anexos`, { params: tipo ? { tipo } : {} }),
  uploadAnexo:         (id, formData) => api.post(`${BASE}/${id}/anexos`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAnexo:         (id, anxId) => api.delete(`${BASE}/${id}/anexos/${anxId}`),
  anexoImagemUrl:      (id, anxId) => `${BASE}/${id}/anexos/${anxId}/imagem`,
};

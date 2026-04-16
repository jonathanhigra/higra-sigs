import api from '../../lib/api';
const BASE = '/api/fabricacao';
export const checklistService = {
  modelos:     () => api.get(`${BASE}/modelos`),
  listar:      (params) => api.get(BASE, { params }),  // params: status, modelo, com_ens_hid
  kanban:      () => api.get(`${BASE}/kanban`),
  obter:       (id) => api.get(`${BASE}/${id}`),
  criar:       (dados) => api.post(BASE, dados),
  atualizar:   (id, dados) => api.put(`${BASE}/${id}`, dados),
  criarOcorrencia: (cklId, dados) => api.post(`${BASE}/${cklId}/ocorrencias`, dados),
  instrumentos:    (params) => api.get(`${BASE}/instrumentos/lista`, { params }),
  criarInstrumento:(dados) => api.post(`${BASE}/instrumentos`, dados),
  // Dashboard produtividade
  dashProdutividade: (params) => api.get(`${BASE}/dashboard/produtividade`, { params }),
  // Step-by-step (APEX pg 291 + 138/142/144/146/148/150/152/154/211)
  getSteps:       (cklId) => api.get(`${BASE}/${cklId}/steps`),
  iniciarStep:    (cklId, stepKey) => api.post(`${BASE}/${cklId}/steps/${stepKey}/iniciar`),
  concluirStep:   (cklId, stepKey, dados) => api.post(`${BASE}/${cklId}/steps/${stepKey}/concluir`, dados || {}),
  salvarStep:     (cklId, stepKey, dados) => api.put(`${BASE}/${cklId}/steps/${stepKey}`, dados),
  getStepDados:   (cklId, stepKey) => api.get(`${BASE}/${cklId}/steps/${stepKey}/dados`),
  etiqueta:       (cklId) => api.get(`${BASE}/steps/${cklId}/etiqueta`),
};

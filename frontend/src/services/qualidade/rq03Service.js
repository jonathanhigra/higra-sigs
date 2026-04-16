import api from '../../lib/api';
const BASE = '/api/qualidade/rq03';
export const rq03Service = {
  resumo:       () => api.get(`${BASE}/resumo`),
  listar:       (params) => api.get(BASE, { params }),
  obter:        (id) => api.get(`${BASE}/${id}`),
  criar:        (dados) => api.post(BASE, dados),
  atualizar:    (id, dados) => api.put(`${BASE}/${id}`, dados),
  salvarAnalise:(id, etapa, dados) => api.put(`${BASE}/${id}/analise/${etapa}`, dados),
  encerrar:     (id) => api.post(`${BASE}/${id}/encerrar`),
  reabrir:      (id) => api.post(`${BASE}/${id}/reabrir`),
  addAnotacao:  (id, dados) => api.post(`${BASE}/${id}/anotacoes`, dados),
  addEquipe:    (id, dados) => api.post(`${BASE}/${id}/equipe`, dados),
  getSst:       (id) => api.get(`${BASE}/${id}/sst`),
  salvarSst:    (id, dados) => api.post(`${BASE}/${id}/sst`, dados),
  // Evidências antes/depois (tarefa 263)
  listarEvidencias: (id, tipo) => api.get(`${BASE}/${id}/evidencias`, { params: tipo ? { tipo } : {} }),
  uploadEvidencia:  (id, formData) => api.post(`${BASE}/${id}/evidencias`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteEvidencia:  (id, evidId) => api.delete(`${BASE}/${id}/evidencias/${evidId}`),
  // PDF (tarefa 270)
  pdfUrl:           (id) => `${BASE}/${id}/pdf`,
  // State machine (tarefa 267)
  transicoesDisponiveis: (id) => api.get(`${BASE}/${id}/transicoes`),
  executarTransicao:     (id, dados) => api.post(`${BASE}/${id}/transicao`, dados),
  historicoTransicoes:   (id) => api.get(`${BASE}/${id}/historico-transicoes`),
  // Analytics (tarefas 271-272)
  paretoCausas:     (limit) => api.get(`${BASE}/analytics/pareto-causas`, { params: { limit } }),
  tempoFechamento:  () => api.get(`${BASE}/analytics/tempo-fechamento`),
  timeline:         (id) => api.get(`${BASE}/${id}/timeline`),
  rastreabilidade:  (id) => api.get(`${BASE}/${id}/rastreabilidade`),
};

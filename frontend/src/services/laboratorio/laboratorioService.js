import api from '../../lib/api';
const BASE = '/api/laboratorio';
export const laboratorioService = {
  listarTestes:    (params) => api.get(`${BASE}/testes`, { params }),
  obterTeste:      (id) => api.get(`${BASE}/testes/${id}`),
  criarTeste:      (dados) => api.post(`${BASE}/testes`, dados),
  atualizarTeste:  (id, dados) => api.put(`${BASE}/testes/${id}`, dados),
  addResultado:    (tstId, dados) => api.post(`${BASE}/testes/${tstId}/resultados`, dados),
  repetirTeste:    (id, dados) => api.post(`${BASE}/testes/${id}/repetir`, dados),
  listarCondicoes: (tstId) => api.get(`${BASE}/testes/${tstId}/condicoes`),
  addCondicoes:    (tstId, dados) => api.post(`${BASE}/testes/${tstId}/condicoes`, dados),
  equipes:         () => api.get(`${BASE}/equipes`),
  tiposTeste:      () => api.get(`${BASE}/config/tipos-teste`),
  criarTipoTeste:  (dados) => api.post(`${BASE}/config/tipos-teste`, dados),
  excluirTipoTeste:(id) => api.delete(`${BASE}/config/tipos-teste/${id}`),
  equipamentos:    () => api.get(`${BASE}/config/equipamentos`),
  listarLabs:      () => api.get(`${BASE}/config/labs`),
  criarLab:        (dados) => api.post(`${BASE}/config/labs`, dados),
  excluirLab:      (id) => api.delete(`${BASE}/config/labs/${id}`),
  simulacoes:      (params) => api.get(`${BASE}/bancada/simulacoes`, { params }),
  stats:           () => api.get(`${BASE}/stats`),
  historicoModelo: (params) => api.get(`${BASE}/historico-modelo`, { params }),
};

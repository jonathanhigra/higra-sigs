import api from '../../lib/api';
const BASE = '/api/indicadores/metas';
export const metaService = {
  listar:     (params) => api.get(BASE, { params }),
  dashboard:  () => api.get(`${BASE}/dashboard`),
  obter:      (id) => api.get(`${BASE}/${id}`),
  criar:      (dados) => api.post(BASE, dados),
  atualizar:  (id, dados) => api.put(`${BASE}/${id}`, dados),
  apontar:    (metaId, dados) => api.post(`${BASE}/${metaId}/apontamentos`, dados),
  // Unidades de Medida
  listarUnidades: () => api.get(`${BASE}/unidades`),
  criarUnidade:   (dados) => api.post(`${BASE}/unidades`, dados),
  excluirUnidade: (id) => api.delete(`${BASE}/unidades/${id}`),
  // Tendências
  listarTendencias: () => api.get(`${BASE}/tendencias`),
  criarTendencia:   (dados) => api.post(`${BASE}/tendencias`, dados),
  excluirTendencia: (id) => api.delete(`${BASE}/tendencias/${id}`),
  // Semáforos
  listarSemaforos: (params) => api.get(`${BASE}/semaforos`, { params }),
  criarSemaforo:   (dados) => api.post(`${BASE}/semaforos`, dados),
  excluirSemaforo: (id) => api.delete(`${BASE}/semaforos/${id}`),
  // Dashboards e Relatórios
  dashboardConsolidado: (params) => api.get(`${BASE}/dashboard-consolidado`, { params }),
  relatorioRisco:       (params) => api.get(`${BASE}/relatorio-risco`, { params }),
  // Ano Fiscal
  listarAnosFiscais: () => api.get(`${BASE}/ano-fiscal`),
  criarAnoFiscal:    (dados) => api.post(`${BASE}/ano-fiscal`, dados),
  excluirAnoFiscal:  (id) => api.delete(`${BASE}/ano-fiscal/${id}`),
  // Distribuição de Metas
  listarDistribuicao: (metaId, params) => api.get(`${BASE}/${metaId}/distribuicao`, { params }),
  criarDistribuicao:  (metaId, dados) => api.post(`${BASE}/${metaId}/distribuicao`, dados),
  excluirDistribuicao:(metaId, id) => api.delete(`${BASE}/${metaId}/distribuicao/${id}`),
};

import api from '../../lib/api';

const BASE = '/api/tarefas';

function withParams(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  return Object.keys(clean).length ? { params: clean } : undefined;
}

export const tarefaService = {
  listar:          (params) => api.get(BASE, { params }),
  obter:           (id) => api.get(`${BASE}/${id}`),
  criar:           (dados) => api.post(BASE, dados),
  atualizar:       (id, dados) => api.put(`${BASE}/${id}`, dados),
  excluir:         (id) => api.delete(`${BASE}/${id}`),
  proximoCodigo:   () => api.get(`${BASE}/proximo-codigo`),
  exportarCSV:     (params) => api.get(`${BASE}/exportar`, { params, responseType: 'blob' }),
  pendentesCount:  () => api.get(`${BASE}/pendentes-count`),
  // Apontamento manual
  apontar:         (tarefaId, dados) => api.post(`${BASE}/${tarefaId}/apontamentos`, dados),
  // Time tracking
  iniciar:         (tarefaId) => api.post(`${BASE}/${tarefaId}/iniciar`),
  pausar:          (tarefaId) => api.post(`${BASE}/${tarefaId}/pausar`),
  entregar:        (tarefaId) => api.post(`${BASE}/${tarefaId}/entregar`),
  // Ações em lote
  batch:           (dados) => api.post(`${BASE}/batch`, dados),
  // Subtarefas
  criarSubtarefa:  (paiId, dados) => api.post(`${BASE}/${paiId}/subtarefas`, dados),
  // Dependências
  adicionarDep:    (tarefaId, dados) => api.post(`${BASE}/${tarefaId}/dependencias`, dados),
  removerDep:      (tarefaId, depId) => api.delete(`${BASE}/${tarefaId}/dependencias/${depId}`),
  // Kanban
  kanbanBoard:     (params) => api.get(`${BASE}/kanban/board`, { params }),
  kanbanMover:     (tarefaId, dados) => api.put(`${BASE}/kanban/mover/${tarefaId}`, dados),
  // Apontamentos avulsos
  listarAvulsos:   (params) => api.get(`${BASE}/apontamentos-avulsos`, { params }),
  criarAvulso:     (dados) => api.post(`${BASE}/apontamentos-avulsos`, dados),
  excluirAvulso:   (id) => api.delete(`${BASE}/apontamentos-avulsos/${id}`),
  // Relatório de apontamentos
  relatorioApontamentos: (params) => api.get(`${BASE}/relatorio-apontamentos`, { params }),
};

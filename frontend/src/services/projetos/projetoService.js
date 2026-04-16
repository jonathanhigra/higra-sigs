import api from '../../lib/api';
const BASE = '/api/projetos';
export const projetoService = {
  listar:       (params) => api.get(BASE, { params }),
  obter:        (id) => api.get(`${BASE}/${id}`),
  criar:        (dados) => api.post(BASE, dados),
  atualizar:    (id, dados) => api.put(`${BASE}/${id}`, dados),
  alterarPrazos:(id, dados) => api.put(`${BASE}/alterar-prazos/${id}`, dados),
  copiar:       (id) => api.post(`${BASE}/copiar/${id}`),
  categorias:        () => api.get(`${BASE}/categorias`),
  criarCategoria:    (dados) => api.post(`${BASE}/categorias`, dados),
  atualizarCategoria:(id, dados) => api.put(`${BASE}/categorias/${id}`, dados),
  removerCategoria:  (id) => api.delete(`${BASE}/categorias/${id}`),
  criarEtapa:   (projId, dados) => api.post(`${BASE}/${projId}/etapas`, dados),
  atualizarEtapa: (etapaId, dados) => api.put(`${BASE}/etapas/${etapaId}`, dados),
  reordenarEtapas:(projId, ordem) => api.put(`${BASE}/${projId}/etapas/reordenar`, { ordem }),
  criarAnotacao:  (projId, dados) => api.post(`${BASE}/${projId}/anotacoes`, dados),
  addParticipante:(projId, dados) => api.post(`${BASE}/${projId}/participantes`, dados),
  atualizarParticipante: (partId, dados) => api.put(`${BASE}/participantes/${partId}`, dados),
  removerParticipante:   (partId) => api.delete(`${BASE}/participantes/${partId}`),
  criarGasto:     (projId, dados) => api.post(`${BASE}/${projId}/gastos`, dados),
  // CRM neg
  vincularNeg:    (projId, crmNegId) => api.put(`${BASE}/${projId}/vincular-neg`, { crm_neg_id: crmNegId }),
  desvincularNeg: (projId) => api.delete(`${BASE}/${projId}/desvincular-neg`),
  obterNegCrm:    (projId) => api.get(`${BASE}/${projId}/crm-neg`),
  kanban:         (projId) => api.get(`${BASE}/kanban/${projId}`),
  // Equipes Padrão
  listarEquipes:      () => api.get(`${BASE}/equipes-padrao`),
  criarEquipe:        (dados) => api.post(`${BASE}/equipes-padrao`, dados),
  removerEquipe:      (eqpId) => api.delete(`${BASE}/equipes-padrao/${eqpId}`),
  adicionarMembroEqp: (eqpId, dados) => api.post(`${BASE}/equipes-padrao/${eqpId}/membros`, dados),
  removerMembroEqp:   (eqpId, usrId) => api.delete(`${BASE}/equipes-padrao/${eqpId}/membros/${usrId}`),
  aplicarEquipe:      (projId, eqpId) => api.post(`${BASE}/${projId}/aplicar-equipe/${eqpId}`),
  // Tarefas fixas
  listarTodasTarefasFixas: (params) => api.get(`${BASE}/tarefas-fixas`, { params }),
  listarTarefasFixas: (projId) => api.get(`${BASE}/${projId}/tarefas-fixas`),
  criarTarefaFixa:    (projId, dados) => api.post(`${BASE}/${projId}/tarefas-fixas`, dados),
  removerTarefaFixa:  (projId, tfId) => api.delete(`${BASE}/${projId}/tarefas-fixas/${tfId}`),
  // RQ49
  listarRq49:     (projId) => api.get(`${BASE}/${projId}/rq49-vinculos`),
  vincularRq49:   (projId, rq49Id) => api.post(`${BASE}/${projId}/vincular-rq49`, { rq49_id: rq49Id }),
  desvincularRq49:(projId, rq49Id) => api.delete(`${BASE}/${projId}/vincular-rq49/${rq49Id}`),
};

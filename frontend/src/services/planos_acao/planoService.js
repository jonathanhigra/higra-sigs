import api from '../../lib/api';
const BASE = '/api/planos-acao';

function withParams(params = {}) {
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
  return Object.keys(cleanParams).length ? { params: cleanParams } : undefined;
}

export const planoService = {
  listar:    (params) => api.get(BASE, { params }),
  obter:     (id, params) => api.get(`${BASE}/${id}`, withParams(params)),
  criar:     (dados) => api.post(BASE, dados),
  atualizar: (id, dados, params) => api.put(`${BASE}/${id}`, dados, withParams(params)),
  excluir:   (id, params) => api.delete(`${BASE}/${id}`, withParams(params)),
  duplicar:  (id) => api.post(`${BASE}/${id}/duplicar`, {}),
  exportarCSV: (params) => api.get(`${BASE}/exportar`, { params, responseType: 'blob' }),
  // Tarefas vinculadas
  listarTarefas:         (planoId, params) => api.get(`${BASE}/${planoId}/tarefas`, withParams(params)),
  tarefasDisponiveis:    (planoId, search, params) => api.get(`${BASE}/${planoId}/tarefas/disponiveis`, { params: { search, ...(withParams(params)?.params || {}) } }),
  vincularTarefa:        (planoId, tarefaId, params) => api.post(`${BASE}/${planoId}/tarefas/vincular`, { hgr_tar_cad_tarefa_id: tarefaId }, withParams(params)),
  vincularMultiplasTarefas: (planoId, ids, params) => api.post(`${BASE}/${planoId}/tarefas/vincular-multiplos`, { tarefa_ids: ids }, withParams(params)),
  criarTarefa:           (planoId, dados, params) => api.post(`${BASE}/${planoId}/tarefas/criar`, dados, withParams(params)),
  desvincularTarefa:     (planoId, linkId, params) => api.delete(`${BASE}/${planoId}/tarefas/${linkId}`, withParams(params)),
  // Equipe
  listarEquipe:     (planoId, params) => api.get(`${BASE}/${planoId}/equipe`, withParams(params)),
  adicionarMembro:  (planoId, usuarioId, params) => api.post(`${BASE}/${planoId}/equipe`, { usuario_id: usuarioId }, withParams(params)),
  removerMembro:    (planoId, membroId, params) => api.delete(`${BASE}/${planoId}/equipe/${membroId}`, withParams(params)),
  // Evidências
  listarEvidencias: (planoId, params) => api.get(`${BASE}/${planoId}/evidencias`, withParams(params)),
  criarEvidencia:   (planoId, formData, params) => {
    const config = withParams(params) || {};
    return api.post(`${BASE}/${planoId}/evidencias`, formData, config);
  },
  baixarAnexo:      (planoId, evidId) => api.get(`${BASE}/${planoId}/evidencias/${evidId}/anexo`, { responseType: 'blob' }),
  excluirEvidencia: (planoId, evidId, params) => api.delete(`${BASE}/${planoId}/evidencias/${evidId}`, withParams(params)),
  // Histórico (paginado)
  listarHistorico:  (id, params) => api.get(`${BASE}/${id}/historico`, withParams(params)),
  // Lixeira (#20)
  listarLixeira:    (params) => api.get(`${BASE}/lixeira`, withParams(params)),
  restaurar:        (id) => api.post(`${BASE}/${id}/restaurar`, {}),
  // Contagem de pendentes/vencidos (#17)
  pendentesCount:   () => api.get(`${BASE}/pendentes-count`),
  // Reordenar tarefas (#11)
  reordenarTarefas: (planoId, ordem) => api.post(`${BASE}/${planoId}/tarefas/reordenar`, { ordem }),
  // Reagendar (alterar prazo com justificativa)
  reagendar:          (id, dados) => api.patch(`${BASE}/${id}/reagendar`, dados),
  // Encerrar com avaliação de eficácia
  encerrarEficacia:   (id, dados) => api.patch(`${BASE}/${id}/encerrar-eficacia`, dados),
  // Relatório vencidos
  relatorioVencidos:  (params) => api.get(`${BASE}/relatorio-vencidos`, { params }),
};

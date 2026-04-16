import api from '../../lib/api';
const BASE = '/api/documentos';
export const documentoService = {
  listar:       (params) => api.get(BASE, { params }),
  obter:        (id) => api.get(`${BASE}/${id}`),
  criar:        (dados) => api.post(BASE, dados),
  atualizar:    (id, dados) => api.put(`${BASE}/${id}`, dados),
  compartilhar: (docId, dados) => api.post(`${BASE}/${docId}/compartilhar`, dados),
  tipos:        () => api.get(`${BASE}/tipos/lista`),
  criarTipo:    (dados) => api.post(`${BASE}/tipos`, dados),
  excluirTipo:  (id) => api.delete(`${BASE}/tipos/${id}`),
  // Distribuição (processos vinculados)
  addDistribuicao:    (docId, dados) => api.post(`${BASE}/${docId}/distribuicao`, dados),
  removeDistribuicao: (docId, procId) => api.delete(`${BASE}/${docId}/distribuicao/${procId}`),
  // Revisões
  criarRevisao: (docId, dados) => api.post(`${BASE}/${docId}/revisoes`, dados),
  downloadUrl:  (revId) => `${BASE}/revisoes/${revId}/download`,
  logDownload:  (revId) => api.post(`${BASE}/revisoes/${revId}/log-download`),
  // Controle de acesso + próxima revisão
  atualizarAcesso: (docId, dados) => api.patch(`${BASE}/${docId}/acesso`, dados),
};

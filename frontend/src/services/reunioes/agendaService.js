import api from '../../lib/api';
const BASE = '/api/reunioes/agendas';
export const agendaService = {
  listar:           (params) => api.get(BASE, { params }),
  obter:            (id) => api.get(`${BASE}/${id}`),
  criar:            (dados) => api.post(BASE, dados),
  atualizar:        (id, dados) => api.put(`${BASE}/${id}`, dados),
  tipos:            () => api.get(`${BASE}/tipos`),
  criarTipo:        (dados) => api.post(`${BASE}/tipos`, dados),
  excluirTipo:      (id) => api.delete(`${BASE}/tipos/${id}`),
  pendentesCount:   () => api.get(`${BASE}/pendentes-count`),
  exportarCSV:      (params) => api.get(`${BASE}/exportar`, { params, responseType: 'blob' }),
  addParticipante:  (agendaId, dados) => api.post(`${BASE}/${agendaId}/participantes`, dados),
  marcarPresenca:   (agendaId, partId, dados) => api.patch(`${BASE}/${agendaId}/participantes/${partId}/presenca`, dados),
  addPauta:         (agendaId, dados) => api.post(`${BASE}/${agendaId}/pautas`, dados),
  seguirPauta:      (agendaId, pautaId, dados) => api.patch(`${BASE}/${agendaId}/pautas/${pautaId}/discussao`, dados),
  addDecisao:       (agendaId, dados) => api.post(`${BASE}/${agendaId}/decisoes`, dados),
  addAcao:          (agendaId, dados) => api.post(`${BASE}/${agendaId}/acoes`, dados),
  registrarDuracao: (agendaId, dados) => api.patch(`${BASE}/${agendaId}/duracao-real`, dados),
};

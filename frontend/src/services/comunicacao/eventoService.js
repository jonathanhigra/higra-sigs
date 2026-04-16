import api from '../../lib/api';
const BASE = '/api/comunicacao';
export const eventoService = {
  listar:          (params) => api.get(`${BASE}/eventos`, { params }),
  obter:           (id) => api.get(`${BASE}/eventos/${id}`),
  criar:           (dados) => api.post(`${BASE}/eventos`, dados),
  listarTipos:     () => api.get(`${BASE}/tipos`),
  criarTipo:       (dados) => api.post(`${BASE}/tipos`, dados),
  excluirTipo:     (id) => api.delete(`${BASE}/tipos/${id}`),
  // Participantes + RSVP
  listarParticipantes: (evtId) => api.get(`${BASE}/eventos/${evtId}/participantes`),
  addParticipante:     (evtId, dados) => api.post(`${BASE}/eventos/${evtId}/participantes`, dados),
  confirmarRSVP:       (evtId, partId, dados) => api.patch(`${BASE}/eventos/${evtId}/participantes/${partId}/rsvp`, dados),
  // Config (destaque, link, tags, dt_publicacao)
  config:          (evtId, dados) => api.patch(`${BASE}/eventos/${evtId}/config`, dados),
  // Leitura
  marcarLeitura:   (evtId) => api.post(`${BASE}/eventos/${evtId}/leitura`),
  quemLeu:         (evtId) => api.get(`${BASE}/eventos/${evtId}/leitura`),
  // Meus Eventos
  meusEventos:     (params) => api.get(`${BASE}/meus-eventos`, { params }),
};

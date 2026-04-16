import api from '../../lib/api';
const BASE = '/api/projetos/focco';

export const foccoService = {
  listarPVs:      (params) => api.get(`${BASE}/pvs`, { params }),
  obterPV:        (numeroPv) => api.get(`${BASE}/pvs/${numeroPv}`),
  status:         () => api.get(`${BASE}/status`),
  sync:           (days = 90) => api.post(`${BASE}/sync`, null, { params: { days } }),
  syncItems:      (numeroPv) => api.post(`${BASE}/sync-items/${numeroPv}`),
  vincularPV:     (projetoId, focco_pv) => api.put(`${BASE}/${projetoId}/vincular-pv`, { focco_pv }),
  desvincularPV:  (projetoId) => api.delete(`${BASE}/${projetoId}/vincular-pv`),
};

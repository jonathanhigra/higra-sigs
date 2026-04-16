/**
 * Utils Service — equivalente às functions PL/SQL do Oracle.
 * Expõe avatares, semáforos, progress, read-only controls, etc.
 */
import api from '../lib/api';

const BASE = '/api/utils';

export const utilsService = {
  // PCK_HGR_GAM
  avatar:         (userId) => api.get(`${BASE}/avatar/${userId}`),
  profile:        (userId) => api.get(`${BASE}/profile/${userId}`),
  // PCK_STH_STM
  usuarioNome:    (userId) => api.get(`${BASE}/usuario-nome/${userId}`),
  // Semáforo KPI
  semaforo:       (metaId) => api.get(`${BASE}/semaforo/${metaId}`),
  // Progress bar
  progress:       (valor) => api.get(BASE + '/progress', { params: { valor } }),
  // Task stats
  tarefasStats:   (params) => api.get(`${BASE}/tarefas-stats`, { params }),
  // Business days
  diasUteis:      (dtInicio, dtFim) => api.get(`${BASE}/dias-uteis`, { params: { dt_inicio: dtInicio, dt_fim: dtFim } }),
  // Read-only controls
  readOnlyTarefa: (id) => api.get(`${BASE}/read-only/tarefa/${id}`),
  readOnlyRq03:   (id) => api.get(`${BASE}/read-only/rq03/${id}`),
  readOnlyRq49:   (id) => api.get(`${BASE}/read-only/rq49/${id}`),
};

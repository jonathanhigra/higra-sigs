/**
 * LOV Service — dropdowns cascading equivalentes às 265 LOVs do Oracle APEX.
 * Padrões: TABLE LOV, SQL LOV (BEG_VALOR_DOMINIO), STATIC LOV, Cascading LOV.
 */
import api from '../lib/api';

const BASE = '/api/lov';

export const lovService = {
  // TABLE LOVs
  usuarios:       (params) => api.get(`${BASE}/usuarios`, { params }),
  empresas:       () => api.get(`${BASE}/empresas`),
  filiais:        (params) => api.get(`${BASE}/filiais`, { params }),
  minhasFiliais:  () => api.get(`${BASE}/minhas-filiais`),
  processos:      () => api.get(`${BASE}/processos`),

  // Cascading LOV: usuario → empresa/filial/processo
  usuarioContexto:(userId) => api.get(`${BASE}/usuarios/${userId}/contexto`),

  // SQL LOV (BEG_VALOR_DOMINIO pattern)
  dominio:        (nome) => api.get(`${BASE}/dominios/${nome}`),

  // STATIC LOV
  estatica:       (nome) => api.get(`${BASE}/static/${nome}`),
};

// Gamificação
export const gamificacaoService = {
  ranking: (params) => api.get('/api/gamificacao/ranking', { params }),
  meuXp:   () => api.get('/api/gamificacao/meu-xp'),
};

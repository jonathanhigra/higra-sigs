import api from '../../lib/api';
export const rq80Service = {
  listar: (params) => api.get('/api/qualidade/rq80', { params }),
  criar:  (dados) => api.post('/api/qualidade/rq80', dados),
  atualizar: (id, dados) => api.put(`/api/qualidade/rq80/${id}`, dados),
  obter: (id) => api.get(`/api/qualidade/rq80/${id}`),
};
export const rq94Service = {
  listar: (params) => api.get('/api/qualidade/rq94', { params }),
  criar:  (dados) => api.post('/api/qualidade/rq94', dados),
  obter: (id) => api.get(`/api/qualidade/rq94/${id}`),
};

export const sstService = {
  partesCorpo: () => api.get('/api/qualidade/sst/partes-corpo'),
  criarParteCorpo: (dados) => api.post('/api/qualidade/sst/partes-corpo', dados),
  atualizarParteCorpo: (id, dados) => api.put(`/api/qualidade/sst/partes-corpo/${id}`, dados),
  tiposAcidente: () => api.get('/api/qualidade/sst/tipos-acidente'),
  criarTipoAcidente: (dados) => api.post('/api/qualidade/sst/tipos-acidente', dados),
  agentes: () => api.get('/api/qualidade/sst/agentes-causadores'),
  criarAgente: (dados) => api.post('/api/qualidade/sst/agentes-causadores', dados),
  custos: (rq03Id) => api.get(`/api/qualidade/sst/rq03/${rq03Id}/custos`),
  addCusto: (rq03Id, dados) => api.post(`/api/qualidade/sst/rq03/${rq03Id}/custos`, dados),
  deleteCusto: (rq03Id, custoId) => api.delete(`/api/qualidade/sst/rq03/${rq03Id}/custos/${custoId}`),
  cat: (rq03Id) => api.get(`/api/qualidade/sst/rq03/${rq03Id}/cat`, { responseType: 'blob' }),
};

export const fmeaService = {
  listar: (params) => api.get('/api/qualidade/fmea', { params }),
  criar: (dados) => api.post('/api/qualidade/fmea', dados),
  obter: (id) => api.get(`/api/qualidade/fmea/${id}`),
  addItem: (id, dados) => api.post(`/api/qualidade/fmea/${id}/itens`, dados),
  updateItem: (id, itemId, dados) => api.put(`/api/qualidade/fmea/${id}/itens/${itemId}`, dados),
};

export const indicadoresQualService = {
  dashboard: (params) => api.get('/api/qualidade/indicadores', { params }),
};

export const rq80DetailService = {
  obter: (id) => api.get(`/api/qualidade/rq80/${id}`),
  atualizar: (id, dados) => api.put(`/api/qualidade/rq80/${id}`, dados),
  addChecklistItem: (id, dados) => api.post(`/api/qualidade/rq80/${id}/checklist-item`, dados),
  updateChecklistItem: (id, itemId, dados) => api.put(`/api/qualidade/rq80/${id}/checklist-item/${itemId}`, dados),
  addConstatacao: (id, dados) => api.post(`/api/qualidade/rq80/${id}/constatacoes`, dados),
  cronograma: (ano) => api.get('/api/qualidade/rq80/cronograma', { params: { ano } }),
};

export const rq94DetailService = {
  obter: (id) => api.get(`/api/qualidade/rq94/${id}`),
  atualizar: (id, dados) => api.put(`/api/qualidade/rq94/${id}`, dados),
  aprovar: (id) => api.post(`/api/qualidade/rq94/${id}/aprovar`, {}),
};

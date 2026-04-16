import api from '../../lib/api';

export const homeService = {
  dashboard: () => api.get('/api/home/dashboard'),
};

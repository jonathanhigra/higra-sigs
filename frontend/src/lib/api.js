import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL,
  timeout: 20000,
});

const getStoredToken = () => {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  } catch (error) {
    console.warn('Falha ao ler token do localStorage:', error);
    return null;
  }
};

const clearStoredToken = () => {
  try {
    localStorage.removeItem('token');
  } catch (error) {
    console.warn('Falha ao limpar token do localStorage:', error);
  }
};

// Attach Authorization header automatically if token exists
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token && !config.headers?.Authorization) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally — tenta refresh antes de redirecionar
let _isRefreshing = false;
let _refreshSubscribers = [];

function onRefreshDone(newToken) {
  _refreshSubscribers.forEach((cb) => cb(newToken));
  _refreshSubscribers = [];
}

// ------------------------------------------------------------
// Toast de 403 — evita "tela em branco silenciosa" quando o
// usuário não tem permissão para um módulo. Dedupe por URL para
// não spammar se várias requests do mesmo módulo falharem.
// ------------------------------------------------------------
const _recent403 = new Map(); // urlKey -> timestamp
const _403_DEDUPE_MS = 3000;

function extractModuleKey(url) {
  // /api/qualidade/rq03/resumo  -> "qualidade/rq03"
  // /api/tarefas/                -> "tarefas"
  // /api/fabricacao/123/foo      -> "fabricacao"
  const m = (url || '').match(/\/api\/([^/?]+)(?:\/([^/?]+))?/);
  if (!m) return url || 'este recurso';
  return m[2] && !/^\d+$/.test(m[2]) ? `${m[1]}/${m[2]}` : m[1];
}

function notifyForbidden(url) {
  if (typeof window === 'undefined') return;
  const key = extractModuleKey(url);
  const last = _recent403.get(key);
  const now = Date.now();
  if (last && now - last < _403_DEDUPE_MS) return;
  _recent403.set(key, now);

  // Usa toast global via evento custom (funciona fora do React tree)
  const msg = `Sem permissão para acessar "${key}". Fale com o administrador.`;
  window.dispatchEvent(new CustomEvent('api-forbidden', { detail: { url, key, message: msg } }));
  // Fallback: log estruturado no console para debug
  console.warn('[api] 403 Forbidden:', url, '→', msg);
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalRequest = error?.config;
    const url = originalRequest?.url || '';

    // 403 — sem permissão: notifica UI e rejeita
    if (status === 403) {
      notifyForbidden(url);
      return Promise.reject(error);
    }

    if (status !== 401 || url.includes('/login') || url.includes('/register') || url.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    // Evitar refresh paralelo
    if (originalRequest._retry) {
      clearStoredToken();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }

    if (_isRefreshing) {
      return new Promise((resolve) => {
        _refreshSubscribers.push((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          resolve(api(originalRequest));
        });
      });
    }

    _isRefreshing = true;
    originalRequest._retry = true;

    try {
      const token = getStoredToken();
      const { data } = await axios.post(`${baseURL}/auth/refresh`, null, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      const newToken = data.access_token;
      localStorage.setItem('token', newToken);
      onRefreshDone(newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch {
      clearStoredToken();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return Promise.reject(error);
    } finally {
      _isRefreshing = false;
    }
  }
);

export default api;

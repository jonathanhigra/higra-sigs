export function getErrorMessage(error, fallback = 'Erro inesperado') {
  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const joined = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const field = Array.isArray(item.loc) ? item.loc.join('.') : '';
          const msg = item.msg || item.message || JSON.stringify(item);
          return field ? `${field}: ${msg}` : `${msg}`;
        }
        return String(item);
      })
      .filter(Boolean)
      .join(' | ');
    if (joined) return joined;
  }

  if (detail && typeof detail === 'object') {
    if (typeof detail.message === 'string' && detail.message.trim()) {
      return detail.message.trim();
    }
    if (typeof detail.error === 'string' && detail.error.trim()) {
      return detail.error.trim();
    }
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}


export const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    let normalized = value.trim();
    if (/^\d{4}-\d{2}-\d{2} \d/.test(normalized)) {
      normalized = normalized.replace(' ', 'T');
    }
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
      normalized += 'Z';
    }
    return new Date(normalized);
  }
  return new Date(value);
};

export const formatTime = (value) => {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  const now = new Date();
  const sameYear = now.getFullYear() === date.getFullYear();
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
};

export const formatDateLabel = (value) => {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today - msgDay) / 86400000);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: diffDays > 365 ? 'numeric' : undefined });
};

export const getDateKey = (value) => {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

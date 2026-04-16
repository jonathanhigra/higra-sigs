const _apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const buildAvatarSrc = (photo, mime, userId) => {
  if (photo) {
    const safeMime = mime || 'image/jpeg';
    return `data:${safeMime};base64,${photo}`;
  }
  if (userId) return `${_apiBase}/social/avatar/${userId}`;
  return null;
};

export const buildMediaSrc = (item) => {
  if (!item) return null;
  if (typeof item === 'string') return item;
  if (item.url) return item.url;
  if (item.data) {
    const safeMime = item.mime || 'image/jpeg';
    return `data:${safeMime};base64,${item.data}`;
  }
  return null;
};

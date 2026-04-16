/**
 * Utilitários de formatação e transformação.
 * Funções puras, sem dependências externas.
 */

/* ── DATAS ───────────────────────────────────────────────── */

/** Formata dd/mm/yyyy. Aceita Date, string ISO ou timestamp. */
export function formatDate(value) {
  if (!value) return '—';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  } catch { return '—'; }
}

/** Formata dd/mm/yyyy HH:mm */
export function formatDateTime(value) {
  if (!value) return '—';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  } catch { return '—'; }
}

/** Formata HH:mm a partir de "HH:mm:ss" ou Date */
export function formatTime(value) {
  if (!value) return '—';
  if (typeof value === 'string' && value.includes(':')) return value.substring(0, 5);
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return '—';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return '—'; }
}

/** "há 2 horas", "há 3 dias", "agora mesmo" */
export function relativeDate(value) {
  if (!value) return '—';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return '—';
    const diff = Math.round((Date.now() - d.getTime()) / 1000); // segundos
    if (diff < 10) return 'agora mesmo';
    if (diff < 60) return `há ${diff}s`;
    if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `há ${Math.floor(diff / 86400)}d`;
    if (diff < 2592000) return `há ${Math.floor(diff / 604800)}sem`;
    if (diff < 31536000) return `há ${Math.floor(diff / 2592000)}mês`;
    return `há ${Math.floor(diff / 31536000)}a`;
  } catch { return '—'; }
}

/** Dias até a data (negativo se passada). */
export function daysUntil(value) {
  if (!value) return null;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.round((d - hoje) / 86400000);
  } catch { return null; }
}

/* ── NÚMEROS ─────────────────────────────────────────────── */

/** Formata número com separador de milhar pt-BR. */
export function formatNumber(value, decimals = 0) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Formata como R$ 1.234,56 */
export function formatCurrency(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Formata bytes: 1.2 KB, 3.4 MB, etc */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Plural pt-BR: pluralize(2, 'item', 'itens') → '2 itens' */
export function pluralize(count, singular, plural) {
  return `${formatNumber(count)} ${count === 1 ? singular : (plural || `${singular}s`)}`;
}

/* ── STRINGS ─────────────────────────────────────────────── */

/** Trunca preservando palavras e adicionando "…" */
export function truncate(text, max = 80) {
  if (!text) return '';
  const s = String(text);
  if (s.length <= max) return s;
  const cut = s.substring(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max - 20 ? cut.substring(0, lastSpace) : cut) + '…';
}

/** Primeira letra maiúscula. */
export function capitalize(text) {
  if (!text) return '';
  const s = String(text);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** "João Silva Santos" → "JS" */
export function getInitials(name, max = 2) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase().substring(0, max);
}

/** Remove acentos e transforma em url-safe. */
export function slugify(text) {
  if (!text) return '';
  return String(text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Remove acentos (útil para busca). */
export function normalize(text) {
  if (!text) return '';
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/* ── MÁSCARAS ────────────────────────────────────────────── */

/** "11987654321" → "(11) 98765-4321" */
export function formatPhone(value) {
  if (!value) return '';
  const d = String(value).replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value;
}

/** "12345678900" → "123.456.789-00" */
export function formatCPF(value) {
  if (!value) return '';
  const d = String(value).replace(/\D/g, '');
  if (d.length !== 11) return value;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** "12345678000100" → "12.345.678/0001-00" */
export function formatCNPJ(value) {
  if (!value) return '';
  const d = String(value).replace(/\D/g, '');
  if (d.length !== 14) return value;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/* ── CLIPBOARD / DOWNLOAD ────────────────────────────────── */

/** Copia texto para clipboard. Retorna Promise<boolean>. */
export async function copyToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(String(text));
      return true;
    }
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = String(text);
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/** Dispara download de um Blob/texto. */
export function downloadBlob(data, filename, mimeType = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Converte array de objetos em CSV. */
export function toCSV(rows, columns) {
  if (!rows || rows.length === 0) return '';
  const cols = columns || Object.keys(rows[0]);
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map(c => escape(c.label || c.key || c)).join(';');
  const body = rows.map(row =>
    cols.map(c => escape(typeof c === 'string' ? row[c] : (c.render ? c.render(row) : row[c.key]))).join(';')
  ).join('\n');
  return `\uFEFF${header}\n${body}`;
}

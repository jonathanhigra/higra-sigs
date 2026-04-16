import { normalize } from '../../utils/format';

/**
 * Destaca o termo buscado dentro de um texto.
 *
 *   <SearchHighlight text={item.titulo} query={search} />
 */
export default function SearchHighlight({ text, query, className }) {
  if (!text) return <span className={className}>—</span>;
  if (!query || !query.trim()) return <span className={className}>{text}</span>;

  const source = String(text);
  const normalizedSource = normalize(source);
  const normalizedQuery = normalize(query.trim());
  if (!normalizedQuery) return <span className={className}>{source}</span>;

  const parts = [];
  let lastIdx = 0;
  let idx = normalizedSource.indexOf(normalizedQuery);
  while (idx !== -1) {
    if (idx > lastIdx) parts.push({ text: source.slice(lastIdx, idx), hl: false });
    parts.push({ text: source.slice(idx, idx + normalizedQuery.length), hl: true });
    lastIdx = idx + normalizedQuery.length;
    idx = normalizedSource.indexOf(normalizedQuery, lastIdx);
  }
  if (lastIdx < source.length) parts.push({ text: source.slice(lastIdx), hl: false });

  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.hl ? <mark key={i} style={{ background: 'rgba(234, 179, 8, 0.35)', color: 'inherit', padding: '0 2px', borderRadius: 2 }}>{p.text}</mark>
             : <span key={i}>{p.text}</span>
      )}
    </span>
  );
}

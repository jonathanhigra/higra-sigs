import useCopyToClipboard from '../../hooks/useCopyToClipboard';

/**
 * Botão de ícone que copia texto e mostra feedback visual.
 *
 *   <CopyButton value={item.codigo} label="Copiar código" />
 */
export default function CopyButton({ value, label = 'Copiar', size = 14, className, style }) {
  const [copied, copy] = useCopyToClipboard();

  return (
    <button
      type="button"
      className={className}
      onClick={(e) => { e.stopPropagation(); copy(value); }}
      title={copied ? 'Copiado!' : label}
      aria-label={copied ? 'Copiado' : label}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: copied ? '#22c55e' : 'var(--text-muted, #9a9aa2)',
        display: 'inline-flex', alignItems: 'center', padding: 4, borderRadius: 4,
        transition: 'color 0.15s',
        ...style,
      }}
    >
      {copied ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

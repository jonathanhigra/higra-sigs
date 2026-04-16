import { useEffect, useRef } from 'react';

/**
 * SearchBar reutilizável.
 * Novidades:
 *  - Atalho "/" foca o input (shortcut="/")
 *  - Botão "×" para limpar quando há texto
 *  - Forward ref opcional
 */
export default function SearchBar({
  value,
  onChange,
  placeholder = 'Pesquisar...',
  shortcut,
  autoFocus = false,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      if (e.key === shortcut && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  const hasValue = value != null && value !== '';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--bg-input)', border: '1px solid var(--border-primary)',
      borderRadius: 8, padding: '6px 10px', maxWidth: 320, flex: 1,
      transition: 'border-color 0.15s',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        ref={inputRef}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{
          border: 'none', background: 'transparent', color: 'var(--text-primary)',
          fontSize: '0.85rem', outline: 'none', width: '100%',
        }}
      />
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpar busca"
          title="Limpar"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: 0, display: 'flex', alignItems: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </button>
      )}
      {shortcut && !hasValue && (
        <kbd style={{
          fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3,
          background: 'var(--bg-primary)', color: 'var(--text-muted)',
          border: '1px solid var(--border-subtle, var(--border-primary))', marginLeft: 4,
        }}>{shortcut}</kbd>
      )}
    </div>
  );
}

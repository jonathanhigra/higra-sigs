const DEFAULT_ICONS = {
  search: (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  empty: (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  error: (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  inbox: (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  folder: (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

import { memo } from 'react';

const EmptyState = memo(function EmptyState({
  icon,
  variant = 'empty',
  title,
  description,
  action,
  onAction,
  children,
}) {
  const iconEl = icon || DEFAULT_ICONS[variant] || DEFAULT_ICONS.empty;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 10, padding: '48px 20px', color: 'var(--text-muted)', textAlign: 'center',
    }}>
      <div style={{ opacity: 0.6 }}>{iconEl}</div>
      <p style={{ fontSize: '0.95rem', margin: '6px 0 0', color: 'var(--text-primary)', fontWeight: 600 }}>
        {title || 'Nenhum dado encontrado'}
      </p>
      {description && (
        <p style={{ fontSize: '0.82rem', margin: 0, maxWidth: 420, lineHeight: 1.5 }}>{description}</p>
      )}
      {action && onAction && (
        <button onClick={onAction} style={{
          background: 'var(--accent, #3b82f6)', color: '#fff', border: 'none',
          padding: '8px 20px', borderRadius: 8,
          fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', marginTop: 6,
        }}>{action}</button>
      )}
      {children}
    </div>
  );
});

export default EmptyState;

export default function DetailSection({ title, actions, children }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
      borderRadius: 'var(--radius-lg)', padding: 'var(--sp-5)',
      marginBottom: 'var(--sp-4)',
    }}>
      {(title || actions) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
          {title && <h3 style={{ margin: 0, fontSize: 'var(--font-md)', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>}
          {actions && <div style={{ display: 'flex', gap: 6 }}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

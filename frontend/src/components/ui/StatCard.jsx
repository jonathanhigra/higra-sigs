export default function StatCard({ label, value, color, onClick }) {
  return (
    <div onClick={onClick} style={{
      flex: 1, minWidth: 100, background: 'var(--bg-secondary)',
      border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
      padding: 'var(--sp-3) var(--sp-4)', cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.12s, box-shadow 0.12s',
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}}
    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: color || 'var(--sigs-primary)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginTop: 'var(--sp-1)', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

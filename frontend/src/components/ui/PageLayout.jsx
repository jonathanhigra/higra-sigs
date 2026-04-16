export default function PageLayout({ sidebar, children }) {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
      {sidebar && <aside style={{ width: 'var(--sidebar-width, 220px)', flexShrink: 0, padding: '20px 16px', borderRight: '1px solid var(--border-primary)' }}>{sidebar}</aside>}
      <main style={{ flex: 1, padding: '16px 24px', overflow: 'auto' }}>{children}</main>
    </div>
  );
}

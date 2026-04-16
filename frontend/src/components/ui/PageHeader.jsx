export default function PageHeader({ title, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4, 16px)' }}>
      <h1 style={{ margin: 0, fontSize: 'var(--font-xl, 1.25rem)', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h1>
      {children}
    </div>
  );
}

export default function FilterBadges({ badges, active, onToggle }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {badges.map(b => {
        const isActive = active.includes(b.key);
        return (
          <button key={b.key} onClick={() => onToggle(b.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 'var(--font-xs)', fontWeight: 600,
              background: b.bg || '#666', color: '#fff',
              opacity: isActive ? 1 : 0.35,
              transition: 'opacity 0.15s, transform 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; }}>
            <span style={{
              width: 14, height: 14, border: '1.5px solid rgba(255,255,255,0.5)',
              borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6rem', background: isActive ? 'rgba(255,255,255,0.3)' : 'transparent',
            }}>{isActive ? '\u2713' : ''}</span>
            {b.label}
            {b.count !== undefined && (
              <span style={{ background: 'rgba(0,0,0,0.2)', padding: '0 5px', borderRadius: 8, fontSize: '0.65rem' }}>{b.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

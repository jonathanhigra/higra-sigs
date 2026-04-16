import { getInitials } from '../../utils/format';

const COLORS = ['#00A0DF','#4caf50','#ff9800','#9c27b0','#ef4444','#3f51b5','#009688','#795548','#e91e63','#607d8b'];

function hashColor(name) {
  if (!name) return COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

export default function UserAvatar({ name, size = 32, onClick, highlight, title, src }) {
  const initials = getInitials(name);
  const tooltipText = title || name;
  const fontSize = Math.max(10, Math.round(size * 0.4));
  return (
    <div
      onClick={onClick}
      title={tooltipText}
      role={src || onClick ? 'button' : 'img'}
      aria-label={name ? `Avatar de ${name}` : 'Avatar'}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: src ? 'transparent' : hashColor(name), color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize, fontWeight: 700, flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        outline: highlight ? '2px solid var(--accent, var(--sigs-primary))' : 'none',
        boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.12))',
        overflow: 'hidden',
      }}
    >
      {src ? (
        <img src={src} alt={name || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : initials}
    </div>
  );
}

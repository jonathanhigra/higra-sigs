/**
 * Pequeno círculo colorido para indicar status inline.
 *
 *   <StatusDot color="success" /> Online
 */
const COLORS = {
  success: '#22c55e',
  danger:  '#ef4444',
  warning: '#f59e0b',
  info:    '#3b82f6',
  muted:   '#9a9aa2',
  purple:  '#9333ea',
};

export default function StatusDot({ color = 'info', size = 8, pulse = false, title }) {
  const c = COLORS[color] || color;
  return (
    <span
      title={title}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size, height: size,
        borderRadius: '50%',
        background: c,
        boxShadow: pulse ? `0 0 0 0 ${c}80` : 'none',
        animation: pulse ? 'statusPulse 1.8s ease-out infinite' : 'none',
        verticalAlign: 'middle',
      }}
    >
      {pulse && <style>{`@keyframes statusPulse { 0%{box-shadow:0 0 0 0 ${c}80} 70%{box-shadow:0 0 0 8px ${c}00} 100%{box-shadow:0 0 0 0 ${c}00} }`}</style>}
    </span>
  );
}

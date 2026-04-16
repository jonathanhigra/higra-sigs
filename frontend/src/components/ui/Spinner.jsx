/**
 * Spinner circular consistente.
 * Tamanhos: sm (16), md (24), lg (40).
 */
export default function Spinner({ size = 'md', color, label = 'Carregando' }) {
  const px = size === 'sm' ? 16 : size === 'lg' ? 40 : 24;
  const stroke = size === 'sm' ? 2 : 3;
  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: 'inline-block', width: px, height: px,
        border: `${stroke}px solid currentColor`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spinnerSpin 0.8s linear infinite',
        color: color || 'var(--accent, #3b82f6)',
        verticalAlign: 'middle',
      }}
    >
      <style>{`@keyframes spinnerSpin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

const STATUS_STYLES = {
  ABERTA:       { bg: 'var(--status-aberta)',    color: '#fff' },
  ABERTO:       { bg: 'var(--status-aberta)',    color: '#fff' },
  EM_ANDAMENTO: { bg: 'var(--status-andamento)', color: '#fff' },
  EM_ESPERA:    { bg: 'var(--status-espera)',    color: '#fff' },
  CONCLUIDA:    { bg: 'var(--status-concluida)', color: '#fff' },
  CONCLUIDO:    { bg: 'var(--status-concluida)', color: '#fff' },
  CANCELADA:    { bg: 'var(--status-cancelada)', color: '#fff' },
  CANCELADO:    { bg: 'var(--status-cancelada)', color: '#fff' },
  ATRASADA:     { bg: 'var(--status-atrasada)',  color: '#fff' },
  IMPLEMENTADO: { bg: 'var(--color-success)',    color: '#fff' },
  PENDENTE:     { bg: 'var(--color-info)',       color: '#fff' },
  FECHADA:      { bg: 'var(--color-success)',    color: '#fff' },
  ATIVO:        { bg: 'var(--color-success)',    color: '#fff' },
  INATIVO:      { bg: '#666',                    color: '#fff' },
  FINALIZADO:   { bg: 'var(--color-success)',    color: '#fff' },
  ENCERRADA:    { bg: 'var(--color-warning)',    color: '#fff' },
  AGENDADA:     { bg: 'var(--color-info)',       color: '#fff' },
  PROCEDENTE:   { bg: 'var(--color-success)',    color: '#fff' },
  IMPROCEDENTE: { bg: '#ef4444',                 color: '#fff' },
  EM_ANALISE:   { bg: '#f59e0b',                 color: '#fff' },
};

const HUMAN_LABELS = {
  EM_ANDAMENTO: 'Em Andamento',
  EM_ESPERA:    'Em Espera',
  EM_ANALISE:   'Em Análise',
};

export default function StatusBadge({ status, label, size = 'md' }) {
  const key = (status || '').toUpperCase();
  const s = STATUS_STYLES[key] || { bg: '#666', color: '#fff' };
  const display = label || HUMAN_LABELS[key] || (status ? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

  const padding = size === 'sm' ? '1px 7px' : size === 'lg' ? '4px 14px' : '2px 10px';
  const fontSize = size === 'sm' ? '0.66rem' : size === 'lg' ? '0.82rem' : '0.72rem';

  return (
    <span
      role="status"
      aria-label={`Status: ${display}`}
      style={{
        display: 'inline-block', padding, borderRadius: 12,
        background: s.bg, color: s.color, fontSize,
        fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '0.02em',
      }}
    >
      {display}
    </span>
  );
}

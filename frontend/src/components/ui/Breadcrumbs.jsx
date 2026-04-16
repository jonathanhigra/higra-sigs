import { Link } from 'react-router-dom';

/**
 * Breadcrumb reutilizável com suporte a links e item final desabilitado.
 *
 *   <Breadcrumbs items={[
 *     { label: 'Tarefas', to: '/tarefas' },
 *     { label: tarefa.titulo },
 *   ]} />
 */
export default function Breadcrumbs({ items = [], separator = '›' }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" style={{ fontSize: '0.78rem', color: 'var(--text-muted, #9a9aa2)', marginBottom: 10 }}>
      <ol style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((it, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {it.to && !isLast ? (
                <Link to={it.to} style={{ color: 'var(--accent, #3b82f6)', textDecoration: 'none' }}>
                  {it.label}
                </Link>
              ) : (
                <span style={{ color: isLast ? 'var(--text-primary, #f1f1f6)' : 'var(--text-muted)', fontWeight: isLast ? 600 : 400 }} aria-current={isLast ? 'page' : undefined}>
                  {it.label}
                </span>
              )}
              {!isLast && <span aria-hidden="true">{separator}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

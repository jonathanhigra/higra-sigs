import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '80vh', padding: '24px', textAlign: 'center',
      color: 'var(--text-primary, #f1f1f6)',
    }}>
      <h1 style={{ fontSize: '4rem', margin: '0 0 8px', fontWeight: 800, opacity: 0.3 }}>404</h1>
      <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 700 }}>
        Página não encontrada
      </h2>
      <p style={{ margin: '0 0 24px', color: 'var(--text-secondary, #9a9aa2)', fontSize: '0.9rem', maxWidth: 400, lineHeight: 1.5 }}>
        O endereço que você acessou não existe ou foi removido.
      </p>
      <Link to="/feed" style={{
        background: 'var(--accent, #1d9bf0)', color: '#fff', border: 'none', borderRadius: 999,
        padding: '10px 24px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
        textDecoration: 'none',
      }}>
        Voltar ao Início
      </Link>
    </div>
  );
}

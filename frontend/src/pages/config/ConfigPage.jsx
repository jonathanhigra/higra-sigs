/**
 * APEX pg 43 — Configurações / Preferências (somente Admin)
 * Links para: Permissões(pg112), Usuários(pg107), Domínios(pg17), Configurações
 */
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import Icon from '../../components/Icon';
import '../../components/Modal.css';

const CONFIG_ITEMS = [
  { to: '/admin/permissoes', label: 'Permissões', desc: 'Gestão de tipos de usuário e permissões por módulo', icon: <path d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z" /> },
  { to: '/cadastros', label: 'Cadastros', desc: 'Empresas, filiais, processos, usuários', icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></> },
  { to: '/config/dominios', label: 'Domínios / LOVs', desc: 'Valores de domínio para dropdowns do sistema', icon: <><path d="M4 7V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" /><polyline points="14 2 14 8 20 8" /></> },
  { to: '/indicadores/ranking', label: 'Ranking / Gamificação', desc: 'Ranking de XP e pontuação dos usuários', icon: <><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /></> },
];

export default function ConfigPage() {
  const navigate = useNavigate();
  const isAdmin = useAuthStore.getState().isAdmin();

  if (!isAdmin) {
    return <div className="detail-page"><div className="home-empty">Acesso restrito a administradores</div></div>;
  }

  return (
    <div className="detail-page">
      <h1>Configurações</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginTop: 20 }}>
        {CONFIG_ITEMS.map(item => (
          <div key={item.to} onClick={() => navigate(item.to)} style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12,
            padding: 20, cursor: 'pointer', transition: 'border-color 0.15s',
          }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
             onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--card-border)'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ color: 'var(--accent)' }}><Icon>{item.icon}</Icon></span>
              <span style={{ fontWeight: 600, fontSize: '1rem' }}>{item.label}</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Tarefa 290 — SST Hub
 * Página hub de cadastros auxiliares de SST (padrão QualidadeHub.jsx)
 */

import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import '../tarefas/TarefasList.css';

const modules = [
  { to: '/qualidade/sst/partes-corpo', label: 'Partes do Corpo', desc: 'Cadastro de partes do corpo afetadas em acidentes e ocorrências SST.', perm: 'RNCO', color: '#e74c3c' },
  { to: '/qualidade/sst/tipos-acidente', label: 'Tipos de Acidente', desc: 'Classificação dos tipos de acidente: típico, trajeto ou doença.', perm: 'RNCO', color: '#e67e22' },
  { to: '/qualidade/sst/tipos-lesao', label: 'Tipos de Lesão', desc: 'Cadastro de tipos de lesão para registro de acidentes.', perm: 'RNCO', color: '#9b59b6' },
  { to: '/qualidade/sst/agentes-causadores', label: 'Agentes Causadores', desc: 'Agentes que causam acidentes e doenças ocupacionais.', perm: 'RNCO', color: '#2980b9' },
];

export default function SSTHub() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a
            onClick={() => navigate('/qualidade')}
            style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}
          >
            Qualidade
          </a>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <h1 style={{ margin: 0 }}>SST — Segurança do Trabalho</h1>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 16 }}>
        {modules.filter(m => hasPermission(m.perm)).map(m => (
          <div
            key={m.to}
            onClick={() => navigate(m.to)}
            style={{
              padding: 20, borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-secondary)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: m.color }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>{m.label}</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>{m.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

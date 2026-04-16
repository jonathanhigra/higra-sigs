import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import api from '../../lib/api';

const ETAPA_CONFIG = {
  BOB:      { label: 'Bobinagem',    color: '#e91e63' },
  CNJ_MOT:  { label: 'Conjunto',     color: '#9c27b0' },
  ENS_HID:  { label: 'Ensaio',       color: '#3f51b5' },
  PIN:      { label: 'Pintura',      color: '#ff9800' },
  QLD:      { label: 'Qualidade',    color: '#4caf50' },
  MNT:      { label: 'Manutenção',   color: '#607d8b' },
  EXP:      { label: 'Expedição',    color: '#009688' },
  EMB:      { label: 'Embalagem',    color: '#795548' },
  AGUARDANDO: { label: 'Aguardando', color: '#9e9e9e' },
};

function EtapaCard({ etapa, total, abertas, cor, onClick }) {
  return (
    <div onClick={onClick}
      style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '16px', border: '1px solid var(--border-subtle)', borderTop: `4px solid ${cor}`, cursor: 'pointer', transition: 'transform 0.15s', minWidth: 120 }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
      onMouseLeave={e => e.currentTarget.style.transform = ''}>
      <div style={{ fontSize: 28, fontWeight: 800, color: cor }}>{total}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>{etapa}</div>
      {abertas > 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{abertas} em andamento</div>}
    </div>
  );
}

export default function DashboardFabricacao() {
  const navigate = useNavigate();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/fabricacao/steps/stats')
      .then(r => setStats(r.data))
      .catch(() => toast.error('Erro ao carregar stats'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Carregando...</div>;
  if (!stats) return null;

  const { totais, por_status, por_etapa, novos_30d } = stats;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0 }}>Dashboard de Fabricação</h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: 14 }}>Visão geral da produção</p>
        </div>
        <button className="btn-secondary" onClick={() => navigate('/fabricacao')}>Ver Lista →</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 12, marginBottom: 28 }}>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '16px', border: '1px solid var(--border-subtle)', borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)' }}>{totais?.total ?? 0}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total de checklists</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '16px', border: '1px solid var(--border-subtle)', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#3b82f6' }}>{totais?.abertas ?? 0}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Em produção</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '16px', border: '1px solid var(--border-subtle)', borderLeft: '4px solid #22c55e' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#22c55e' }}>{totais?.concluidas ?? 0}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Concluídos</div>
        </div>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '16px', border: '1px solid var(--border-subtle)', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#f59e0b' }}>{novos_30d}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Novos (30 dias)</div>
        </div>
      </div>

      {/* Por Etapa */}
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Motores por Etapa Atual</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
        {(por_etapa || []).map(e => {
          const cfg = ETAPA_CONFIG[e.etapa] || { label: e.etapa, color: '#9e9e9e' };
          return (
            <EtapaCard key={e.etapa} etapa={cfg.label} total={e.total} abertas={e.abertas}
              cor={cfg.color} onClick={() => navigate('/fabricacao')} />
          );
        })}
      </div>

      {/* Por Status */}
      {por_status?.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Distribuição por Status</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {por_status.map(s => (
              <div key={s.status} style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 16px', border: '1px solid var(--border-subtle)', minWidth: 100 }}>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{s.total}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.status || 'Sem status'}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

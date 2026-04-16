/**
 * Dashboard de Assistência Técnica — tarefa 239
 * Atendimentos por etapa, por técnico, por tipo + SLA vencidos
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import '../../components/DetailPage.css';

const BASE = '/api/assistencia/atendimentos';

function StatCard({ label, value, color = 'var(--accent)', sub }) {
  return (
    <div style={{
      background: 'var(--card-bg)', borderRadius: 12, padding: '18px 22px',
      border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</span>}
    </div>
  );
}

function BarList({ items, colorKey = 'cor', labelKey = 'etapa', valueKey = 'total' }) {
  if (!items || items.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados.</p>;
  const max = Math.max(...items.map(i => i[valueKey]), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, idx) => {
        const pct = Math.round((item[valueKey] / max) * 100);
        const color = item[colorKey] || 'var(--accent)';
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ minWidth: 140, fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item[labelKey]}
            </span>
            <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 6, height: 18, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 6, transition: 'width .4s' }} />
            </div>
            <span style={{ minWidth: 32, textAlign: 'right', fontWeight: 700, fontSize: 13, color }}>{item[valueKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
      {children}
    </h3>
  );
}

export default function AssistenciaDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    api.get(`${BASE}/dashboard`)
      .then(r => setData(r.data))
      .catch(() => showToast('Erro ao carregar dashboard', 'error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 32, color: 'var(--text-muted)' }}>Carregando dashboard…</div>
  );
  if (!data) return null;

  const { totais, por_etapa, por_tecnico, por_tipo, sla_vencidos } = data;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Breadcrumbs items={[
        { label: 'Assistência Técnica', to: '/assistencia' },
        { label: 'Dashboard' },
      ]} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Dashboard — Assistência Técnica</h1>
        <button className="btn-secondary" onClick={() => navigate('/assistencia')}>Voltar</button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard label="Total geral" value={totais.total_geral ?? 0} color="var(--text-primary)" />
        <StatCard label="Em aberto" value={totais.abertos ?? 0} color="#f59e0b" />
        <StatCard label="Fechados/Cancelados" value={totais.fechados ?? 0} color="#22c55e" />
        <StatCard label="Sem responsável" value={totais.sem_responsavel ?? 0} color="#ef4444" sub="(abertos)" />
        <StatCard label="SLA vencidos (>7d)" value={sla_vencidos.length} color="#dc2626" sub="abertos há mais de 7 dias" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 28 }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
          <SectionTitle>Por Etapa do Funil</SectionTitle>
          <BarList items={por_etapa} colorKey="cor" labelKey="etapa" valueKey="total" />
        </div>
        <div style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
          <SectionTitle>Por Técnico (top 10)</SectionTitle>
          <BarList items={por_tecnico.map(i => ({ ...i, cor: 'var(--accent)' }))} colorKey="cor" labelKey="tecnico" valueKey="total" />
        </div>
        <div style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
          <SectionTitle>Por Tipo de Atendimento</SectionTitle>
          <BarList items={por_tipo.map(i => ({ ...i, cor: '#8b5cf6' }))} colorKey="cor" labelKey="tipo" valueKey="total" />
        </div>
      </div>

      {/* SLA Vencidos */}
      <div style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 20, border: '1.5px solid #ef444440' }}>
        <SectionTitle>SLA Vencidos — abertos há mais de 7 dias ({sla_vencidos.length})</SectionTitle>
        {sla_vencidos.length === 0 ? (
          <p style={{ color: '#22c55e', fontWeight: 600, fontSize: 14 }}>Nenhum atendimento com SLA vencido.</p>
        ) : (
          <table className="data-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Título</th>
                <th>Cliente</th>
                <th>Responsável</th>
                <th>Abertura</th>
                <th>Dias em aberto</th>
              </tr>
            </thead>
            <tbody>
              {sla_vencidos.map(a => (
                <tr key={a.id} className="clickable" onClick={() => navigate(`/assistencia/${a.id}`)}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{a.codigo || `#${a.id}`}</td>
                  <td style={{ fontWeight: 600 }}>{a.titulo}</td>
                  <td>{a.cliente || '—'}</td>
                  <td>{a.responsavel_nome || '—'}</td>
                  <td>{a.dt_abertura ? new Date(a.dt_abertura).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>
                    <span style={{
                      fontWeight: 700, padding: '2px 8px', borderRadius: 8,
                      background: a.dias_aberto > 30 ? '#ef444420' : '#f59e0b20',
                      color: a.dias_aberto > 30 ? '#ef4444' : '#f59e0b',
                    }}>
                      {a.dias_aberto}d
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import api from '../../lib/api';
import '../tarefas/TarefasList.css';

export default function DashboardService() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/api/laudos/dashboard');
        setStats(data);
      } catch { toast.error('Erro ao carregar dashboard'); }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  if (loading) return (
    <div className="tarefas-page">
      <div className="tarefas-header"><h1>Dashboard Serviços</h1></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[1,2,3].map(i => <div key={i} style={{ height: 80, background: 'var(--bg-skeleton,rgba(120,120,120,0.12))', borderRadius: 10, animation: 'dp-pulse 1.4s ease-in-out infinite' }} />)}
      </div>
    </div>
  );

  const summaryCards = [
    { label: 'Total Abertos', value: stats?.total_abertos ?? 0, color: '#3b82f6' },
    { label: 'Total Fechados', value: stats?.total_fechados ?? 0, color: '#22c55e' },
    { label: 'Tempo Médio Fechamento', value: stats?.tempo_medio_fechamento != null ? `${stats.tempo_medio_fechamento}d` : '—', color: '#f59e0b' },
  ];

  const porTecnico = stats?.laudos_por_tecnico || [];
  const porMes = stats?.laudos_por_mes || [];

  // Bar chart: compute max for scaling
  const maxVal = Math.max(...porMes.map(m => m.count || 0), 1);

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Dashboard Serviços</h1>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
        {summaryCards.map(c => (
          <div key={c.label} style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.3px' }}>{c.label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* Laudos por Técnico */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 14 }}>
            Laudos por Técnico
          </div>
          {porTecnico.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>Sem dados</div>
          ) : (
            <table className="data-table" style={{ marginBottom: 0 }}>
              <thead><tr><th>Técnico</th><th style={{ textAlign: 'right' }}>Laudos</th></tr></thead>
              <tbody>
                {porTecnico.map((t, i) => (
                  <tr key={i}>
                    <td>{t.tecnico_nome || t.tecnico || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{t.count ?? t.total ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Bar Chart: Laudos por Mês */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 14 }}>
            Laudos por Mês (últimos 6 meses)
          </div>
          {porMes.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>Sem dados</div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 140 }}>
              {porMes.map((m, i) => {
                const pct = Math.round(((m.count || 0) / maxVal) * 100);
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>{m.count || 0}</div>
                    <div style={{
                      width: '100%', background: 'var(--accent)', borderRadius: '4px 4px 0 0',
                      height: `${Math.max(pct, 3)}%`, transition: 'height 0.3s', minHeight: 4,
                    }} />
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>
                      {m.mes || m.month || m.label || `M${i+1}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

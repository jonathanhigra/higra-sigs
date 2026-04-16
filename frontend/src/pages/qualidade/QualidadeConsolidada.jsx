/**
 * Tarefa 309 — Dashboard consolidado Qualidade para Diretoria
 * Mostra: RQ03 abertas + RQ49 abertas + RQ80 planejadas/em execução
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import api from '../../lib/api';
import '../planos_acao/PlanosList.css';

function MetricCard({ label, value, color, onClick }) {
  return (
    <div onClick={onClick}
      style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '16px 20px', border: `1px solid var(--border-subtle)`, cursor: onClick ? 'pointer' : 'default', borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value ?? '—'}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function QualidadeConsolidada() {
  const navigate = useNavigate();
  const toast = useToast();
  const [rq03, setRq03] = useState(null);
  const [rq49, setRq49] = useState(null);
  const [rq80, setRq80] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/qualidade/rq03/resumo').catch(() => null),
      api.get('/api/qualidade/rq49/dashboard', { params: { periodo_meses: 12 } }).catch(() => null),
      api.get('/api/qualidade/rq80', { params: { per_page: 100 } }).catch(() => null),
    ]).then(([r03, r49, r80]) => {
      if (r03) setRq03(r03.data);
      if (r49) setRq49(r49.data);
      if (r80) {
        const items = r80.data?.items || [];
        setRq80({
          total: r80.data?.total || 0,
          planejadas: items.filter(i => (i.status || '').toUpperCase() === 'PLANEJADA').length,
          em_execucao: items.filter(i => (i.status || '').toUpperCase() === 'EM_EXECUCAO').length,
          concluidas: items.filter(i => (i.status || '').toUpperCase() === 'CONCLUIDA').length,
        });
      }
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Carregando...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>Qualidade — Visão Diretoria</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>Consolidado de não conformidades, oportunidades e auditorias abertas.</p>

      {/* RQ03 */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Não Conformidades (RQ03)</h2>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => navigate('/qualidade/rq03')}>Ver lista →</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
          <MetricCard label="Total" value={rq03?.total} color="var(--text-primary)" onClick={() => navigate('/qualidade/rq03')} />
          <MetricCard label="Abertas" value={rq03?.abertas} color="#3b82f6" onClick={() => navigate('/qualidade/rq03')} />
          <MetricCard label="Em Análise" value={rq03?.em_analise} color="#f59e0b" />
          <MetricCard label="Ação Corretiva" value={rq03?.acao_corretiva} color="#8b5cf6" />
          <MetricCard label="Ações Vencidas" value={rq03?.acoes_vencidas} color="#ef4444" />
          <MetricCard label="Fechadas" value={rq03?.fechadas} color="#22c55e" />
        </div>
      </div>

      {/* RQ49 */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Oportunidades de Melhoria (RQ49)</h2>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => navigate('/qualidade/rq49')}>Ver lista →</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
          <MetricCard label="Total (12m)" value={rq49?.totais?.total} color="var(--text-primary)" />
          <MetricCard label="Abertas" value={rq49?.totais?.abertas} color="#3b82f6" />
          <MetricCard label="Em Análise" value={rq49?.totais?.em_analise} color="#f59e0b" />
          <MetricCard label="Procedentes" value={rq49?.totais?.procedentes} color="#22c55e" />
          <MetricCard label="Fechadas" value={rq49?.totais?.fechadas} color="#6b7280" />
          {rq49?.totais?.avaliadas > 0 && (
            <MetricCard label="Índice Eficácia"
              value={`${Math.round((rq49.totais.eficazes / rq49.totais.avaliadas) * 100)}%`}
              color="#0ea5e9" />
          )}
        </div>
        {rq49?.pendentes_avaliacao?.length > 0 && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef3c7', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
            ⚠ {rq49.pendentes_avaliacao.length} NO(s) fechada(s) aguardando avaliação de eficácia
            <button style={{ marginLeft: 8, fontSize: 11, color: '#0ea5e9', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => navigate('/qualidade/rq49/avaliacao-eficacia')}>Ver →</button>
          </div>
        )}
      </div>

      {/* RQ80 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Auditorias (RQ80)</h2>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => navigate('/qualidade/rq80')}>Ver lista →</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
          <MetricCard label="Total" value={rq80?.total} color="var(--text-primary)" />
          <MetricCard label="Planejadas" value={rq80?.planejadas} color="#3b82f6" />
          <MetricCard label="Em Execução" value={rq80?.em_execucao} color="#f59e0b" />
          <MetricCard label="Concluídas" value={rq80?.concluidas} color="#22c55e" />
        </div>
      </div>
    </div>
  );
}

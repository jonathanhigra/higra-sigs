/**
 * 542 + 560 — Dashboard LABS: testes por tipo, aprovados vs reprovados, tempo médio.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { laboratorioService } from '../../services/laboratorio/laboratorioService';
import { useToast } from '../../contexts/ToastContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';

const STATUS_COLORS = {
  agendados:   '#3b82f6',
  em_execucao: '#f59e0b',
  finalizados: '#22c55e',
  reprovados:  '#ef4444',
};

export default function DashboardLabs() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    laboratorioService.stats()
      .then(({ data }) => setDados(data))
      .catch(() => showToast('Erro ao carregar dashboard', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--feed-muted)' }}>
      Carregando dashboard...
    </div>
  );

  if (!dados) return null;

  const { totais = {}, por_tipo = [], por_mes = [], reprovados_recentes = [] } = dados;

  const pieData = [
    { name: 'Agendados', value: parseInt(totais.agendados || 0), color: STATUS_COLORS.agendados },
    { name: 'Em Execução', value: parseInt(totais.em_execucao || 0), color: STATUS_COLORS.em_execucao },
    { name: 'Finalizados', value: parseInt(totais.finalizados || 0), color: STATUS_COLORS.finalizados },
    { name: 'Reprovados', value: parseInt(totais.reprovados || 0), color: STATUS_COLORS.reprovados },
  ].filter((d) => d.value > 0);

  const cardStyle = {
    background: 'var(--feed-card)',
    border: '1px solid var(--feed-border)',
    borderRadius: 12,
    padding: 16,
  };

  return (
    <div style={{ padding: '24px 16px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--feed-text)', margin: 0 }}>
          Dashboard — Laboratório
        </h1>
        <p style={{ color: 'var(--feed-muted)', fontSize: '0.85rem', marginTop: 4 }}>
          Visão consolidada dos testes de bancada
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total', value: totais.total || 0, color: 'var(--feed-text)' },
          { label: 'Agendados', value: totais.agendados || 0, color: STATUS_COLORS.agendados },
          { label: 'Em Execução', value: totais.em_execucao || 0, color: STATUS_COLORS.em_execucao },
          { label: 'Finalizados', value: totais.finalizados || 0, color: STATUS_COLORS.finalizados },
          { label: 'Reprovados', value: totais.reprovados || 0, color: STATUS_COLORS.reprovados },
        ].map((card) => (
          <div key={card.label} style={{ ...cardStyle, borderLeft: `4px solid ${card.color}` }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--feed-muted)', marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Pie: distribuição de status */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: 12, color: 'var(--feed-text)' }}>Distribuição por Status</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                  label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: 'var(--feed-muted)', textAlign: 'center', padding: 40 }}>Sem dados</div>
          )}
        </div>

        {/* Bar: por tipo */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: 12, color: 'var(--feed-text)' }}>Testes por Tipo</h3>
          {por_tipo.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={por_tipo} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--feed-border)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--feed-muted)' }} />
                <YAxis type="category" dataKey="tipo" tick={{ fontSize: 10, fill: 'var(--feed-muted)' }} width={100} />
                <Tooltip />
                <Bar dataKey="qtd" name="Total" fill="#3b82f6" />
                <Bar dataKey="reprovados" name="Reprovados" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: 'var(--feed-muted)', textAlign: 'center', padding: 40 }}>Sem dados</div>
          )}
        </div>
      </div>

      {/* Testes por mês */}
      {por_mes.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: 12, color: 'var(--feed-text)' }}>Testes por Mês (últimos 6 meses)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={por_mes}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--feed-border)" />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'var(--feed-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--feed-muted)' }} />
              <Tooltip />
              <Bar dataKey="qtd" name="Testes" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Reprovados recentes */}
      {reprovados_recentes.length > 0 && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: '0.9rem', marginBottom: 12, color: '#ef4444' }}>
            Testes Reprovados Recentes ({reprovados_recentes.length})
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--feed-border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--feed-muted)', fontWeight: 600 }}>Teste</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--feed-muted)', fontWeight: 600 }}>Responsável</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--feed-muted)', fontWeight: 600 }}>Data</th>
              </tr>
            </thead>
            <tbody>
              {reprovados_recentes.map((t) => (
                <tr key={t.id} style={{ cursor: 'pointer', borderBottom: '1px solid var(--feed-border)' }}
                  onClick={() => navigate(`/laboratorio/${t.id}`)}>
                  <td style={{ padding: '8px', color: 'var(--feed-text)', fontWeight: 600 }}>{t.descricao}</td>
                  <td style={{ padding: '8px', color: 'var(--feed-muted)' }}>{t.responsavel_nome || '—'}</td>
                  <td style={{ padding: '8px', color: 'var(--feed-muted)', whiteSpace: 'nowrap' }}>
                    {t.dt_agendamento ? new Date(t.dt_agendamento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

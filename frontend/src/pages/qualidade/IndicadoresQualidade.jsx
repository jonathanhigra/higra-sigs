/**
 * Tarefa 301 — Indicadores da Qualidade
 * Dashboard com cards, gráfico de barras, top agentes e alertas
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { indicadoresQualService } from '../../services/qualidade/qualidadeService';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import '../planos_acao/PlanosList.css';

const PERIODO_OPTIONS = [
  { value: 3,  label: 'Últimos 3 meses' },
  { value: 6,  label: 'Últimos 6 meses' },
  { value: 12, label: 'Últimos 12 meses' },
  { value: 24, label: 'Últimos 24 meses' },
];

function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '14px 20px', background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderTop: `3px solid ${color || 'var(--accent)'}`,
      borderRadius: 8, minWidth: 130, flex: 1,
    }}>
      <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value ?? '—'}</span>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</span>
      {sub && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{sub}</span>}
    </div>
  );
}

function AlertCard({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 18px', background: color + '11',
      border: `1px solid ${color}44`, borderRadius: 8,
      flex: 1, minWidth: 180,
    }}>
      <span style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{value ?? 0}</span>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

export default function IndicadoresQualidade() {
  const toast = useToast();
  const [periodo, setPeriodo] = useState(12);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await indicadoresQualService.dashboard({ periodo_meses: periodo });
      setDados(data);
    } catch {
      toast.error('Erro ao carregar indicadores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [periodo]);

  const grafico = dados?.mensal || [];
  const agentes = dados?.top_agentes || [];
  const alertas = dados?.alertas || {};

  return (
    <div className="planos-container">
      <main className="planos-main">
        <div className="planos-header">
          <h1>Indicadores da Qualidade</h1>
          <select
            value={periodo}
            onChange={e => setPeriodo(Number(e.target.value))}
            style={{
              padding: '7px 14px', borderRadius: 8,
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-input)', color: 'var(--text-primary)',
              fontSize: '0.85rem', cursor: 'pointer',
            }}
          >
            {PERIODO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="planos-empty"><p>Carregando...</p></div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
              <SummaryCard label="Total RQ03" value={dados?.total_rq03} color="#3b82f6" />
              <SummaryCard label="Em Aberto" value={dados?.em_aberto} color="#f59e0b" />
              <SummaryCard label="Fechadas" value={dados?.fechadas} color="#22c55e" />
              <SummaryCard
                label="Tempo Médio Fechamento"
                value={dados?.tempo_medio_dias != null ? `${dados.tempo_medio_dias}d` : '—'}
                color="#8b5cf6"
                sub="dias"
              />
              <SummaryCard
                label="Índice de Eficácia"
                value={dados?.indice_eficacia != null ? `${dados.indice_eficacia}%` : '—'}
                color="#06b6d4"
              />
            </div>

            {/* Alertas */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
              <AlertCard label="Ações vencidas" value={alertas.acoes_vencidas} color="#ef4444" />
              <AlertCard label="Abertas há +30 dias" value={alertas.abertas_30dias} color="#f59e0b" />
            </div>

            {/* Gráfico mensal */}
            {grafico.length > 0 && (
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8, padding: '20px 24px',
                marginBottom: 24,
              }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Não Conformidades por Mês
                </h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={grafico} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} allowDecimals={false} />
                    <RechartTooltip
                      contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 12 }}
                    />
                    <Bar dataKey="total" name="Total" radius={[4, 4, 0, 0]}>
                      {grafico.map((entry, idx) => (
                        <Cell key={idx} fill="var(--accent)" fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top agentes causadores */}
            {agentes.length > 0 && (
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8, padding: '20px 24px',
                marginBottom: 24,
              }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Top Agentes Causadores
                </h3>
                <div className="planos-table-wrapper">
                  <table className="planos-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Agente</th>
                        <th className="col-center">Ocorrências</th>
                        <th className="col-center">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentes.map((ag, idx) => (
                        <tr key={ag.id || idx} className="planos-row">
                          <td style={{ color: 'var(--text-muted)', fontWeight: 700, width: 32 }}>{idx + 1}</td>
                          <td style={{ fontWeight: 600, fontSize: '0.88rem' }}>{ag.nome || ag.descricao || '—'}</td>
                          <td className="col-center">{ag.total}</td>
                          <td className="col-center">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                height: 6, borderRadius: 3,
                                background: 'var(--accent)',
                                width: `${ag.pct || 0}%`,
                                minWidth: 4, maxWidth: 80,
                                opacity: 0.75,
                              }} />
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{ag.pct ?? 0}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!grafico.length && !agentes.length && (
              <div className="planos-empty">
                <span style={{ fontSize: '2.5rem' }}>📊</span>
                <p>Nenhum dado disponível para o período selecionado</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

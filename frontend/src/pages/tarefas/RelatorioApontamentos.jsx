import React, { useState } from 'react';
import { tarefaService } from '../../services/tarefas/tarefaService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

function formatTempo(min) {
  if (!min && min !== 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') + 'm' : ''}` : `${m}m`;
}

const hoje = new Date().toISOString().slice(0, 10);
const inicioMes = hoje.slice(0, 7) + '-01';

export default function RelatorioApontamentos() {
  const { showToast } = useToast();
  const [filters, setFilters] = useState({
    dt_inicio: inicioMes,
    dt_fim: hoje,
    agrupar: 'usuario',
  });
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tabAtiva, setTabAtiva] = useState('resumo');

  function handleFilter(e) {
    setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function buscar() {
    setLoading(true);
    try {
      const params = {};
      if (filters.dt_inicio) params.dt_inicio = filters.dt_inicio;
      if (filters.dt_fim) params.dt_fim = filters.dt_fim;
      if (filters.agrupar) params.agrupar = filters.agrupar;
      const { data } = await tarefaService.relatorioApontamentos(params);
      setDados(data);
    } catch {
      showToast('Erro ao carregar relatório', 'error');
    } finally {
      setLoading(false);
    }
  }

  const totalGeral = dados?.agrupado?.reduce((acc, r) => acc + (r.total_minutos || 0), 0) || 0;

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Relatório de Apontamentos</h1>
          <p className="ptf-subtitle">Horas registradas por período — tarefas e avulsos</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="ptf-filters-bar" style={{ marginBottom: 20 }}>
        <label>
          De
          <input type="date" name="dt_inicio" value={filters.dt_inicio} onChange={handleFilter} />
        </label>
        <label>
          Até
          <input type="date" name="dt_fim" value={filters.dt_fim} onChange={handleFilter} />
        </label>
        <label>
          Agrupar por
          <select name="agrupar" value={filters.agrupar} onChange={handleFilter}>
            <option value="usuario">Usuário</option>
            <option value="projeto">Projeto</option>
            <option value="dia">Dia</option>
          </select>
        </label>
        <button className="ptf-btn-primary" onClick={buscar} disabled={loading}>
          {loading ? 'Carregando...' : 'Gerar Relatório'}
        </button>
        {dados && totalGeral > 0 && (
          <span className="ptf-total-badge">Total: {formatTempo(totalGeral)}</span>
        )}
      </div>

      {!dados && !loading && (
        <div className="ptf-empty">Configure os filtros e clique em "Gerar Relatório".</div>
      )}

      {loading && <div className="ptf-loading">Gerando relatório...</div>}

      {dados && !loading && (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['resumo', 'detalhes'].map((t) => (
              <button
                key={t}
                onClick={() => setTabAtiva(t)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 20,
                  border: '1px solid var(--feed-border)',
                  background: tabAtiva === t ? 'var(--color-primary)' : 'var(--feed-card)',
                  color: tabAtiva === t ? '#fff' : 'var(--feed-muted)',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: tabAtiva === t ? 700 : 400,
                }}
              >
                {t === 'resumo' ? 'Resumo' : 'Detalhes'}
              </button>
            ))}
          </div>

          {/* Resumo agrupado */}
          {tabAtiva === 'resumo' && (
            <div className="ptf-table-wrap">
              <table className="ptf-table">
                <thead>
                  <tr>
                    {filters.agrupar === 'usuario' && (
                      <>
                        <th>Usuário</th>
                        <th>Qtd. Apontamentos</th>
                        <th>Período</th>
                        <th>Total de Horas</th>
                      </>
                    )}
                    {filters.agrupar === 'projeto' && (
                      <>
                        <th>Projeto</th>
                        <th>Qtd. Apontamentos</th>
                        <th>Período</th>
                        <th>Total de Horas</th>
                      </>
                    )}
                    {filters.agrupar === 'dia' && (
                      <>
                        <th>Data</th>
                        <th>Qtd. Apontamentos</th>
                        <th>Total de Horas</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dados.agrupado.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>
                        Nenhum apontamento no período.
                      </td>
                    </tr>
                  ) : dados.agrupado.map((r, i) => (
                    <tr key={i}>
                      {filters.agrupar === 'usuario' && (
                        <>
                          <td><strong>{r.usuario_nome || `Usuário #${r.usuario_id}`}</strong></td>
                          <td>{r.qtd_apontamentos}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--feed-muted)' }}>
                            {r.dt_inicio?.slice(0, 10)} → {r.dt_fim?.slice(0, 10)}
                          </td>
                          <td>
                            <span style={{
                              fontWeight: 700, color: 'var(--color-primary)',
                              background: 'var(--color-primary)11', padding: '2px 10px',
                              borderRadius: 8, fontSize: '0.9rem',
                            }}>{formatTempo(r.total_minutos)}</span>
                          </td>
                        </>
                      )}
                      {filters.agrupar === 'projeto' && (
                        <>
                          <td><strong>{r.projeto_titulo || 'Sem projeto'}</strong></td>
                          <td>{r.qtd_apontamentos}</td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--feed-muted)' }}>
                            {r.dt_inicio?.slice(0, 10)} → {r.dt_fim?.slice(0, 10)}
                          </td>
                          <td>
                            <span style={{
                              fontWeight: 700, color: 'var(--color-primary)',
                              background: 'var(--color-primary)11', padding: '2px 10px',
                              borderRadius: 8, fontSize: '0.9rem',
                            }}>{formatTempo(r.total_minutos)}</span>
                          </td>
                        </>
                      )}
                      {filters.agrupar === 'dia' && (
                        <>
                          <td>{r.dt_apontamento?.slice(0, 10) || '—'}</td>
                          <td>{r.qtd_apontamentos}</td>
                          <td>
                            <span style={{
                              fontWeight: 700, color: 'var(--color-primary)',
                              background: 'var(--color-primary)11', padding: '2px 10px',
                              borderRadius: 8, fontSize: '0.9rem',
                            }}>{formatTempo(r.total_minutos)}</span>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                {dados.agrupado.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={filters.agrupar === 'dia' ? 2 : 3}
                        style={{ textAlign: 'right', fontWeight: 700, padding: '10px 14px',
                          color: 'var(--feed-muted)', borderTop: '2px solid var(--feed-border)' }}>
                        TOTAL GERAL
                      </td>
                      <td style={{ padding: '10px 14px', borderTop: '2px solid var(--feed-border)' }}>
                        <span style={{
                          fontWeight: 700, color: '#22c55e',
                          background: '#22c55e11', padding: '2px 10px',
                          borderRadius: 8, fontSize: '0.95rem',
                        }}>{formatTempo(totalGeral)}</span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Detalhes */}
          {tabAtiva === 'detalhes' && (
            <div className="ptf-table-wrap">
              <table className="ptf-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Usuário</th>
                    <th>Tipo</th>
                    <th>Referência</th>
                    <th>Projeto</th>
                    <th>Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.detalhes.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>
                        Nenhum registro.
                      </td>
                    </tr>
                  ) : dados.detalhes.map((r, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.dt_apontamento?.slice(0, 10) || '—'}</td>
                      <td>{r.usuario_nome || '—'}</td>
                      <td>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 600, padding: '2px 6px', borderRadius: 6,
                          background: r.tipo === 'TAREFA' ? '#3b82f622' : '#8b5cf622',
                          color: r.tipo === 'TAREFA' ? '#3b82f6' : '#8b5cf6',
                        }}>
                          {r.tipo}
                        </span>
                      </td>
                      <td>{r.referencia || '—'}</td>
                      <td>{r.projeto_titulo || '—'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                        {formatTempo(r.tempo_minutos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

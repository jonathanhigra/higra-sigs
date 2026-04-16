import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { laboratorioService } from '../../services/laboratorio/laboratorioService';
import Modal from '../../components/Modal';
import { Breadcrumbs, RelativeTime, CopyButton, EmptyState } from '../../components/ui';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RcTooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

export default function LaboratorioDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [teste, setTeste] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('resultados');
  const [modalResult, setModalResult] = useState(false);
  const [resultForm, setResultForm] = useState({ vazao: '', pressao: '', potencia: '', corrente: '', rendimento: '', ponto_curva: '' });
  const [operating, setOperating] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [resultView, setResultView] = useState('tabela');
  const [compareTeste, setCompareTeste] = useState(null);
  const [compareId, setCompareId] = useState('');
  const [allTestes, setAllTestes] = useState([]);

  const fetchData = async () => {
    try {
      const { data } = await laboratorioService.obterTeste(id);
      setTeste(data);
    } catch { toast.error('Erro ao carregar teste'); navigate('/laboratorio'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);

  if (loading) return (
    <div className="detail-page">
      <div className="dp-skeleton-header" />
      <div className="dp-skeleton-cards">
        {[1,2,3,4,5,6].map(i => <div key={i} className="dp-skeleton-card" />)}
      </div>
    </div>
  );
  if (!teste) return null;

  const handleAddResult = async () => {
    if (savingResult) return;
    setSavingResult(true);
    try {
      await laboratorioService.addResultado(id, {
        ...resultForm,
        vazao:      resultForm.vazao      ? Number(resultForm.vazao)      : null,
        pressao:    resultForm.pressao    ? Number(resultForm.pressao)    : null,
        potencia:   resultForm.potencia   ? Number(resultForm.potencia)   : null,
        corrente:   resultForm.corrente   ? Number(resultForm.corrente)   : null,
        rendimento: resultForm.rendimento ? Number(resultForm.rendimento) : null,
        ponto_curva:resultForm.ponto_curva? Number(resultForm.ponto_curva): null,
      });
      toast.success('Ponto registrado');
      setModalResult(false);
      setResultForm({ vazao: '', pressao: '', potencia: '', corrente: '', rendimento: '', ponto_curva: '' });
      fetchData();
    } catch { toast.error('Erro ao registrar ponto'); }
    finally { setSavingResult(false); }
  };

  const handleStatus = async (status) => {
    if (operating) return;
    setOperating(true);
    try {
      await laboratorioService.atualizarTeste(id, { status });
      toast.success('Status atualizado');
      fetchData();
    } catch { toast.error('Erro ao atualizar status'); }
    finally { setOperating(false); }
  };

  const handleExportExcel = () => {
    const rows = teste.resultados || [];
    if (!rows.length) { toast.error('Sem resultados para exportar'); return; }
    const cols = ['Ponto', 'Vazão', 'Pressão', 'Potência', 'Corrente', 'Rendimento (%)'];
    const data = rows.map((r, i) => [
      r.ponto_curva || i + 1,
      r.vazao != null ? Number(r.vazao).toFixed(3) : '',
      r.pressao != null ? Number(r.pressao).toFixed(3) : '',
      r.potencia != null ? Number(r.potencia).toFixed(3) : '',
      r.corrente != null ? Number(r.corrente).toFixed(3) : '',
      r.rendimento != null ? (Number(r.rendimento) * 100).toFixed(2) : '',
    ]);
    const html = `<html><head><meta charset="UTF-8"></head><body>
      <h2>Resultados — ${teste.codigo || `TST-${teste.id}`}</h2>
      <table border="1" cellpadding="4" style="border-collapse:collapse;">
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${data.map(row => `<tr>${row.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `resultados_${teste.codigo || teste.id}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleLoadCompare = async () => {
    if (!compareId) return;
    try {
      const { data } = await laboratorioService.obterTeste(compareId);
      setCompareTeste(data);
    } catch { toast.error('Teste não encontrado'); }
  };

  const chartData = useMemo(() => {
    const sorted = [...(teste.resultados || [])].sort((a, b) => (Number(a.vazao) || 0) - (Number(b.vazao) || 0));
    let padrao = [];
    try { padrao = teste.curva_padrao_json ? JSON.parse(teste.curva_padrao_json) : []; } catch { padrao = []; }
    const padMap = {};
    padrao.forEach(p => { if (p.vazao != null) padMap[Number(p.vazao).toFixed(2)] = p; });
    return sorted.map(r => ({
      vazao:      r.vazao != null ? Number(r.vazao) : null,
      pressao:    r.pressao != null ? Number(r.pressao) : null,
      rendimento: r.rendimento != null ? Number(r.rendimento) * 100 : null,
      pad_pressao: padMap[Number(r.vazao).toFixed(2)]?.pressao ?? null,
    }));
  }, [teste]);

  const padrao_valido = chartData.some(d => d.pad_pressao != null);

  const isReprovado = teste.status === 'REPROVADO';
  const isAprovado  = teste.status === 'CONCLUIDO';

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[{ label: 'Laboratório', to: '/laboratorio' }, { label: teste.codigo || `TST-${teste.id}` }]} />
          <div className="dp-code" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {teste.codigo || `TST-${teste.id}`}
            <CopyButton value={teste.codigo || `TST-${teste.id}`} label="Copiar código" size={12} />
          </div>
          <h1>Teste {teste.equipamento || teste.codigo || `#${teste.id}`}</h1>
        </div>
        <div className="dp-header-actions">
          {teste.status === 'AGENDADO' && (
            <button className="btn-primary" disabled={operating} onClick={() => handleStatus('EM_EXECUCAO')}>
              {operating ? '...' : 'Iniciar Teste'}
            </button>
          )}
          {teste.status === 'EM_EXECUCAO' && <>
            <button className="btn-primary" disabled={operating} onClick={() => handleStatus('CONCLUIDO')}>
              {operating ? '...' : 'Concluir'}
            </button>
            <button className="btn-secondary" disabled={operating}
              style={{ color: 'var(--accent-danger)' }}
              onClick={() => handleStatus('REPROVADO')}>
              Reprovar
            </button>
          </>}
          <button className="btn-secondary" onClick={() => navigate('/laboratorio')}>Voltar</button>
        </div>
      </div>

      <div className="detail-cards">
        <div className="detail-card"><div className="dc-label">Status</div><div className="dc-value"><span className={`status-badge ${(teste.status||'').toLowerCase().replace('_','-')}`}>{teste.status}</span></div></div>
        <div className="detail-card"><div className="dc-label">Tipo</div><div className="dc-value">{teste.tipo_teste || '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Equipamento</div><div className="dc-value">{teste.equipamento || '—'}</div></div>
        <div className="detail-card"><div className="dc-label">PV</div><div className="dc-value">{teste.pv || '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Agendamento</div><div className="dc-value">{teste.dt_agendamento ? new Date(teste.dt_agendamento).toLocaleDateString('pt-BR') : '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Pontos de Curva</div><div className="dc-value">{(teste.resultados || []).length}</div></div>
        {(isAprovado || isReprovado) && (
          <div className="detail-card">
            <div className="dc-label">Conformidade</div>
            <div className="dc-value">
              <span className={`lab-conformidade-badge ${isAprovado ? 'dentro' : 'fora'}`}>
                {isAprovado ? 'Dentro do padrão' : 'Fora do padrão'}
              </span>
            </div>
          </div>
        )}
      </div>

      {teste.descricao && (
        <div className="dp-description">
          <div className="dp-description-label">Descrição</div>
          <div className="dp-description-text">{teste.descricao}</div>
        </div>
      )}

      <div className="detail-tabs">
        {['resultados', 'comparar', 'equipe', 'historico'].map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'resultados' ? `Resultados (${(teste.resultados||[]).length})` :
             t === 'comparar'   ? 'Comparar' :
             t === 'equipe'     ? `Equipe (${(teste.equipe||[]).length})` :
                                  `Histórico (${(teste.historico_status||[]).length})`}
          </button>
        ))}
      </div>

      {tab === 'resultados' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => setModalResult(true)}>+ Registrar Ponto</button>
            <button className="btn-secondary" onClick={handleExportExcel}>Exportar Excel</button>
            <div className="lab-view-toggle">
              <button className={resultView === 'tabela' ? 'active' : ''} onClick={() => setResultView('tabela')}>Tabela</button>
              <button className={resultView === 'grafico' ? 'active' : ''} onClick={() => setResultView('grafico')}>Gráfico</button>
            </div>
          </div>

          {(teste.resultados || []).length === 0
            ? <EmptyState variant="inbox" title="Nenhum ponto registrado" description="Clique em '+ Registrar Ponto' para adicionar o primeiro ponto de curva." />
            : resultView === 'tabela'
            ? (
              <table className="data-table">
                <thead><tr><th>Ponto</th><th>Vazão</th><th>Pressão</th><th>Potência</th><th>Corrente</th><th>Rendimento</th></tr></thead>
                <tbody>
                  {(teste.resultados || []).map((r, i) => (
                    <tr key={r.id}>
                      <td>{r.ponto_curva || i + 1}</td>
                      <td>{r.vazao      != null ? Number(r.vazao).toFixed(2)      : '—'}</td>
                      <td>{r.pressao    != null ? Number(r.pressao).toFixed(2)    : '—'}</td>
                      <td>{r.potencia   != null ? Number(r.potencia).toFixed(2)   : '—'}</td>
                      <td>{r.corrente   != null ? Number(r.corrente).toFixed(2)   : '—'}</td>
                      <td>{r.rendimento != null ? `${(Number(r.rendimento)*100).toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
            : (
              <div className="lab-chart-wrap">
                <div className="lab-chart-title">Curva de Performance — Pressão × Vazão</div>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="vazao" label={{ value: 'Vazão', position: 'insideBottomRight', offset: -8, fontSize: 11 }} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="p" label={{ value: 'Pressão', angle: -90, position: 'insideLeft', fontSize: 11 }} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="r" orientation="right" label={{ value: 'Rendimento (%)', angle: 90, position: 'insideRight', fontSize: 11 }} tick={{ fontSize: 11 }} />
                    <RcTooltip contentStyle={{ fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="p" type="monotone" dataKey="pressao" name="Pressão" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                    {padrao_valido && (
                      <Line yAxisId="p" type="monotone" dataKey="pad_pressao" name="Pressão padrão" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                    )}
                    <Line yAxisId="r" type="monotone" dataKey="rendimento" name="Rendimento (%)" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          }
        </div>
      )}

      {tab === 'comparar' && (
        <div>
          <div className="lab-compare-search">
            <input
              type="number"
              className="form-control"
              placeholder="ID do teste para comparar..."
              value={compareId}
              onChange={e => setCompareId(e.target.value)}
              style={{ width: 220 }}
            />
            <button className="btn-primary" onClick={handleLoadCompare}>Carregar</button>
            {compareTeste && (
              <button className="btn-secondary" onClick={() => setCompareTeste(null)}>Limpar</button>
            )}
          </div>

          {!compareTeste
            ? <EmptyState variant="search" title="Informe o ID de outro teste" description="Digite o ID do teste e clique em Carregar para ver a comparação side-by-side." />
            : (
              <div className="lab-compare-grid">
                {[{ label: teste.codigo || `TST-${teste.id}`, rows: teste.resultados || [], main: true },
                  { label: compareTeste.codigo || `TST-${compareTeste.id}`, rows: compareTeste.resultados || [], main: false }
                ].map(({ label, rows, main }) => (
                  <div key={label} className={`lab-compare-col${main ? ' lab-compare-col-main' : ''}`}>
                    <div className="lab-compare-col-title">{label}</div>
                    {rows.length === 0
                      ? <div className="empty-state">Sem resultados</div>
                      : (
                        <table className="data-table">
                          <thead><tr><th>Ponto</th><th>Vazão</th><th>Pressão</th><th>Rendimento</th></tr></thead>
                          <tbody>
                            {rows.map((r, i) => (
                              <tr key={r.id}>
                                <td>{r.ponto_curva || i + 1}</td>
                                <td>{r.vazao    != null ? Number(r.vazao).toFixed(2)    : '—'}</td>
                                <td>{r.pressao  != null ? Number(r.pressao).toFixed(2)  : '—'}</td>
                                <td>{r.rendimento != null ? `${(Number(r.rendimento)*100).toFixed(1)}%` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    }
                  </div>
                ))}
              </div>
            )
          }
        </div>
      )}

      {tab === 'equipe' && (
        <div>
          {(teste.equipe || []).length === 0
            ? <EmptyState variant="empty" title="Nenhum membro na equipe" />
            : (teste.equipe || []).map(e => (
              <div key={e.id} className="dp-member-row">
                <span>{e.usuario_nome || '—'}</span>
                {e.sigla && <span className="dp-member-sigla">({e.sigla})</span>}
              </div>
            ))
          }
        </div>
      )}

      {tab === 'historico' && (
        <div>
          {(teste.historico_status || []).length === 0
            ? <EmptyState variant="empty" title="Nenhum histórico de status" />
            : (teste.historico_status || []).map(h => (
              <div key={h.id} className="dp-history-row">
                <span className={`status-badge ${(h.status_anterior||'').toLowerCase()}`}>{h.status_anterior}</span>
                <span className="dp-history-arrow">→</span>
                <span className={`status-badge ${(h.status_novo||'').toLowerCase()}`}>{h.status_novo}</span>
                <span className="dp-history-meta">{h.usuario_nome} · <RelativeTime value={h.created_at} /></span>
              </div>
            ))
          }
        </div>
      )}

      <Modal open={modalResult} onClose={() => setModalResult(false)} title="Registrar Ponto de Curva"
        footer={<><button className="btn-secondary" onClick={() => setModalResult(false)}>Cancelar</button><button className="btn-primary" disabled={savingResult} onClick={handleAddResult}>{savingResult ? 'Salvando...' : 'Registrar'}</button></>}>
        <div className="form-row">
          <div className="form-group"><label htmlFor="rf-ponto">Ponto</label><input id="rf-ponto" type="number" className="form-control" value={resultForm.ponto_curva} onChange={e => setResultForm(f => ({...f, ponto_curva: e.target.value}))} /></div>
          <div className="form-group"><label htmlFor="rf-vazao">Vazão</label><input id="rf-vazao" type="number" step="0.01" className="form-control" value={resultForm.vazao} onChange={e => setResultForm(f => ({...f, vazao: e.target.value}))} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label htmlFor="rf-pressao">Pressão</label><input id="rf-pressao" type="number" step="0.01" className="form-control" value={resultForm.pressao} onChange={e => setResultForm(f => ({...f, pressao: e.target.value}))} /></div>
          <div className="form-group"><label htmlFor="rf-potencia">Potência</label><input id="rf-potencia" type="number" step="0.01" className="form-control" value={resultForm.potencia} onChange={e => setResultForm(f => ({...f, potencia: e.target.value}))} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label htmlFor="rf-corrente">Corrente</label><input id="rf-corrente" type="number" step="0.01" className="form-control" value={resultForm.corrente} onChange={e => setResultForm(f => ({...f, corrente: e.target.value}))} /></div>
          <div className="form-group"><label htmlFor="rf-rendimento">Rendimento</label><input id="rf-rendimento" type="number" step="0.001" className="form-control" value={resultForm.rendimento} onChange={e => setResultForm(f => ({...f, rendimento: e.target.value}))} /></div>
        </div>
      </Modal>
    </div>
  );
}

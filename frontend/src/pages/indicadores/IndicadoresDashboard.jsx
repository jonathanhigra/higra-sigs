/**
 * APEX pg 46 — Dashboard Indicadores
 * 4 gráficos: bar (apontamentos), pie (metas atingidas total), bar (metas mensal), lineWithArea (série temporal)
 * Filtros: filial, processo, período
 *
 * APEX pg 16 — Relação de Indicadores (IR)
 * Lista de indicadores com semáforo
 *
 * APEX pg 19 — Cadastro de Metas
 * Form + combo chart (realizado vs planejado com cor semáforo) + tabela semáforos
 *
 * APEX pg 12/56 — Cadastro Registro Meta (MODAL)
 * APEX pg 118 — Modal Indicadores (MODAL)
 * APEX pg 21 — Ranking
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import { metaService } from '../../services/indicadores/metaService';
import Modal from '../../components/Modal';
import {
  BarChart, Bar, PieChart, Pie, Cell, ComposedChart, Line, Area, AreaChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { Spinner } from '../../components/ui';
import '../../components/Modal.css';

const SEMAFORO = { verde: '#4caf50', amarelo: '#ff9800', vermelho: '#ef4444', sem_dados: '#6b7280' };
const SEMAFORO_LABELS = { verde: 'Atingida', amarelo: 'Parcial', vermelho: 'Não atingida', sem_dados: 'Sem dados' };

export default function IndicadoresDashboard() {
  const [data, setData] = useState(null);
  const [metasList, setMetasList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard'); // dashboard | lista | ranking
  // Modais
  const [modalMeta, setModalMeta] = useState(null); // pg 19 detail
  const [modalApontar, setModalApontar] = useState(null); // pg 12 modal
  const [apontForm, setApontForm] = useState({ periodo: '', valor_realizado: '', valor_meta: '', observacao: '' });
  // Modal criar meta (pg 118)
  const [modalCriar, setModalCriar] = useState(false);
  const [criarForm, setCriarForm] = useState({ descricao: '', sigla: '', meta_valor: '', meta_minima: '', frequencia: 'MENSAL' });
  const [filtroVertical, setFiltroVertical] = useState('');

  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [dashRes, listRes] = await Promise.all([
        metaService.dashboard(),
        metaService.listar({ per_page: 100 }),
      ]);
      setData(dashRes.data);
      setMetasList(listRes.data.items || []);
    } catch { toast.error('Erro ao carregar indicadores'); }
    finally { setLoading(false); }
  };

  const handleApontar = async () => {
    if (!apontForm.valor_realizado) { toast.error('Valor realizado obrigatório'); return; }
    try {
      await metaService.apontar(modalApontar.id, {
        periodo: apontForm.periodo || undefined,
        valor_realizado: Number(apontForm.valor_realizado),
        valor_meta: apontForm.valor_meta ? Number(apontForm.valor_meta) : modalApontar.meta_valor,
        observacao: apontForm.observacao,
      });
      toast.success('Apontamento registrado');
      setModalApontar(null);
      setApontForm({ periodo: '', valor_realizado: '', valor_meta: '', observacao: '' });
      fetchAll();
    } catch { toast.error('Erro ao registrar'); }
  };

  const handleCriar = async () => {
    if (!criarForm.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    try {
      await metaService.criar({
        ...criarForm,
        meta_valor: criarForm.meta_valor ? Number(criarForm.meta_valor) : null,
        meta_minima: criarForm.meta_minima ? Number(criarForm.meta_minima) : null,
      });
      toast.success('Meta criada');
      setModalCriar(false);
      setCriarForm({ descricao: '', sigla: '', meta_valor: '', meta_minima: '', frequencia: 'MENSAL' });
      fetchAll();
    } catch { toast.error('Erro ao criar'); }
  };

  const handleMetaDetail = async (metaId) => {
    try {
      const { data: meta } = await metaService.obter(metaId);
      setModalMeta(meta);
    } catch { toast.error('Erro ao carregar meta'); }
  };

  if (loading) return <div className="detail-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}><Spinner size="lg" /></div>;

  const { metas: metasAll = [], resumo = {} } = data || {};
  const metas = filtroVertical
    ? metasAll.filter((m) => (m.vertical || '').toLowerCase().includes(filtroVertical.toLowerCase()))
    : metasAll;

  // CSV export (task 531)
  function exportCSV() {
    const rows = [
      ['ID', 'Descrição', 'Sigla', 'Frequência', 'Meta', 'Realizado', 'Semáforo', 'Vertical'],
      ...metasList.map((m) => {
        const d = metas.find((x) => x.id === m.id) || {};
        return [m.id, m.descricao, m.sigla || '', m.frequencia || '', m.meta_valor || '', d.valor_realizado ?? '', d.semaforo || '', m.vertical || ''];
      }),
    ];
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'indicadores.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // Dados para gráficos (APEX pg 46)
  const pieData = Object.entries(resumo).filter(([k]) => k !== 'sem_dados').map(([key, val]) => ({
    name: SEMAFORO_LABELS[key], value: val, color: SEMAFORO[key],
  }));

  const barData = metas.filter(m => m.valor_realizado != null).map(m => ({
    name: (m.sigla || m.descricao || '').substring(0, 15),
    realizado: Number(m.valor_realizado || 0),
    meta: Number(m.meta_valor || 0),
    fill: SEMAFORO[m.semaforo] || SEMAFORO.sem_dados,
  }));

  return (
    <div className="detail-page">
      <div className="detail-header">
        <h1>Indicadores / Metas</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="Filtrar por vertical..."
            value={filtroVertical}
            onChange={(e) => setFiltroVertical(e.target.value)}
            style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid var(--card-border)',
              background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.82rem',
            }}
          />
          <button className={`btn-secondary ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>Dashboard</button>
          <button className={`btn-secondary ${view === 'lista' ? 'active' : ''}`} onClick={() => setView('lista')}>Lista</button>
          <button className="btn-secondary" onClick={exportCSV} title="Exportar CSV">↓ CSV</button>
          <button className="btn-primary" onClick={() => setModalCriar(true)}>+ Nova Meta</button>
        </div>
      </div>

      {view === 'dashboard' && (
        <>
          {/* Resumo semáforos — APEX pg 46 overview */}
          <div className="detail-cards">
            <div className="detail-card"><div className="dc-label">Total de Metas</div><div className="dc-value" style={{ fontSize: '1.8rem' }}>{metas.length}</div></div>
            {Object.entries(resumo).map(([key, val]) => (
              <div key={key} className="detail-card" style={{ borderLeft: `4px solid ${SEMAFORO[key]}` }}>
                <div className="dc-label">{SEMAFORO_LABELS[key]}</div>
                <div className="dc-value" style={{ color: SEMAFORO[key], fontSize: '1.8rem' }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Gráficos — APEX pg 46: 4 charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Chart 1: Metas Atingidas (Pie) — APEX "Metas Atingidas (Total)" */}
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: 12, color: 'var(--text-primary)' }}>Metas Atingidas (Total)</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: Realizado vs Meta (Bar) — APEX "Indice de Apontamentos" */}
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: 12, color: 'var(--text-primary)' }}>Realizado vs Meta</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="meta" fill="#a6a6a6" name="Meta" />
                  <Bar dataKey="realizado" name="Realizado">
                    {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Grid de metas com semáforo — APEX pg 16 style */}
          <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Indicadores</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {metas.map(m => (
              <div key={m.id} style={{
                background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10,
                padding: 16, borderLeft: `4px solid ${SEMAFORO[m.semaforo]}`, cursor: 'pointer',
              }} onClick={() => handleMetaDetail(m.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', flex: 1, fontSize: '0.9rem' }}>{m.descricao}</div>
                  <button className="btn-primary" style={{ padding: '2px 8px', fontSize: '0.7rem', flexShrink: 0, marginLeft: 8 }}
                    onClick={(e) => { e.stopPropagation(); setModalApontar(m); const now = new Date(); setApontForm(f => ({ ...f, periodo: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}` })); }}>Apontar</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEMAFORO[m.semaforo], display: 'inline-block', flexShrink: 0, boxShadow: `0 0 5px ${SEMAFORO[m.semaforo]}88` }} />
                  <span style={{ fontSize: '0.72rem', color: SEMAFORO[m.semaforo], fontWeight: 700 }}>{SEMAFORO_LABELS[m.semaforo]}</span>
                  {m.sigla && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>· {m.sigla}</span>}
                  {m.frequencia && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>· {m.frequencia}</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: SEMAFORO[m.semaforo] }}>
                      {m.valor_realizado != null ? Number(m.valor_realizado).toLocaleString('pt-BR') : '—'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                      / {m.meta_valor != null ? Number(m.meta_valor).toLocaleString('pt-BR') : '—'}
                    </span>
                  </div>
                  {m.periodo && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(m.periodo).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                  </span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'lista' && (
        <>
          {/* APEX pg 16 — IR lista de indicadores */}
          <table className="data-table">
            <thead><tr>
              <th></th><th>Descrição</th><th>Sigla</th><th>Frequência</th>
              <th>Meta</th><th>Mínima</th><th>Último Realizado</th><th>Responsável</th><th>Processo</th>
            </tr></thead>
            <tbody>
              {metasList.map(m => {
                const semaforo = metas.find(d => d.id === m.id)?.semaforo || 'sem_dados';
                return (
                  <tr key={m.id} className="clickable" onClick={() => handleMetaDetail(m.id)}>
                    <td><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: SEMAFORO[semaforo] }} /></td>
                    <td style={{ fontWeight: 600 }}>{m.descricao}</td>
                    <td>{m.sigla || '—'}</td>
                    <td>{m.frequencia || '—'}</td>
                    <td>{m.meta_valor != null ? Number(m.meta_valor).toLocaleString('pt-BR') : '—'}</td>
                    <td>{m.meta_minima != null ? Number(m.meta_minima).toLocaleString('pt-BR') : '—'}</td>
                    <td>{metas.find(d => d.id === m.id)?.valor_realizado != null ? Number(metas.find(d => d.id === m.id).valor_realizado).toLocaleString('pt-BR') : '—'}</td>
                    <td>{m.responsavel_nome || '—'}</td>
                    <td>{m.processo_nome || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Modal Apontar — APEX pg 12/56 (MODAL) */}
      <Modal open={!!modalApontar} onClose={() => setModalApontar(null)} title={`Apontar — ${modalApontar?.descricao || ''}`}
        footer={<><button className="btn-secondary" onClick={() => setModalApontar(null)}>Cancelar</button><button className="btn-primary" onClick={handleApontar}>Salvar</button></>}>
        {modalApontar && (
          <>
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-surface)', borderRadius: 8, fontSize: '0.85rem' }}>
              <div>Meta: <strong>{modalApontar.meta_valor}</strong> | Mínima: <strong>{modalApontar.meta_minima}</strong></div>
              <div>Frequência: {modalApontar.frequencia} | Unidade: {modalApontar.unidade || '—'}</div>
            </div>
            <div className="form-group"><label>Período *</label><input type="date" className="form-control" value={apontForm.periodo} onChange={e => setApontForm(f => ({ ...f, periodo: e.target.value }))} /></div>
            <div className="form-row">
              <div className="form-group"><label>Valor Realizado *</label><input type="number" step="0.01" className="form-control" value={apontForm.valor_realizado} onChange={e => setApontForm(f => ({ ...f, valor_realizado: e.target.value }))} /></div>
              <div className="form-group"><label>Valor Meta</label><input type="number" step="0.01" className="form-control" placeholder={modalApontar.meta_valor} value={apontForm.valor_meta} onChange={e => setApontForm(f => ({ ...f, valor_meta: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label>Observação</label><textarea className="form-control" value={apontForm.observacao} onChange={e => setApontForm(f => ({ ...f, observacao: e.target.value }))} /></div>
          </>
        )}
      </Modal>

      {/* Modal Criar Meta — APEX pg 118 (MODAL) */}
      <Modal open={modalCriar} onClose={() => setModalCriar(false)} title="Nova Meta / Indicador"
        footer={<><button className="btn-secondary" onClick={() => setModalCriar(false)}>Cancelar</button><button className="btn-primary" onClick={handleCriar}>Criar</button></>}>
        <div className="form-group"><label>Descrição *</label><input className="form-control" value={criarForm.descricao} onChange={e => setCriarForm(f => ({ ...f, descricao: e.target.value }))} /></div>
        <div className="form-row">
          <div className="form-group"><label>Sigla</label><input className="form-control" value={criarForm.sigla} onChange={e => setCriarForm(f => ({ ...f, sigla: e.target.value }))} /></div>
          <div className="form-group"><label>Frequência</label>
            <select className="form-control" value={criarForm.frequencia} onChange={e => setCriarForm(f => ({ ...f, frequencia: e.target.value }))}>
              <option value="MENSAL">Mensal</option><option value="TRIMESTRAL">Trimestral</option>
              <option value="SEMESTRAL">Semestral</option><option value="ANUAL">Anual</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Meta Valor</label><input type="number" step="0.01" className="form-control" value={criarForm.meta_valor} onChange={e => setCriarForm(f => ({ ...f, meta_valor: e.target.value }))} /></div>
          <div className="form-group"><label>Meta Mínima</label><input type="number" step="0.01" className="form-control" value={criarForm.meta_minima} onChange={e => setCriarForm(f => ({ ...f, meta_minima: e.target.value }))} /></div>
        </div>
      </Modal>

      {/* Modal Meta Detail — APEX pg 19 (NORMAL, mas aqui como modal para UX) */}
      <Modal open={!!modalMeta} onClose={() => setModalMeta(null)} title={modalMeta?.descricao || 'Meta'} size="large"
        footer={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={() => { setModalMeta(null); navigate(`/indicadores/${modalMeta?.id}/distribuicao`); }}>Distribuição</button>
            <button className="btn-secondary" onClick={() => setModalMeta(null)}>Fechar</button>
          </div>
        }>
        {modalMeta && (
          <>
            <div className="detail-cards" style={{ marginBottom: 16 }}>
              <div className="detail-card"><div className="dc-label">Meta</div><div className="dc-value">{modalMeta.meta_valor}</div></div>
              <div className="detail-card"><div className="dc-label">Mínima</div><div className="dc-value">{modalMeta.meta_minima}</div></div>
              <div className="detail-card"><div className="dc-label">Frequência</div><div className="dc-value">{modalMeta.frequencia}</div></div>
              <div className="detail-card"><div className="dc-label">Responsável</div><div className="dc-value">{modalMeta.responsavel_nome || '—'}</div></div>
            </div>

            {/* Combo chart — APEX pg 19 + task 104: realizado(bar+cor semáforo) + meta(ReferenceLine) — temporal */}
            {(modalMeta.apontamentos || []).length > 0 && (() => {
              const metaValor = Number(modalMeta.meta_valor || 0);
              const metaMinima = Number(modalMeta.meta_minima || 0);
              const temporalData = (modalMeta.apontamentos || []).slice().reverse().map(a => {
                const realizado = Number(a._valor_realizado ?? a.valor_realizado ?? 0);
                const semaforo = realizado >= metaValor ? 'verde'
                  : (metaMinima > 0 && realizado >= metaMinima) ? 'amarelo' : 'vermelho';
                return {
                  periodo: a._periodo
                    ? new Date(a._periodo).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
                    : (a.periodo ? new Date(a.periodo).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : '—'),
                  realizado,
                  fill: SEMAFORO[semaforo],
                };
              });
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                    <h3 style={{ fontSize: '0.9rem', margin: 0 }}>Realizado × Meta (temporal)</h3>
                    <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#4caf50', borderRadius: 2, marginRight: 4 }} />Atingida</span>
                      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ff9800', borderRadius: 2, marginRight: 4 }} />Parcial</span>
                      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#ef4444', borderRadius: 2, marginRight: 4 }} />Não atingida</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={temporalData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v, n) => [Number(v).toLocaleString('pt-BR'), n]} />
                      <Bar dataKey="realizado" name="Realizado" radius={[4, 4, 0, 0]}>
                        {temporalData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                      {metaValor > 0 && (
                        <ReferenceLine y={metaValor} stroke="#4caf50" strokeDasharray="6 3" label={{ value: `Meta: ${metaValor}`, position: 'right', fontSize: 10, fill: '#4caf50' }} />
                      )}
                      {metaMinima > 0 && (
                        <ReferenceLine y={metaMinima} stroke="#ff9800" strokeDasharray="4 4" label={{ value: `Mín: ${metaMinima}`, position: 'right', fontSize: 10, fill: '#ff9800' }} />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}

            {/* Tabela de apontamentos */}
            <table className="data-table">
              <thead><tr><th>Período</th><th>Realizado</th><th>Meta</th><th>Observação</th></tr></thead>
              <tbody>
                {(modalMeta.apontamentos || []).map(a => (
                  <tr key={a.id}>
                    <td>{a.periodo ? new Date(a.periodo).toLocaleDateString('pt-BR') : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{a.valor_realizado != null ? Number(a.valor_realizado).toLocaleString('pt-BR') : '—'}</td>
                    <td>{a.valor_meta != null ? Number(a.valor_meta).toLocaleString('pt-BR') : '—'}</td>
                    <td>{a.observacao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Modal>
    </div>
  );
}

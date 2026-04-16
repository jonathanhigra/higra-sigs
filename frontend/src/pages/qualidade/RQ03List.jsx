/**
 * APEX pg 360 — Nao Conformidades RQ03 (PlanosList pattern)
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { rq03Service } from '../../services/qualidade/rq03Service';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import { SkeletonSimpleTable } from '../../components/SkeletonPlanos';
import { StatusBadge, UserAvatar, Tooltip } from '../../components/ui';
import { toCSV, downloadBlob } from '../../utils/format';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip, ResponsiveContainer, Cell } from 'recharts';
import '../../components/Modal.css';
import '../planos_acao/PlanosList.css';
import './RQ03List.css';

const STATUS_CONFIG = {
  ABERTA:         { label: 'Aberta',         bg: '#CCE5FF', color: '#0D47A1' },
  EM_ANALISE:     { label: 'Em Análise',     bg: '#FFF5CE', color: '#8B6914' },
  ACAO_CORRETIVA: { label: 'Ação Corretiva', bg: '#FFF5CE', color: '#8B6914' },
  VERIFICACAO:    { label: 'Verificação',    bg: '#E8D5F5', color: '#6A1B9A' },
  FECHADA:        { label: 'Fechada',        bg: '#D0F1CC', color: '#1B5E20' },
  CANCELADA:      { label: 'Cancelada',      bg: '#FFD6D2', color: '#B71C1C' },
};

const STATUS_BADGES = [
  { key: 'ABERTA',     label: 'Aberta',     bg: '#2196f3' },
  { key: 'EM_ANALISE', label: 'Em Análise',  bg: '#ff9800' },
  { key: 'FECHADA',    label: 'Fechada',     bg: '#4caf50' },
  { key: 'CANCELADA',  label: 'Cancelada',   bg: '#ef4444' },
];

const TIPO_LABELS = { C: 'Cliente', I: 'Interna', S: 'SST', A: 'Auditoria', EXTERNA: 'Cliente', INTERNA: 'Interna' };

function rowClass(status) {
  if (status === 'ABERTA') return 'rq03-row-aberta';
  if (status === 'FECHADA') return 'rq03-row-fechada';
  if (status === 'CANCELADA') return 'rq03-row-cancelada';
  return 'rq03-row-default';
}

function fmtDate(d) {
  if (!d) return '\u2014';
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function fmtDateTime(d) {
  if (!d) return null;
  const dt = new Date(d);
  return dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function buildStatusTooltip(r) {
  const parts = [];
  if (r.dt_abertura || r.dt_rnc) parts.push(`Aberta: ${fmtDate(r.dt_abertura || r.dt_rnc)}`);
  if (r.updated_at) parts.push(`Atualizado: ${fmtDateTime(r.updated_at)}`);
  if (r.dt_fechamento) parts.push(`Fechada: ${fmtDate(r.dt_fechamento)}`);
  return parts.length ? parts.join(' \u2022 ') : null;
}

const CHART_STATUS = [
  { key: 'ABERTA',     label: 'Abertas',    color: '#2196f3' },
  { key: 'EM_ANALISE', label: 'Em Análise', color: '#ff9800' },
  { key: 'FECHADA',    label: 'Fechadas',   color: '#4caf50' },
  { key: 'CANCELADA',  label: 'Canceladas', color: '#ef4444' },
];

function RQ03MiniChart({ items }) {
  const data = useMemo(() =>
    CHART_STATUS.map(s => ({ ...s, count: items.filter(i => i.status === s.key).length }))
    .filter(d => d.count > 0),
  [items]);

  if (data.length === 0) return null;

  return (
    <div className="rq03-mini-chart">
      <span className="rq03-mini-chart-title">Distribuição por status</span>
      <ResponsiveContainer width="100%" height={64}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
          <RechartTooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 12 }}
            formatter={(v) => [v, 'Registros']}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={16}>
            {data.map(d => <Cell key={d.key} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function RQ03List() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('T');
  const [tipoFilter, setTipoFilter] = useState('T');
  const [vencendo7d, setVencendo7d] = useState(false);
  const [acaoVencidaFilter, setAcaoVencidaFilter] = useState(false);
  const [search, setSearch] = useState('');
  const [activeBadges, setActiveBadges] = useState(STATUS_BADGES.map(b => b.key));
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ reclamante: '', descricao: '', prioridade: 'MEDIA', tipo: 'EXTERNA' });
  const [resumo, setResumo] = useState(null);
  // Analytics (tarefas 271-272)
  const [pareto, setPareto] = useState([]);
  const [tempoFechamento, setTempoFechamento] = useState(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const perPage = 20;

  useEffect(() => {
    rq03Service.resumo().then(r => setResumo(r.data)).catch(() => {});
    rq03Service.paretoCausas(10).then(r => setPareto(r.data.items || [])).catch(() => {});
    rq03Service.tempoFechamento().then(r => setTempoFechamento(r.data)).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [page, statusFilter, tipoFilter, vencendo7d, acaoVencidaFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage };
      if (statusFilter !== 'T') params.status = statusFilter;
      if (tipoFilter !== 'T') params.tipo = tipoFilter;
      if (vencendo7d) params.vencendo_7dias = true;
      if (acaoVencidaFilter) params.acoes_vencidas = true;
      const { data } = await rq03Service.listar(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { toast.error('Erro ao carregar RQ03'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.descricao.trim()) { toast.error('Descri\u00e7\u00e3o obrigat\u00f3ria'); return; }
    try {
      const { data } = await rq03Service.criar(form);
      toast.success('N\u00e3o conformidade registrada');
      setModalOpen(false);
      navigate(`/qualidade/rq03/${data.id}`);
    } catch { toast.error('Erro ao criar'); }
  };

  const toggleBadge = (key) => {
    setActiveBadges(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleExportCSV = () => {
    const CSV_COLS = [
      { key: 'codigo',          label: 'Código' },
      { key: 'reclamante',      label: 'Reclamante' },
      { key: 'tipo',            label: 'Tipo' },
      { key: 'status',          label: 'Status' },
      { key: 'processo_nome',   label: 'Processo' },
      { key: 'responsavel_nome',label: 'Responsável' },
      { key: 'dt_abertura',     label: 'Dt. Abertura', render: r => r.dt_abertura ? fmtDate(r.dt_abertura) : '' },
      { key: 'dt_fechamento',   label: 'Dt. Fechamento', render: r => r.dt_fechamento ? fmtDate(r.dt_fechamento) : '' },
      { key: 'prioridade',      label: 'Prioridade' },
    ];
    const csv = toCSV(filtered, CSV_COLS);
    downloadBlob(csv, `rq03_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv;charset=utf-8');
    toast.success(`${filtered.length} registro(s) exportados`);
  };

  const filtered = items.filter(item => {
    if (!activeBadges.includes(item.status)) return false;
    if (search) {
      const haystack = `${item.codigo || ''} ${item.reclamante || ''} ${item.responsavel_nome || ''} ${item.processo || ''}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const startIdx = (page - 1) * perPage + 1;
  const endIdx = Math.min(page * perPage, total);

  return (
    <div className="rq03-container">
      {/* LEFT SIDEBAR */}
      <aside className="planos-sidebar">
        <div className="sidebar-section">
          <label className="sidebar-label">
            <span style={{ fontSize: '0.85rem' }}>&#9776;</span> Filtros
          </label>
        </div>

        <div className="sidebar-section">
          <label className="sidebar-label">Status</label>
          {[
            { value: 'T', label: 'Todas' },
            { value: 'ABERTA', label: 'Abertas' },
            { value: 'EM_ANALISE', label: 'Em An\u00e1lise' },
            { value: 'FECHADA', label: 'Fechadas' },
          ].map(opt => (
            <label key={opt.value} className={`sidebar-radio ${statusFilter === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${statusFilter === opt.value ? 'checked' : ''}`} />
              <span onClick={() => { setStatusFilter(opt.value); setPage(1); }}>{opt.label}</span>
            </label>
          ))}
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <label className="sidebar-label">Origem</label>
          {[
            { value: 'T', label: 'Todas' },
            { value: 'C', label: 'Cliente' },
            { value: 'I', label: 'Interna' },
            { value: 'A', label: 'Auditoria' },
            { value: 'S', label: 'SST' },
          ].map(opt => (
            <label key={opt.value} className={`sidebar-radio ${tipoFilter === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${tipoFilter === opt.value ? 'checked' : ''}`} />
              <span onClick={() => { setTipoFilter(opt.value); setPage(1); }}>{opt.label}</span>
            </label>
          ))}
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <label className="sidebar-label">Prazo</label>
          <label
            className={`sidebar-radio rq03-toggle-venc ${vencendo7d ? 'active' : ''}`}
            onClick={() => { setVencendo7d(v => !v); setPage(1); }}
            title="Exibe RQ03 abertas com prazo de 30 dias vencendo nos próximos 7 dias"
          >
            <span className={`radio-dot ${vencendo7d ? 'checked' : ''}`} />
            <span>&#9888; Vencendo em 7 dias</span>
          </label>
          <label
            className={`sidebar-radio rq03-toggle-venc ${acaoVencidaFilter ? 'active' : ''}`}
            onClick={() => { setAcaoVencidaFilter(v => !v); setPage(1); }}
            title="Exibe RQ03 com ação corretiva com prazo vencido"
          >
            <span className={`radio-dot ${acaoVencidaFilter ? 'checked' : ''}`} />
            <span>&#128683; Ação Corretiva Vencida</span>
          </label>
        </div>
      </aside>

      {/* MAIN */}
      <main className="planos-main">
        {/* Header */}
        <div className="planos-header">
          <h1>N\u00e3o Conformidades (RQ03)</h1>
          <button className="planos-btn-novo" onClick={() => setModalOpen(true)}>
            Novo +
          </button>
          <button className="planos-btn-export" onClick={handleExportCSV} title="Exportar CSV dos registros filtrados" disabled={filtered.length === 0}>
            CSV
          </button>
        </div>

        {/* Banner ações vencidas */}
        {resumo && resumo.acoes_vencidas > 0 && (
          <div className="rq03-alert-vencidas">
            <span>&#9888;</span>
            <strong>{resumo.acoes_vencidas}</strong>
            {` ação${resumo.acoes_vencidas > 1 ? 'ões corretivas' : ' corretiva'} com prazo vencido`}
          </div>
        )}

        {/* Mini Chart */}
        {!loading && items.length > 0 && <RQ03MiniChart items={items} />}

        {/* Analytics — Pareto + Tempo Médio (tarefas 271-272) */}
        {(pareto.length > 0 || tempoFechamento) && (
          <div style={{ marginTop: 12 }}>
            <button
              style={{ width: '100%', fontSize: 11, fontWeight: 700, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', background: analyticsOpen ? 'var(--accent)' : 'transparent', color: analyticsOpen ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left' }}
              onClick={() => setAnalyticsOpen(v => !v)}
            >
              {analyticsOpen ? '▲' : '▼'} Indicadores
            </button>
            {analyticsOpen && (
              <div style={{ marginTop: 8 }}>
                {/* Tempo médio de fechamento (tarefa 272) */}
                {tempoFechamento?.stats && (
                  <div style={{ background: 'var(--card-bg)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>TEMPO MÉDIO DE FECHAMENTO</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>
                      {tempoFechamento.stats.media_dias ?? '—'} <span style={{ fontSize: 12, fontWeight: 400 }}>dias</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      Mín: {tempoFechamento.stats.min_dias ?? '—'}d · Máx: {tempoFechamento.stats.max_dias ?? '—'}d
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {tempoFechamento.stats.total_fechadas ?? 0} fechadas · {tempoFechamento.stats.total_abertas ?? 0} abertas
                    </div>
                  </div>
                )}
                {/* Pareto causas (tarefa 271) */}
                {pareto.length > 0 && (
                  <div style={{ background: 'var(--card-bg)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>PARETO — CAUSAS MAIS FREQ.</div>
                    {pareto.slice(0, 6).map((item, idx) => (
                      <div key={idx} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }} title={item.causa}>{item.causa}</span>
                          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{item.total}</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 3, background: 'var(--accent)', width: `${item.percentual}%` }} />
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'right' }}>{item.percentual_acum}% acum.</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Search + Badges */}
        <div className="planos-toolbar">
          <div className="planos-search">
            <Icon width={15} height={15}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>
            <input type="text" placeholder="Pesquisar não conformidades..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="planos-badges">
            {STATUS_BADGES.map(b => {
              const isActive = activeBadges.includes(b.key);
              const count = items.filter(i => i.status === b.key).length;
              return (
                <button key={b.key} className={`planos-badge ${isActive ? 'active' : 'inactive'}`}
                  style={{ '--badge-bg': b.bg }} onClick={() => toggleBadge(b.key)}>
                  <span className="badge-check">{isActive ? '\u2713' : ''}</span>
                  <span className="badge-label">{b.label}</span>
                  {count > 0 && <span className="badge-count">{count}</span>}
                  <span className="badge-close" onClick={e => { e.stopPropagation(); toggleBadge(b.key); }}>&times;</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="planos-table-wrapper">
            <table className="planos-table">
              <thead><tr><th className="col-action"></th><th className="col-center">Código</th><th>Reclamante</th><th className="col-center">Tipo</th><th className="col-center">Status</th><th>Processo</th><th>Responsável</th><th>Resp. Ação</th><th className="col-center">Abertura</th><th className="col-center">Equipe</th></tr></thead>
              <tbody><SkeletonSimpleTable rows={6} cols={[36, 70, '20%', 80, 90, '15%', 130, 80, 50]} /></tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="planos-empty">
            <span style={{ fontSize: '2.5rem' }}>&#128203;</span>
            <p>Nenhuma n\u00e3o conformidade encontrada</p>
          </div>
        ) : (
          <>
            <div className="planos-table-wrapper">
              <table className="planos-table">
                <thead>
                  <tr>
                    <th className="col-action"></th>
                    <th className="col-center">C\u00f3digo</th>
                    <th>Reclamante</th>
                    <th className="col-center">Tipo</th>
                    <th className="col-center">Status</th>
                    <th>Processo</th>
                    <th>Respons\u00e1vel</th>
                    <th>Resp. Ação</th>
                    <th className="col-center">Abertura</th>
                    <th className="col-center">Equipe</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.ABERTA;
                    return (
                      <tr key={r.id} className={rowClass(r.status)}
                        onClick={() => navigate(`/qualidade/rq03/${r.id}`)}>
                        <td className="col-action">
                          <button className="edit-btn" onClick={e => { e.stopPropagation(); navigate(`/qualidade/rq03/${r.id}`); }} title="Editar">
                            <Icon width={13} height={13}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>
                          </button>
                        </td>
                        <td className="col-center">
                          <span className="rq03-codigo">{r.codigo || `#${r.id}`}</span>
                        </td>
                        <td>{r.reclamante || '\u2014'}</td>
                        <td className="col-center">
                          {(r.tipo === 'S' || r.tipo === 'SST') ? (
                            <Tooltip text="Acidente de Trabalho — requer preenchimento SST" placement="top">
                              <span className="rq03-tipo-badge tipo-s rq03-sst-destaque">
                                &#9888; SST
                              </span>
                            </Tooltip>
                          ) : (
                            <span className={`rq03-tipo-badge tipo-${(r.tipo || 'c').toLowerCase()}`}>
                              {TIPO_LABELS[r.tipo] || r.tipo || '\u2014'}
                            </span>
                          )}
                        </td>
                        <td className="col-center">
                          <Tooltip text={buildStatusTooltip(r)} placement="top">
                            <span>
                              <StatusBadge status={r.status} label={cfg.label} />
                            </span>
                          </Tooltip>
                        </td>
                        <td>{r.processo || '\u2014'}</td>
                        <td>
                          <div className="user-cell">
                            <UserAvatar name={r.responsavel_nome} size={28} />
                            <span className="user-name">{r.responsavel_nome || '\u2014'}</span>
                          </div>
                        </td>
                        <td>
                          {r.responsavel_acao_nome
                            ? <div className="user-cell">
                                <UserAvatar name={r.responsavel_acao_nome} size={24} />
                                <span className="user-name">{r.responsavel_acao_nome}</span>
                              </div>
                            : <span style={{ color: 'var(--text-muted)' }}>—</span>
                          }
                        </td>
                        <td className="col-center col-nowrap">{fmtDate(r.dt_abertura)}</td>
                        <td className="col-center">{r.qtd_equipe || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="planos-pagination">
              <span className="pagination-info">{startIdx}\u2013{endIdx} de {total} registros</span>
              <div className="pagination-buttons">
                <button disabled={page <= 1} onClick={() => setPage(1)}>&laquo;</button>
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>&lsaquo;</button>
                <span className="pagination-page">P\u00e1gina {page} de {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>&rsaquo;</button>
                <button disabled={page >= totalPages} onClick={() => setPage(totalPages)}>&raquo;</button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Modal criacao */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova N\u00e3o Conformidade"
        footer={<><button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button><button className="btn-primary" onClick={handleCreate}>Registrar</button></>}>
        <div className="form-group"><label>Reclamante</label><input className="form-control" value={form.reclamante} onChange={e => setForm(f => ({...f, reclamante: e.target.value}))} /></div>
        <div className="form-group"><label>Descri\u00e7\u00e3o *</label><textarea className="form-control" rows={4} value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} /></div>
        <div className="form-row">
          <div className="form-group"><label>Tipo</label>
            <select className="form-control" value={form.tipo} onChange={e => setForm(f => ({...f, tipo: e.target.value}))}>
              <option value="EXTERNA">Externa (cliente)</option><option value="INTERNA">Interna</option><option value="SST">SST (acidente)</option>
            </select>
          </div>
          <div className="form-group"><label>Prioridade</label>
            <select className="form-control" value={form.prioridade} onChange={e => setForm(f => ({...f, prioridade: e.target.value}))}>
              <option value="URGENTE">Urgente</option><option value="ALTA">Alta</option><option value="MEDIA">M\u00e9dia</option><option value="BAIXA">Baixa</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

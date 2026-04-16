/**
 * Produção / Checklists — Lista (padrão visual PlanosList)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { checklistService } from '../../services/fabricacao/checklistService';
import KanbanBoard from '../../components/KanbanBoard';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { SkeletonKanban, SkeletonSimpleTable } from '../../components/SkeletonPlanos';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import '../../components/Modal.css';
import '../planos_acao/PlanosList.css';
import { UserAvatar } from '../../components/ui';
import './FabricacaoList.css';

const ETAPA_LABELS = { BOB: 'Bobinagem', CNJ_MOT: 'Conjunto', ENS_HID: 'Ensaio', PIN: 'Pintura', QLD: 'Qualidade', MNT: 'Manutenção', EXP: 'Expedição', EMB: 'Embalagem' };
const ETAPA_COLORS = { BOB: '#e91e63', CNJ_MOT: '#9c27b0', ENS_HID: '#3f51b5', PIN: '#ff9800', QLD: '#4caf50', MNT: '#607d8b', EXP: '#009688', EMB: '#795548' };

const STATUS_MAP = {
  EM_PRODUCAO: { label: 'Em Produção', rowBg: 'rgba(255, 152, 0, 0.08)' },
  CONCLUIDO:   { label: 'Concluído',   rowBg: 'rgba(76, 175, 80, 0.08)' },
  CANCELADO:   { label: 'Cancelado',   rowBg: 'transparent' },
};

const STATUS_BADGES = [
  { key: 'EM_PRODUCAO', label: 'Em Produção', bg: '#ff9800' },
  { key: 'CONCLUIDO',   label: 'Concluído',   bg: '#4caf50' },
  { key: 'CANCELADO',   label: 'Cancelado',   bg: '#ef4444' },
];

function normStatus(s) {
  if (!s) return 'EM_PRODUCAO';
  const u = s.toUpperCase();
  if (u === 'CONCLUIDO') return 'CONCLUIDO';
  if (u === 'CANCELADO') return 'CANCELADO';
  return 'EM_PRODUCAO';
}

function ProdutividadeDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modeloFiltro, setModeloFiltro] = useState('');
  const toast = useToast();

  const fetchDash = async (modelo) => {
    setLoading(true);
    try {
      const params = modelo ? { modelo } : {};
      const { data: d } = await checklistService.dashProdutividade(params);
      setData(d);
    } catch { toast.error('Erro ao carregar dashboard'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDash(modeloFiltro); }, [modeloFiltro]);

  if (loading) return <div className="planos-empty">Carregando estatísticas...</div>;
  if (!data) return null;

  const chartData = data.etapas
    .filter(e => e.media_dias !== null)
    .map(e => ({ ...e, media_dias: e.media_dias || 0 }));

  const maxDias = Math.max(...chartData.map(e => e.media_dias), 1);

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Filtro modelo */}
      {data.modelos?.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Modelo:</span>
          <button
            style={{ padding: '3px 10px', borderRadius: 12, border: '1px solid var(--border-primary)', fontSize: '0.78rem',
              background: modeloFiltro === '' ? 'var(--accent)' : 'var(--bg-input)', color: modeloFiltro === '' ? '#fff' : 'var(--text-primary)', cursor: 'pointer' }}
            onClick={() => setModeloFiltro('')}
          >Todos</button>
          {data.modelos.map(m => (
            <button key={m}
              style={{ padding: '3px 10px', borderRadius: 12, border: '1px solid var(--border-primary)', fontSize: '0.78rem',
                background: modeloFiltro === m ? 'var(--accent)' : 'var(--bg-input)', color: modeloFiltro === m ? '#fff' : 'var(--text-primary)', cursor: 'pointer' }}
              onClick={() => setModeloFiltro(m)}
            >{m}</button>
          ))}
        </div>
      )}

      {/* Gráfico de barras */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '16px 12px' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Média de dias por etapa
          {modeloFiltro && ` — ${modeloFiltro}`}
        </div>
        {chartData.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: 16 }}>Nenhuma etapa concluída ainda.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 60, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} angle={-30} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} label={{ value: 'dias', angle: -90, position: 'insideLeft', fontSize: 10, fill: 'var(--text-muted)' }} />
              <RechartTooltip
                contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 12 }}
                formatter={(v, n, p) => [`${v} dias (${p.payload.concluidos} concluídos)`, 'Média']}
              />
              <Bar dataKey="media_dias" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map(e => {
                  const ratio = e.media_dias / maxDias;
                  const color = ratio > 0.7 ? '#ef4444' : ratio > 0.4 ? '#ff9800' : '#4caf50';
                  return <Cell key={e.key} fill={color} />;
                })}
                <LabelList dataKey="media_dias" position="top" formatter={v => `${v}d`} style={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Tabela resumo */}
      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-primary)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Etapa</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Iniciadas</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Concluídas</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Média (dias)</th>
            </tr>
          </thead>
          <tbody>
            {data.etapas.map(e => (
              <tr key={e.key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '5px 8px' }}>{e.label}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{e.iniciados}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{e.concluidos}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>
                  {e.media_dias !== null ? `${e.media_dias} d` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FabricacaoList() {
  const [viewMode, setViewMode] = useState('lista'); // lista | kanban | estatisticas
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [board, setBoard] = useState({ colunas: [] });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('T');
  const [modeloFilter, setModeloFilter] = useState('');
  const [modelos, setModelos] = useState([]);
  const [ensHidFilter, setEnsHidFilter] = useState(null); // null=todos, true=com, false=sem
  const [tipoFilter, setTipoFilter] = useState('');
  const [search, setSearch] = useState('');
  const [activeBadges, setActiveBadges] = useState(STATUS_BADGES.map(b => b.key));
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ pv: '', nr_serie: '', cliente: '', equipamento: '', modelo: '' });
  const navigate = useNavigate();
  const toast = useToast();
  const perPage = 20;

  useEffect(() => {
    checklistService.modelos().then(r => setModelos(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [viewMode, page, statusFilter, modeloFilter, ensHidFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (viewMode === 'kanban') {
        const { data } = await checklistService.kanban();
        setBoard(data);
      } else if (viewMode === 'lista') {
        const params = { page, per_page: perPage };
        if (statusFilter !== 'T') params.status = statusFilter;
        if (modeloFilter) params.modelo = modeloFilter;
        if (ensHidFilter !== null) params.com_ens_hid = ensHidFilter;
        const { data } = await checklistService.listar(params);
        setItems(data.items || []);
        setTotal(data.total || 0);
      }
    } catch { toast.error('Erro ao carregar'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.pv.trim()) { toast.error('PV obrigatório'); return; }
    try {
      const res = await checklistService.criar(form);
      toast.success('Checklist criado');
      setModalOpen(false);
      setForm({ pv: '', nr_serie: '', cliente: '', equipamento: '', modelo: '' });
      if (res.data?.id) navigate(`/fabricacao/${res.data.id}`);
      else fetchData();
    } catch { toast.error('Erro'); }
  };

  const toggleBadge = (key) => {
    setActiveBadges(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const filtered = items.filter(item => {
    const st = normStatus(item.status);
    if (!activeBadges.includes(st)) return false;
    if (tipoFilter && item.tipo !== tipoFilter) return false;
    if (search) {
      const hay = `${item.pv||''} ${item.nr_serie||''} ${item.cliente||''} ${item.modelo||''} ${item.equipamento||''}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const totalEtapas = board.total_etapas || 0;
  const kanbanColumns = (board.colunas || []).map(c => ({
    id: c.id, title: c.title, color: c.color,
    items: (c.items || []).map(i => ({ ...i, titulo: i.titulo || `PV ${i.pv || ''}` })),
  }));

  const startIdx = (page - 1) * perPage + 1;
  const endIdx = Math.min(page * perPage, total);

  return (
    <div className="fab-container">
      {/* LEFT SIDEBAR */}
      <aside className="planos-sidebar">
        <div className="sidebar-section">
          <label className="sidebar-label">
            <span style={{ fontSize: '0.85rem' }}>☰</span> Filtros
          </label>
        </div>

        <div className="sidebar-section">
          <label className="sidebar-label">Visão</label>
          {[
            { value: 'lista', label: 'Lista' },
            { value: 'kanban', label: 'Kanban' },
            { value: 'estatisticas', label: 'Estatísticas' },
          ].map(opt => (
            <label key={opt.value} className={`sidebar-radio ${viewMode === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${viewMode === opt.value ? 'checked' : ''}`} />
              <span onClick={() => { setViewMode(opt.value); setPage(1); }}>{opt.label}</span>
            </label>
          ))}
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <label className="sidebar-label">Status</label>
          {[
            { value: 'T', label: 'Todos' },
            { value: 'EM_PRODUCAO', label: 'Em Produção' },
            { value: 'CONCLUIDO', label: 'Concluído' },
          ].map(opt => (
            <label key={opt.value} className={`sidebar-radio ${statusFilter === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${statusFilter === opt.value ? 'checked' : ''}`} />
              <span onClick={() => { setStatusFilter(opt.value); setPage(1); }}>{opt.label}</span>
            </label>
          ))}
        </div>
        {modelos.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section">
              <label className="sidebar-label">Modelo</label>
              <label className={`sidebar-radio ${modeloFilter === '' ? 'active' : ''}`}>
                <span className={`radio-dot ${modeloFilter === '' ? 'checked' : ''}`} />
                <span onClick={() => { setModeloFilter(''); setPage(1); }}>Todos</span>
              </label>
              {modelos.map(m => (
                <label key={m} className={`sidebar-radio ${modeloFilter === m ? 'active' : ''}`}>
                  <span className={`radio-dot ${modeloFilter === m ? 'checked' : ''}`} />
                  <span onClick={() => { setModeloFilter(m); setPage(1); }} style={{ fontSize: '0.8rem' }}>{m}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="sidebar-divider" />
        <div className="sidebar-section">
          <label className="sidebar-label">Ensaio Hidro.</label>
          {[
            { value: null, label: 'Todos' },
            { value: true, label: 'Com ENS_HID' },
            { value: false, label: 'Sem ENS_HID' },
          ].map(opt => (
            <label key={String(opt.value)} className={`sidebar-radio ${ensHidFilter === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${ensHidFilter === opt.value ? 'checked' : ''}`} />
              <span onClick={() => { setEnsHidFilter(opt.value); setPage(1); }}>{opt.label}</span>
            </label>
          ))}
        </div>
        <div className="sidebar-divider" />
        <div className="sidebar-section">
          <label className="sidebar-label">Tipo</label>
          {[
            { value: '', label: 'Todos' },
            { value: 'BOMBA', label: 'Bomba' },
            { value: 'MOTOR', label: 'Motor' },
            { value: 'CONJUNTO', label: 'Conjunto' },
          ].map(opt => (
            <label key={opt.value} className={`sidebar-radio ${tipoFilter === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${tipoFilter === opt.value ? 'checked' : ''}`} />
              <span onClick={() => { setTipoFilter(opt.value); setPage(1); }}>{opt.label}</span>
            </label>
          ))}
        </div>
      </aside>

      {/* MAIN */}
      <main className="fab-main">
        {/* Header */}
        <div className="planos-header">
          <h1>Produção / Checklists</h1>
          <button className="planos-btn-novo" onClick={() => setModalOpen(true)}>
            + Novo Checklist
          </button>
        </div>

        {/* Search + Badges (only for lista view) */}
        {viewMode === 'lista' && (
          <div className="planos-toolbar">
            <div className="planos-search">
              <Icon width={15} height={15}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>
              <input type="text" placeholder="Pesquisar checklists..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="planos-badges">
              {STATUS_BADGES.map(b => {
                const isActive = activeBadges.includes(b.key);
                const count = items.filter(i => normStatus(i.status) === b.key).length;
                return (
                  <button key={b.key} className={`planos-badge ${isActive ? 'active' : 'inactive'}`}
                    style={{ '--badge-bg': b.bg }} onClick={() => toggleBadge(b.key)}>
                    <span className="badge-check">{isActive ? '✓' : ''}</span>
                    <span className="badge-label">{b.label}</span>
                    {count > 0 && <span className="badge-count">{count}</span>}
                    <span className="badge-close" onClick={e => { e.stopPropagation(); toggleBadge(b.key); }}>×</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          viewMode === 'kanban' ? <SkeletonKanban /> : (
            <div className="fab-table-wrapper">
              <table className="fab-table">
                <thead><tr><th className="col-action"></th><th>PV</th><th>Nr. Série</th><th>Cliente</th><th>Equipamento</th><th>Etapa Atual</th><th>Dias na Etapa</th><th>Status</th><th>Data</th></tr></thead>
                <tbody><SkeletonSimpleTable rows={7} cols={[36, 80, 100, 120, 130, 90, 60, 90, 80]} /></tbody>
              </table>
            </div>
          )
        ) : viewMode === 'kanban' ? (
          /* Kanban view */
          kanbanColumns.length === 0 ? <div className="planos-empty">Nenhuma etapa configurada</div> : (
            <KanbanBoard
              columns={kanbanColumns}
              dragEnabled={false}
              onCardClick={(item) => navigate(`/fabricacao/${item.id}`)}
              renderCard={(item) => {
                const prog = totalEtapas > 0
                  ? Math.round(((item.etapa_ordem || 0) / totalEtapas) * 100)
                  : (item.status === 'CONCLUIDO' ? 100 : 0);
                const progColor = prog >= 100 ? '#4caf50' : prog >= 60 ? '#ff9800' : '#2196f3';
                const isParado = item.status !== 'CONCLUIDO' && item.updated_at &&
                  (Date.now() - new Date(item.updated_at).getTime()) > 48 * 60 * 60 * 1000;
                return (
                  <>
                    {isParado && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 4, padding: '2px 6px', marginBottom: 4,
                        fontSize: '0.62rem', color: '#ef4444', fontWeight: 600,
                      }}>
                        &#9888; Parado há mais de 48h
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="kanban-item-title" style={{ margin: 0 }}>{item.pv ? `PV ${item.pv}` : `#${item.id}`}</span>
                      <span className={`status-badge ${(item.status || '').toLowerCase()}`} style={{ fontSize: '0.6rem' }}>{item.status}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 2 }}>{item.cliente || '—'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                      {item.modelo || ''}{item.nr_serie ? ` · S/N: ${item.nr_serie}` : ''}
                    </div>
                    {/* Progress bar etapas */}
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 2 }}>
                        <span>Etapa {item.etapa_ordem || 0}/{totalEtapas || '?'}</span>
                        <span>{prog}%</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${prog}%`, background: progColor, borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                    {item.responsavel_nome && (
                      <div className="kanban-item-footer">
                        <UserAvatar name={item.responsavel_nome} size={20} />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.responsavel_nome}</span>
                      </div>
                    )}
                  </>
                );
              }}
            />
          )
        ) : viewMode === 'estatisticas' ? (
          <ProdutividadeDashboard />
        ) : filtered.length === 0 ? (
          <div className="planos-empty">
            <span style={{ fontSize: '2.5rem' }}>🏭</span>
            <p>Nenhum checklist encontrado</p>
          </div>
        ) : (
          <>
            <div className="fab-table-wrapper">
              <table className="fab-table">
                <thead>
                  <tr>
                    <th className="col-action"></th>
                    <th className="col-center">PV</th>
                    <th className="col-center">Nr. Série</th>
                    <th>Cliente</th>
                    <th>Equipamento</th>
                    <th className="col-center">Etapa Atual</th>
                    <th className="col-center">Dias na Etapa</th>
                    <th className="col-center">Status</th>
                    <th className="col-center">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const st = normStatus(c.status);
                    const cfg = STATUS_MAP[st] || STATUS_MAP.EM_PRODUCAO;
                    return (
                      <tr key={c.id} style={{ '--row-bg': cfg.rowBg }} className="fab-row"
                        onClick={() => navigate(`/fabricacao/${c.id}`)}>
                        <td className="col-action">
                          <button className="edit-btn" onClick={e => { e.stopPropagation(); navigate(`/fabricacao/${c.id}`); }} title="Editar checklist">
                            <Icon width={13} height={13}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>
                          </button>
                        </td>
                        <td className="col-center col-mono">{c.pv || '—'}</td>
                        <td className="col-center col-nowrap">{c.nr_serie || '—'}</td>
                        <td>{c.cliente || '—'}</td>
                        <td>{c.equipamento || '—'}</td>
                        <td className="col-center">
                          {c.etapa_atual ? (
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                              background: ETAPA_COLORS[c.etapa_atual] || '#e5e7eb',
                              color: '#fff'
                            }}>
                              {ETAPA_LABELS[c.etapa_atual] || c.etapa_atual}
                            </span>
                          ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Aguardando</span>}
                        </td>
                        <td className="col-center" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                          {c.dias_na_etapa != null ? `${c.dias_na_etapa}d` : '—'}
                        </td>
                        <td className="col-center">
                          <span className="status-label" style={{ color: st === 'CONCLUIDO' ? '#1B5E20' : st === 'CANCELADO' ? '#B71C1C' : '#E65100' }}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="col-center col-nowrap">{c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="planos-pagination">
              <span className="pagination-info">{startIdx}–{endIdx} de {total} registros</span>
              <div className="pagination-buttons">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>◀</button>
                <span className="pagination-page">Página {page} de {Math.max(1, Math.ceil(total / perPage))}</span>
                <button disabled={page >= Math.ceil(total / perPage)} onClick={() => setPage(p => p + 1)}>▶</button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Modal Criar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Checklist"
        footer={<><button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button><button className="btn-primary" onClick={handleCreate}>Criar</button></>}>
        <div className="form-row">
          <div className="form-group"><label>PV *</label><input className="form-control" value={form.pv} onChange={e => setForm(f => ({ ...f, pv: e.target.value }))} /></div>
          <div className="form-group"><label>Nr. Série</label><input className="form-control" value={form.nr_serie} onChange={e => setForm(f => ({ ...f, nr_serie: e.target.value }))} /></div>
        </div>
        <div className="form-group"><label>Cliente</label><input className="form-control" value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} /></div>
        <div className="form-row">
          <div className="form-group"><label>Equipamento</label><input className="form-control" value={form.equipamento} onChange={e => setForm(f => ({ ...f, equipamento: e.target.value }))} /></div>
          <div className="form-group"><label>Modelo</label><input className="form-control" value={form.modelo} onChange={e => setForm(f => ({ ...f, modelo: e.target.value }))} /></div>
        </div>
      </Modal>
    </div>
  );
}

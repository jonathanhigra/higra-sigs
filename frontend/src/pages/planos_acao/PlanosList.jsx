/**
 * APEX pg 3 — Relação Planos de Ação
 * #1  Export CSV button (backend GET /exportar)
 * #2  Filter by responsável in sidebar
 * #3  Progress % column in table (mini bar)
 * #4  Kanban undo after drag (5s toast)
 * (prev) Sortable columns, date filters, inline preview, drag kanban,
 *        summary counters, debounce, LOV cache, kanban load-more
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { planoService } from '../../services/planos_acao/planoService';
import useLovStore from '../../stores/lovStore';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import { SkeletonSummaryBar, SkeletonTableRows, SkeletonKanban } from '../../components/SkeletonPlanos';
import '../../components/Modal.css';
import { UserAvatar } from '../../components/ui';
import './PlanosList.css';
import '../tarefas/TarefasKanban.css';

// ── Config ──────────────────────────────────────────────────────────────────

const KANBAN_COLS = [
  { key: 'PENDENTE',     label: 'Aguardando',   color: '#f0c040' },
  { key: 'VENCIDA',      label: 'Vencidas',     color: '#ef4444' },
  { key: 'IMPLEMENTADO', label: 'Implementado', color: '#4caf50' },
  { key: 'CANCELADO',    label: 'Cancelada',    color: '#aaa' },
];

const KANBAN_PAGE = 15; // cards por coluna antes de "ver mais"

const STATUS_CONFIG = {
  PENDENTE:     { label: 'Aguardando',            bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' },
  EM_ANDAMENTO: { label: 'Aguardando',            bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' },
  IMPLEMENTADO: { label: 'Implementado',          bg: 'rgba(76, 175, 80, 0.12)',  color: '#4caf50' },
  CANCELADO:    { label: 'Cancelada',             bg: 'rgba(150, 150, 150, 0.10)', color: 'var(--text-muted)' },
  CONCLUIDO:    { label: 'Implementado',          bg: 'rgba(76, 175, 80, 0.12)',  color: '#4caf50' },
  VENCIDA:      { label: 'Vencida',               bg: 'rgba(239, 68, 68, 0.12)',  color: '#ef4444' },
  AVALIACAO:    { label: 'Ag. Avaliação Eficácia', bg: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' },
};

const STATUS_BADGES = [
  { key: 'PENDENTE',     label: 'Aguardando',   bg: '#f0c040' },
  { key: 'CANCELADO',    label: 'Cancelada',    bg: '#aaa' },
  { key: 'IMPLEMENTADO', label: 'Implementado', bg: '#4caf50' },
  { key: 'VENCIDA',      label: 'Vencida',      bg: '#ef4444' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getRowStatus(item) {
  if (item.row_status) return item.row_status;
  if (item.status === 'CANCELADO') return 'CANCELADO';
  if (item.status === 'CONCLUIDO' || item.status === 'IMPLEMENTADO') return 'IMPLEMENTADO';
  if (item.dt_prazo && new Date(item.dt_prazo) < new Date() &&
      !['CONCLUIDO', 'IMPLEMENTADO', 'CANCELADO'].includes(item.status)) return 'VENCIDA';
  return 'PENDENTE';
}

function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ── Summary counters (#20) ──────────────────────────────────────────────────

function SummaryBar({ items }) {
  const total = items.length;
  const pendentes = items.filter(i => getRowStatus(i) === 'PENDENTE').length;
  const vencidas = items.filter(i => getRowStatus(i) === 'VENCIDA').length;
  const implementadas = items.filter(i => getRowStatus(i) === 'IMPLEMENTADO').length;
  const canceladas = items.filter(i => getRowStatus(i) === 'CANCELADO').length;

  return (
    <div className="planos-summary-bar">
      <div className="planos-summary-card">
        <span className="summary-num">{total}</span>
        <span className="summary-lbl">Total</span>
      </div>
      <div className="planos-summary-card pendentes">
        <span className="summary-num">{pendentes}</span>
        <span className="summary-lbl">Aguardando</span>
      </div>
      <div className="planos-summary-card vencidas">
        <span className="summary-num">{vencidas}</span>
        <span className="summary-lbl">Vencidas</span>
      </div>
      <div className="planos-summary-card implementadas">
        <span className="summary-num">{implementadas}</span>
        <span className="summary-lbl">Implementadas</span>
      </div>
      <div className="planos-summary-card canceladas">
        <span className="summary-num">{canceladas}</span>
        <span className="summary-lbl">Canceladas</span>
      </div>
    </div>
  );
}

// ── Inline row preview (#6) ─────────────────────────────────────────────────

function RowPreview({ item, onNavigate }) {
  return (
    <tr className="planos-row-preview">
      <td colSpan={10} style={{ padding: '12px 16px' }}>
        <div className="planos-preview-inner">
          <div className="planos-preview-col">
            <span className="preview-label">O quê?</span>
            <span className="preview-value">{item.titulo || item.descricao || '—'}</span>
          </div>
          <div className="planos-preview-col">
            <span className="preview-label">Por quê?</span>
            <span className="preview-value">{item.descricao || '—'}</span>
          </div>
          <div className="planos-preview-col">
            <span className="preview-label">Como?</span>
            <span className="preview-value">{item.metodo || '—'}</span>
          </div>
          <div className="planos-preview-col">
            <span className="preview-label">Custo prev.</span>
            <span className="preview-value">{item.custo != null ? `R$ ${Number(item.custo).toFixed(2)}` : '—'}</span>
          </div>
          <div className="planos-preview-col">
            <span className="preview-label">% Progresso</span>
            <span className="preview-value">
              {item._source === 'GAC' && item.tarefas_total > 0
                ? `${item.tarefas_concluidas}/${item.tarefas_total} tarefas`
                : item.percentual != null ? `${item.percentual}%` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8 }}>
            <button className="planos-btn-novo" style={{ fontSize: '0.78rem', padding: '6px 14px' }}
              onClick={() => onNavigate(item)}>
              Abrir Detalhe ↗
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Kanban Card (drag-and-drop #8) ──────────────────────────────────────────

function KanbanCard({ item, onDragStart, onClick }) {
  const isVencida = item.dt_prazo && new Date(item.dt_prazo) < new Date() && getRowStatus(item) === 'PENDENTE';
  return (
    <div
      className={`tarefas-kanban-card ${isVencida ? 'atrasada' : ''}`}
      draggable
      onDragStart={() => onDragStart(item)}
      onClick={onClick}
      title={`${item.titulo || item.descricao}\n${item.responsavel_nome || ''}\nPrazo: ${item.dt_prazo ? new Date(item.dt_prazo).toLocaleDateString('pt-BR') : '—'}`}
    >
      <div className="tarefas-kanban-card-title">{item.titulo || item.descricao || '—'}</div>
      {item._source === 'GAC' && item.tarefas_total > 0 && (
        <div className="plano-kanban-progress">
          <div className="plano-kanban-progress-bar">
            <div style={{ width: `${Math.round((item.tarefas_concluidas / item.tarefas_total) * 100)}%` }} />
          </div>
          <span>{item.tarefas_concluidas}/{item.tarefas_total}</span>
        </div>
      )}
      <div className="tarefas-kanban-card-footer">
        <div className="tarefas-kanban-card-meta">
          {item.dt_prazo && (
            <span className={isVencida ? 'overdue' : ''}>
              {new Date(item.dt_prazo).toLocaleDateString('pt-BR')}
            </span>
          )}
          {item.origem_tipo && <span style={{ opacity: 0.6 }}>{item.origem_tipo}</span>}
        </div>
        {item.responsavel_nome && <UserAvatar name={item.responsavel_nome} size={22} />}
      </div>
    </div>
  );
}

// ── Sortable column header (#4) ─────────────────────────────────────────────

function SortTh({ children, field, sortBy, sortDir, onSort, className }) {
  const active = sortBy === field;
  return (
    <th
      className={`${className || ''} col-sortable`}
      onClick={() => onSort(field)}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      {children}
      {active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}
    </th>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function PlanosList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('lista');
  const [statusFilter, setStatusFilter] = useState('T');
  const [porFilter, setPorFilter] = useState('T');
  const [filialFilter, setFilialFilter] = useState('');
  const [search, setSearch] = useState('');
  const [activeBadges, setActiveBadges] = useState(STATUS_BADGES.map(b => b.key));
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', descricao: '', dt_prazo: '', origem_tipo: '', responsavel_id: '' });
  const [expandedId, setExpandedId] = useState(null); // inline preview
  const [sortBy, setSortBy] = useState('created_at'); // sortable columns
  const [sortDir, setSortDir] = useState('desc');
  // date range filters
  const [dtPrazoInicio, setDtPrazoInicio] = useState('');
  const [dtPrazoFim, setDtPrazoFim] = useState('');
  const [dtCriadoInicio, setDtCriadoInicio] = useState('');
  const [dtCriadoFim, setDtCriadoFim] = useState('');
  // #2 responsável filter
  const [responsavelFilter, setResponsavelFilter] = useState('');
  // drag target
  const [dragItem, setDragItem] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  // #4 kanban undo state
  const [undoState, setUndoState] = useState(null); // {item, prevStatus, timer}
  // kanban load-more per column
  const [kanbanLimits, setKanbanLimits] = useState({});
  // #1 CSV exporting
  const [exporting, setExporting] = useState(false);

  const navigate = useNavigate();
  const toast = useToast();
  const { getFiliais, getUsuarios } = useLovStore(); // #22 LOV cache
  const [filiais, setFiliais] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const perPage = view === 'kanban' ? 200 : 20;

  const debouncedSearch = useDebounce(search, 400); // #21

  useEffect(() => {
    getFiliais().then(setFiliais);
    getUsuarios().then(setUsuarios);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, porFilter, filialFilter, debouncedSearch, view, sortBy, sortDir,
      dtPrazoInicio, dtPrazoFim, dtCriadoInicio, dtCriadoFim, responsavelFilter]);

  useEffect(() => { fetchData(); }, [
    page, statusFilter, porFilter, filialFilter, debouncedSearch, view, sortBy, sortDir,
    dtPrazoInicio, dtPrazoFim, dtCriadoInicio, dtCriadoFim,
  ]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage, sort_by: sortBy, sort_dir: sortDir };
      if (statusFilter !== 'T') params.status = statusFilter;
      if (porFilter !== 'T') params.por = porFilter;
      if (filialFilter) params.filial_id = filialFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (dtPrazoInicio) params.dt_prazo_inicio = dtPrazoInicio;
      if (dtPrazoFim) params.dt_prazo_fim = dtPrazoFim;
      if (dtCriadoInicio) params.dt_criado_inicio = dtCriadoInicio;
      if (dtCriadoFim) params.dt_criado_fim = dtCriadoFim;
      if (responsavelFilter) params.responsavel_id = responsavelFilter; // #2
      const { data } = await planoService.listar(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { toast.error('Erro ao carregar planos'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.titulo.trim()) { toast.error('Título obrigatório'); return; }
    try {
      const payload = { ...form };
      if (!payload.dt_prazo) delete payload.dt_prazo;
      if (!payload.origem_tipo) delete payload.origem_tipo;
      if (!payload.responsavel_id) delete payload.responsavel_id;
      else payload.responsavel_id = Number(payload.responsavel_id);
      const res = await planoService.criar(payload);
      toast.success('Plano criado');
      setModalOpen(false);
      setForm({ titulo: '', descricao: '', dt_prazo: '', origem_tipo: '', responsavel_id: '' });
      if (res.data?.id) navigate(`/planos-acao/${res.data.id}?source=GAC`);
      else fetchData();
    } catch { toast.error('Erro ao criar plano'); }
  };

  const toggleBadge = (key) => {
    setActiveBadges(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleDelete = async (item) => {
    if (!window.confirm('Excluir este plano de ação?')) return;
    try {
      await planoService.excluir(item.id, { source: item._source || 'GAC' });
      toast.success('Plano excluído');
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao excluir');
    }
  };

  const handleNavigate = (item) => navigate(`/planos-acao/${item.id}?source=${item._source || 'GAC'}`);

  // #1 export CSV
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const params = {};
      if (statusFilter !== 'T') params.status = statusFilter;
      if (filialFilter) params.filial_id = filialFilter;
      if (responsavelFilter) params.responsavel_id = responsavelFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const res = await planoService.exportarCSV(params);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = 'planos_acao.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Erro ao exportar CSV'); }
    finally { setExporting(false); }
  };

  // sort handler
  const handleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
  };

  // #6 inline preview toggle
  const togglePreview = (id) => setExpandedId(prev => prev === id ? null : id);

  // drag-and-drop with undo (#4)
  const handleDragStart = (item) => setDragItem(item);
  const handleDragOver = (colKey, e) => { e.preventDefault(); setDragOver(colKey); };
  const handleDrop = async (colKey) => {
    setDragOver(null);
    if (!dragItem || getRowStatus(dragItem) === colKey) { setDragItem(null); return; }
    const prevStatus = dragItem.status;
    const statusMap = { PENDENTE: 'PENDENTE', VENCIDA: 'PENDENTE', IMPLEMENTADO: 'CONCLUIDO', CANCELADO: 'CANCELADO' };
    const newStatus = statusMap[colKey] || colKey;
    // Optimistic update
    setItems(prev => prev.map(i => i.id === dragItem.id ? { ...i, status: newStatus, row_status: colKey } : i));
    setDragItem(null);
    try {
      await planoService.atualizar(dragItem.id, { status: newStatus }, { source: dragItem._source || 'GAC' });
      // #4 show undo toast for 5s
      if (undoState?.timer) clearTimeout(undoState.timer);
      const timer = setTimeout(() => { setUndoState(null); fetchData(); }, 5000);
      setUndoState({ item: { ...dragItem, status: prevStatus }, newStatus, timer });
      toast.info?.(`Status → ${colKey}`, 'Desfazer', () => {
        clearTimeout(timer);
        setUndoState(null);
        planoService.atualizar(dragItem.id, { status: prevStatus }, { source: dragItem._source || 'GAC' })
          .then(fetchData).catch(() => toast.error('Erro ao desfazer'));
      });
    } catch {
      toast.error('Erro ao mover plano');
      fetchData();
    }
  };

  // #25 kanban load more per column
  const getKanbanLimit = (key) => kanbanLimits[key] || KANBAN_PAGE;
  const loadMoreKanban = (key) => setKanbanLimits(prev => ({ ...prev, [key]: (prev[key] || KANBAN_PAGE) + KANBAN_PAGE }));

  const filtered = items.filter(item => activeBadges.includes(getRowStatus(item)));

  const kanbanData = KANBAN_COLS.map(col => ({
    ...col,
    allItems: filtered.filter(i => getRowStatus(i) === col.key),
  }));

  const startIdx = (page - 1) * perPage + 1;
  const endIdx = Math.min(page * perPage, total);

  const hasDateFilters = dtPrazoInicio || dtPrazoFim || dtCriadoInicio || dtCriadoFim;

  return (
    <div className="planos-container">
      {/* LEFT SIDEBAR */}
      <aside className="planos-sidebar">
        <div className="sidebar-section">
          <div className="sidebar-label">Visualizacao</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setView('lista')}
              style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: '1px solid var(--border-primary)', background: view === 'lista' ? 'var(--accent)' : 'transparent', color: view === 'lista' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 600 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              Tabela
            </button>
            <button onClick={() => setView('kanban')}
              style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: '1px solid var(--border-primary)', background: view === 'kanban' ? 'var(--accent)' : 'transparent', color: view === 'kanban' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 600 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="10" rx="1"/></svg>
              Kanban
            </button>
          </div>
        </div>
        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <label className="sidebar-label">Unidade(s)</label>
          <select className="form-control sidebar-select" value={filialFilter}
            onChange={e => setFilialFilter(e.target.value)}>
            <option value="">Todas</option>
            {filiais.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <label className="sidebar-label">Status</label>
          {[
            { value: 'T', label: 'Todas' }, { value: 'PENDENTE', label: 'Aguardando' },
            { value: 'VENCIDA', label: 'Atrasado' }, { value: 'IMPLEMENTADO', label: 'Implementadas' },
            { value: 'CANCELADO', label: 'Canceladas' },
          ].map(opt => (
            <label key={opt.value} className={`sidebar-radio ${statusFilter === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${statusFilter === opt.value ? 'checked' : ''}`} />
              <span onClick={() => setStatusFilter(opt.value)}>{opt.label}</span>
            </label>
          ))}
        </div>
        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <label className="sidebar-label">Por</label>
          {[{ value: 'T', label: 'Todos' }, { value: 'M', label: 'Minhas Ações' }, { value: 'P', label: 'Ações do Processo' }].map(opt => (
            <label key={opt.value} className={`sidebar-radio ${porFilter === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${porFilter === opt.value ? 'checked' : ''}`} />
              <span onClick={() => setPorFilter(opt.value)}>{opt.label}</span>
            </label>
          ))}
        </div>
        <div className="sidebar-divider" />

        {/* #2 Responsável filter */}
        <div className="sidebar-section">
          <label className="sidebar-label">Responsável</label>
          <select className="form-control sidebar-select" value={responsavelFilter}
            onChange={e => setResponsavelFilter(e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
        <div className="sidebar-divider" />

        {/* Date range filters */}
        <div className="sidebar-section">
          <label className="sidebar-label" style={{ marginBottom: 6 }}>
            Prazo
            {(dtPrazoInicio || dtPrazoFim) && (
              <button onClick={() => { setDtPrazoInicio(''); setDtPrazoFim(''); }}
                style={{ marginLeft: 6, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.7rem' }}>
                limpar
              </button>
            )}
          </label>
          <input type="date" className="form-control sidebar-date" value={dtPrazoInicio}
            onChange={e => setDtPrazoInicio(e.target.value)} placeholder="De" style={{ marginBottom: 4 }} />
          <input type="date" className="form-control sidebar-date" value={dtPrazoFim}
            onChange={e => setDtPrazoFim(e.target.value)} placeholder="Até" />
        </div>
        <div className="sidebar-divider" />
        <div className="sidebar-section">
          <label className="sidebar-label" style={{ marginBottom: 6 }}>
            Criado em
            {(dtCriadoInicio || dtCriadoFim) && (
              <button onClick={() => { setDtCriadoInicio(''); setDtCriadoFim(''); }}
                style={{ marginLeft: 6, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.7rem' }}>
                limpar
              </button>
            )}
          </label>
          <input type="date" className="form-control sidebar-date" value={dtCriadoInicio}
            onChange={e => setDtCriadoInicio(e.target.value)} placeholder="De" style={{ marginBottom: 4 }} />
          <input type="date" className="form-control sidebar-date" value={dtCriadoFim}
            onChange={e => setDtCriadoFim(e.target.value)} placeholder="Até" />
        </div>
      </aside>

      {/* MAIN */}
      <main className="planos-main">
        {/* Header */}
        <div className="planos-header">
          <h1>Relação Planos de Ações</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* #1 Export CSV */}
            <button className="planos-btn-export" onClick={handleExportCSV} disabled={exporting} title="Exportar CSV">
              <Icon width={14} height={14}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Icon>
              {exporting ? 'Exportando...' : 'CSV'}
            </button>
            <button className="planos-btn-novo" onClick={() => setModalOpen(true)}>Novo +</button>
          </div>
        </div>

        {/* Summary counters / skeleton */}
        {loading ? <SkeletonSummaryBar /> : <SummaryBar items={items} />}

        {/* Search + Badges */}
        <div className="planos-toolbar">
          <div className="planos-search">
            <span style={{ fontSize: '0.9rem' }}>🔍</span>
            <input type="text" placeholder="Pesquisar ações..." value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="planos-badges">
            {STATUS_BADGES.map(b => {
              const isActive = activeBadges.includes(b.key);
              const count = items.filter(i => getRowStatus(i) === b.key).length;
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

        {/* Content */}
        {loading ? (
          view === 'kanban' ? <SkeletonKanban /> : (
            <div className="planos-table-wrapper">
              <table className="planos-table">
                <thead>
                  <tr>
                    <th className="col-action" />
                    <th className="col-center">Data Criação</th>
                    <th className="col-center">Mestre</th>
                    <th className="col-center">Unidade</th>
                    <th>Solicitante</th>
                    <th>Quem?</th>
                    <th>O quê?</th>
                    <th className="col-center">Quando?</th>
                    <th className="col-center col-progress">%</th>
                    <th className="col-center">Status</th>
                    <th className="col-action" />
                  </tr>
                </thead>
                <tbody><SkeletonTableRows rows={8} /></tbody>
              </table>
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="planos-empty">
            <span style={{ fontSize: '2.5rem' }}>📋</span>
            <p>Nenhum plano de ação encontrado</p>
          </div>
        ) : view === 'lista' ? (
          <>
            <div className="planos-table-wrapper">
              <table className="planos-table">
                <thead>
                  <tr>
                    <th className="col-action"></th>
                    <SortTh field="created_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="col-center">
                      Data Criação
                    </SortTh>
                    <th className="col-center">Mestre</th>
                    <th className="col-center">Unidade</th>
                    <th>Solicitante</th>
                    <th>Quem?</th>
                    <th>O quê?</th>
                    <SortTh field="dt_prazo" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="col-center">
                      Quando?
                    </SortTh>
                    <th className="col-center col-progress">%</th>
                    <SortTh field="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="col-center">
                      Status
                    </SortTh>
                    <th className="col-action"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const rowStatus = getRowStatus(item);
                    const cfg = STATUS_CONFIG[rowStatus] || STATUS_CONFIG.PENDENTE;
                    const isExpanded = expandedId === item.id;
                    return [
                      <tr key={item.id} style={{ '--row-bg': cfg.bg }}
                        className={`planos-row ${isExpanded ? 'planos-row-open' : ''}`}>
                        <td className="col-action">
                          <button className="edit-btn"
                            onClick={() => handleNavigate(item)} title="Editar">
                            <Icon width={13} height={13}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>
                          </button>
                        </td>
                        <td className="col-center col-nowrap">
                          {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="col-center col-nowrap col-mono">
                          {item.origem_tipo
                            ? `${item.origem_tipo}-${item.num_mestre || item.id}/${item.sequencia || 1}`
                            : `GA-${item.num_mestre || item.id}/${item.sequencia || 1}`}
                        </td>
                        <td className="col-center">
                          <span className="unidade-badge">{item.filial_nome || '—'}</span>
                        </td>
                        <td>
                          <div className="user-cell">
                            <UserAvatar name={item.criador_nome} size={32} />
                            <span className="user-name">{item.criador_nome || '—'}</span>
                          </div>
                        </td>
                        <td>
                          <div className="user-cell">
                            <UserAvatar name={item.responsavel_nome} size={32} />
                            <span className="user-name">{item.responsavel_nome || '—'}</span>
                          </div>
                        </td>
                        {/* #6 click title to expand preview */}
                        <td className="col-desc" style={{ cursor: 'pointer' }}
                          onClick={() => togglePreview(item.id)}
                          title="Clique para pré-visualizar">
                          {item.titulo || item.descricao || '—'}
                          {isExpanded
                            ? <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--accent)' }}>▲</span>
                            : <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--text-muted)' }}>▼</span>}
                        </td>
                        <td className="col-center col-nowrap">
                          {item.dt_prazo ? new Date(item.dt_prazo).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        {/* #3 Progress mini-bar */}
                        <td className="col-center col-progress">
                          {item._source === 'GAC' && item.tarefas_total > 0 ? (
                            <div className="planos-progress-mini" title={`${item.tarefas_concluidas}/${item.tarefas_total} tarefas`}>
                              <div className="planos-progress-mini-bar">
                                <div style={{ width: `${Math.round((item.tarefas_concluidas / item.tarefas_total) * 100)}%` }} />
                              </div>
                              <span>{Math.round((item.tarefas_concluidas / item.tarefas_total) * 100)}%</span>
                            </div>
                          ) : item.percentual != null && item.percentual > 0 ? (
                            <div className="planos-progress-mini" title={`${item.percentual}%`}>
                              <div className="planos-progress-mini-bar">
                                <div style={{ width: `${item.percentual}%` }} />
                              </div>
                              <span>{item.percentual}%</span>
                            </div>
                          ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>}
                        </td>
                        <td className="col-center">
                          <span className="status-label" style={{ color: cfg.color }}>{cfg.label}</span>
                        </td>
                        <td className="col-action">
                          <button className="delete-btn" title="Excluir" onClick={() => handleDelete(item)}>
                            🗑️
                          </button>
                        </td>
                      </tr>,
                      isExpanded && (
                        <RowPreview key={`preview-${item.id}`} item={item} onNavigate={handleNavigate} />
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="planos-pagination">
              <span className="pagination-info">{startIdx}–{endIdx} de {total} registros</span>
              <div className="pagination-buttons">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>&#9664;</button>
                <span className="pagination-page">Página {page} de {Math.max(1, Math.ceil(total / perPage))}</span>
                <button disabled={page >= Math.ceil(total / perPage)} onClick={() => setPage(p => p + 1)}>&#9654;</button>
              </div>
            </div>
          </>
        ) : (
          /* ======= KANBAN (#8 drag-and-drop) ======= */
          <div className="tarefas-kanban-board">
            {kanbanData.map(col => {
              const limit = getKanbanLimit(col.key);
              const visible = col.allItems.slice(0, limit);
              const hasMore = col.allItems.length > limit;
              const isDragTarget = dragOver === col.key;
              return (
                <div key={col.key} className={`tarefas-kanban-col ${isDragTarget ? 'kanban-col-drag-over' : ''}`}
                  onDragOver={e => handleDragOver(col.key, e)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => handleDrop(col.key)}>
                  <div className="tarefas-kanban-header" style={{ borderTopColor: col.color }}>
                    <span className="tarefas-kanban-title">{col.label}</span>
                    <span className="tarefas-kanban-count" style={{ background: col.color }}>
                      {col.allItems.length}
                    </span>
                  </div>
                  <div className="tarefas-kanban-body">
                    {visible.length === 0 ? (
                      <div className="tarefas-kanban-empty">Nenhum plano</div>
                    ) : visible.map(item => (
                      <KanbanCard key={item.id} item={item}
                        onDragStart={handleDragStart}
                        onClick={() => handleNavigate(item)} />
                    ))}
                    {/* #25 load more */}
                    {hasMore && (
                      <button className="kanban-load-more"
                        onClick={() => loadMoreKanban(col.key)}>
                        Ver mais ({col.allItems.length - limit} restantes)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Criar */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setForm({ titulo: '', descricao: '', dt_prazo: '', origem_tipo: '', responsavel_id: '' }); }} title="Novo Plano de Ação"
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setModalOpen(false); setForm({ titulo: '', descricao: '', dt_prazo: '', origem_tipo: '', responsavel_id: '' }); }}>Cancelar</button>
            <button className="btn-primary" onClick={handleCreate}>
              <Icon width={14} height={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>
              Criar Plano
            </button>
          </>
        }>
        <div className="novo-plano-modal">

          {/* O quê */}
          <div className="novo-plano-field">
            <label className="novo-plano-label">
              <Icon width={13} height={13}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></Icon>
              O quê? <span className="novo-plano-req">*</span>
            </label>
            <textarea className="novo-plano-input" rows={3}
              placeholder="Descreva a ação que será realizada..."
              value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              autoFocus />
          </div>

          {/* Por quê */}
          <div className="novo-plano-field">
            <label className="novo-plano-label">
              <Icon width={13} height={13}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></Icon>
              Por quê? (Motivo)
            </label>
            <textarea className="novo-plano-input" rows={2}
              placeholder="Qual é o motivo ou causa desta ação?"
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          </div>

          {/* Quem + Quando */}
          <div className="novo-plano-row">
            <div className="novo-plano-field">
              <label className="novo-plano-label">
                <Icon width={13} height={13}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>
                Quem? (Responsável)
              </label>
              <select className="novo-plano-input" value={form.responsavel_id}
                onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}>
                <option value="">Selecione...</option>
                {usuarios.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <div className="novo-plano-field">
              <label className="novo-plano-label">
                <Icon width={13} height={13}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>
                Quando? (Prazo)
              </label>
              <input type="date" className="novo-plano-input" value={form.dt_prazo}
                onChange={e => setForm(f => ({ ...f, dt_prazo: e.target.value }))} />
            </div>
          </div>

          {/* Origem */}
          <div className="novo-plano-field">
            <label className="novo-plano-label">
              <Icon width={13} height={13}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></Icon>
              Origem
            </label>
            <div className="novo-plano-origem-grid">
              {[
                { value: 'RQ03',   label: 'RNC',       desc: 'Não Conformidade', color: '#ef5350' },
                { value: 'RQ49',   label: 'NO',         desc: 'Nota de Oportunidade', color: '#ff9800' },
                { value: 'RQ80',   label: 'Auditoria', desc: 'RQ80', color: '#7e57c2' },
                { value: 'META',   label: 'Meta',      desc: 'Objetivo / Meta', color: '#26a69a' },
                { value: 'MANUAL', label: 'Manual',    desc: 'Sem origem vinculada', color: '#546e7a' },
              ].map(opt => (
                <button key={opt.value} type="button"
                  className={`novo-plano-origem-chip ${form.origem_tipo === opt.value ? 'selected' : ''}`}
                  style={{ '--chip-color': opt.color }}
                  onClick={() => setForm(f => ({ ...f, origem_tipo: f.origem_tipo === opt.value ? '' : opt.value }))}>
                  <span className="chip-label">{opt.label}</span>
                  <span className="chip-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </Modal>
    </div>
  );
}

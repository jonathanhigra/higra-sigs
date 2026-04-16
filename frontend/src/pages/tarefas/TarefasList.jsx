/**
 * Tarefas — Lista + Kanban (melhorias paridade Planos de Ação)
 * ✓ Sortable columns (sort_by + sort_dir)
 * ✓ Date range filters in sidebar (dt_previsao, dt_criado)
 * ✓ Debounce 400ms on search
 * ✓ LOV cache via lovStore (responsáveis)
 * ✓ Responsável filter select in sidebar
 * ✓ Kanban load-more per column
 * ✓ Kanban undo (5s optimistic rollback)
 * ✓ Export CSV button
 * ✓ Summary bar (Total / Abertas / Atrasadas / Concluídas)
 * ✓ Inline row preview (click title to expand)
 * ✓ Skeleton loading (table + kanban)
 * ✓ Progress mini-bar in table
 * ✓ Icon component (no emoji)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { tarefaService } from '../../services/tarefas/tarefaService';
import useLovStore from '../../stores/lovStore';
import Icon from '../../components/Icon';
import { SkeletonSummaryBar, SkeletonTableRows, SkeletonKanban } from '../../components/SkeletonPlanos';
import '../planos_acao/PlanosList.css';
import './TarefasKanban.css';

// ── Config ───────────────────────────────────────────────────────────────────

const STATUS_MAP = {
  ABERTA:       { label: 'Aberta',       color: '#3b82f6', row: 'rgba(59, 130, 246, 0.07)' },
  EM_ANDAMENTO: { label: 'Em Andamento', color: '#f59e0b', row: 'rgba(245, 158, 11, 0.07)' },
  EM_ESPERA:    { label: 'Em Espera',    color: '#8b5cf6', row: 'rgba(139, 92, 246, 0.07)' },
  CONCLUIDA:    { label: 'Concluída',    color: '#22c55e', row: 'rgba(34, 197, 94, 0.07)' },
  CANCELADA:    { label: 'Cancelada',    color: '#ef4444', row: 'rgba(239, 68, 68, 0.07)' },
};

const STATUS_BADGES = Object.entries(STATUS_MAP).map(([key, { label, color }]) => ({ key, label, bg: color }));

const KANBAN_COLS = [
  { key: 'ABERTA',       label: 'A Fazer',      color: '#3b82f6' },
  { key: 'EM_ANDAMENTO', label: 'Em Andamento', color: '#f59e0b' },
  { key: 'EM_ESPERA',    label: 'Em Espera',    color: '#8b5cf6' },
  { key: 'CONCLUIDA',    label: 'Concluído',    color: '#22c55e' },
];

const KANBAN_PAGE = 15;

const AVATAR_COLORS = ['#00A0DF','#4caf50','#ff9800','#9c27b0','#ef4444','#3f51b5','#009688','#795548','#e91e63','#607d8b'];
function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear().toString().slice(-2)}`;
}

function fmtPrazo(d) {
  if (!d) return '—';
  const now = new Date(); now.setHours(0,0,0,0);
  const dt = new Date(d + 'T00:00:00');
  const diff = Math.round((dt - now) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  if (diff > 1 && diff <= 7) return `${diff} dias`;
  if (diff < -1) return `Atrasada ${Math.abs(diff)}d`;
  return fmtDate(d);
}

function useDebounce(value, delay = 400) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(h);
  }, [value, delay]);
  return dv;
}

// ── Summary bar ──────────────────────────────────────────────────────────────

function SummaryBar({ items, total }) {
  const abertas = items.filter(t => (t._status || t.status || 'ABERTA') === 'ABERTA').length;
  const atrasadas = items.filter(t => {
    const p = t._dt_previsao || t.dt_previsao;
    const s = t._status || t.status || 'ABERTA';
    return p && new Date(p + 'T00:00:00') < new Date() && s !== 'CONCLUIDA' && s !== 'CANCELADA';
  }).length;
  const concluidas = items.filter(t => (t._status || t.status || 'ABERTA') === 'CONCLUIDA').length;

  return (
    <div className="planos-summary-bar">
      <div className="planos-summary-card">
        <span className="summary-num">{total}</span>
        <span className="summary-lbl">Total</span>
      </div>
      <div className="planos-summary-card pendentes">
        <span className="summary-num">{abertas}</span>
        <span className="summary-lbl">Abertas</span>
      </div>
      <div className="planos-summary-card vencidas">
        <span className="summary-num">{atrasadas}</span>
        <span className="summary-lbl">Atrasadas</span>
      </div>
      <div className="planos-summary-card implementadas">
        <span className="summary-num">{concluidas}</span>
        <span className="summary-lbl">Concluídas</span>
      </div>
    </div>
  );
}

// ── Inline row preview ───────────────────────────────────────────────────────

function RowPreview({ item, onNavigate }) {
  const prazo = item._dt_previsao || item.dt_previsao;
  return (
    <tr className="planos-row-preview">
      <td colSpan={9} style={{ padding: '12px 16px' }}>
        <div className="planos-preview-inner">
          <div className="planos-preview-col">
            <span className="preview-label">Título</span>
            <span className="preview-value">{item.titulo || '—'}</span>
          </div>
          <div className="planos-preview-col">
            <span className="preview-label">Descrição</span>
            <span className="preview-value">{item.descricao || '—'}</span>
          </div>
          <div className="planos-preview-col">
            <span className="preview-label">Prazo</span>
            <span className="preview-value">{prazo ? fmtDate(prazo) : '—'}</span>
          </div>
          <div className="planos-preview-col">
            <span className="preview-label">Prioridade</span>
            <span className="preview-value">{item.prioridade || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8 }}>
            <button className="planos-btn-novo" style={{ fontSize: '0.78rem', padding: '6px 14px' }}
              onClick={() => onNavigate(item)}>
              Abrir ↗
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Sortable TH ─────────────────────────────────────────────────────────────

function SortTh({ children, field, sortBy, sortDir, onSort, className }) {
  const active = sortBy === field;
  return (
    <th className={`${className || ''} col-sortable`} onClick={() => onSort(field)}
      style={{ cursor: 'pointer', userSelect: 'none' }}>
      {children}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}
    </th>
  );
}

// ── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({ item, onDragStart, onClick }) {
  const prazo = item._dt_previsao || item.dt_previsao;
  const st = item._status || item.status || 'ABERTA';
  const isAtrasada = prazo && new Date(prazo + 'T00:00:00') < new Date() && st !== 'CONCLUIDA' && st !== 'CANCELADA';
  return (
    <div className={`tarefas-kanban-card ${isAtrasada ? 'atrasada' : ''}`}
      draggable onDragStart={() => onDragStart(item)} onClick={onClick}
      title={`${item.titulo}\n${item.responsavel_nome || ''}\nPrazo: ${fmtDate(prazo)}`}>
      <div className="tarefas-kanban-card-title">{item.titulo}</div>
      {item.percentual > 0 && st !== 'CONCLUIDA' && (
        <div className="tarefas-kanban-progress">
          <div className="tarefas-kanban-progress-track">
            <div className="tarefas-kanban-progress-fill" style={{ width: `${Math.min(item.percentual, 100)}%` }} />
          </div>
          <span className="tarefas-kanban-progress-label">{item.percentual}%</span>
        </div>
      )}
      <div className="tarefas-kanban-card-footer">
        <div className="tarefas-kanban-card-meta">
          {prazo && <span className={isAtrasada ? 'overdue' : ''}>{fmtPrazo(prazo)}</span>}
          {item.prioridade && <span className={`prio-dot ${(item.prioridade || '').toLowerCase()}`} title={item.prioridade} />}
        </div>
        {item.responsavel_nome && (
          <div className="tarefas-kanban-card-avatar" style={{ background: avatarColor(item.responsavel_nome) }}
            title={item.responsavel_nome}>
            {item.responsavel_nome[0]?.toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function TarefasList() {
  const SAVED_FILTERS_KEY = 'sigs_tar_saved_filters';
  const loadSaved = () => { try { return JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY) || '[]'); } catch { return []; } };
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('lista');
  const [statusFilter, setStatusFilter] = useState('T');
  const [modoFilter, setModoFilter] = useState('todas');
  const [prioFilter, setPrioFilter] = useState('');
  const [responsavelFilter, setResponsavelFilter] = useState('');
  const [savedFilters, setSavedFilters] = useState(loadSaved);
  const [search, setSearch] = useState('');
  const [activeBadges, setActiveBadges] = useState(STATUS_BADGES.map(b => b.key));
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [dtPrazoInicio, setDtPrazoInicio] = useState('');
  const [dtPrazoFim, setDtPrazoFim] = useState('');
  const [dtCriadoInicio, setDtCriadoInicio] = useState('');
  const [dtCriadoFim, setDtCriadoFim] = useState('');
  const [dragItem, setDragItem] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [undoState, setUndoState] = useState(null);
  const [kanbanLimits, setKanbanLimits] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [batchModal, setBatchModal] = useState(null); // 'reatribuir'
  const [batchResponsavel, setBatchResponsavel] = useState('');

  const navigate = useNavigate();
  const toast = useToast();
  const { getUsuarios } = useLovStore();
  const [usuarios, setUsuarios] = useState([]);
  const perPage = view === 'kanban' ? 200 : 20;
  const debouncedSearch = useDebounce(search, 400);

  useEffect(() => { getUsuarios().then(setUsuarios); }, []);

  useEffect(() => { setPage(1); }, [
    statusFilter, modoFilter, prioFilter, responsavelFilter,
    debouncedSearch, view, sortBy, sortDir,
    dtPrazoInicio, dtPrazoFim, dtCriadoInicio, dtCriadoFim,
  ]);

  useEffect(() => { fetchData(); }, [
    page, statusFilter, modoFilter, prioFilter, responsavelFilter,
    debouncedSearch, view, sortBy, sortDir,
    dtPrazoInicio, dtPrazoFim, dtCriadoInicio, dtCriadoFim,
  ]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage, sort_by: sortBy, sort_dir: sortDir };
      if (statusFilter !== 'T') params.status = statusFilter;
      if (modoFilter === 'minhas') params.minhas = true;
      if (modoFilter === 'aprovar') params.aguardando_aprovacao = true;
      if (prioFilter) params.prioridade = prioFilter;
      if (responsavelFilter) params.responsavel_id = responsavelFilter;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (dtPrazoInicio) params.dt_previsao_inicio = dtPrazoInicio;
      if (dtPrazoFim) params.dt_previsao_fim = dtPrazoFim;
      if (dtCriadoInicio) params.dt_criado_inicio = dtCriadoInicio;
      if (dtCriadoFim) params.dt_criado_fim = dtCriadoFim;
      const { data } = await tarefaService.listar(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { toast.error('Erro ao carregar tarefas'); }
    finally { setLoading(false); }
  };

  const statusCounts = useMemo(() => {
    const c = {};
    STATUS_BADGES.forEach(b => { c[b.key] = 0; });
    items.forEach(t => { const s = t._status || t.status || 'ABERTA'; if (c[s] !== undefined) c[s]++; });
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter(t => activeBadges.includes(t._status || t.status || 'ABERTA'));
  }, [items, activeBadges]);

  const kanbanData = useMemo(() => KANBAN_COLS.map(col => ({
    ...col,
    allItems: filtered.filter(t => (t._status || t.status || 'ABERTA') === col.key),
  })), [filtered]);

  const handleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
  };

  const toggleBadge = (key) => {
    setActiveBadges(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleNavigate = (item) => navigate(`/tarefas/${item.id}`);
  const togglePreview = (id) => setExpandedId(prev => prev === id ? null : id);

  // Export CSV
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const params = {};
      if (statusFilter !== 'T') params.status = statusFilter;
      if (prioFilter) params.prioridade = prioFilter;
      if (responsavelFilter) params.responsavel_id = responsavelFilter;
      if (modoFilter === 'minhas') params.minhas = true;
      if (dtPrazoInicio) params.dt_previsao_inicio = dtPrazoInicio;
      if (dtPrazoFim) params.dt_previsao_fim = dtPrazoFim;
      const res = await tarefaService.exportarCSV(params);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = 'tarefas.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Erro ao exportar CSV'); }
    finally { setExporting(false); }
  };

  // Kanban drag + undo
  const handleDragStart = (item) => setDragItem(item);
  const handleDragOver = (colKey, e) => { e.preventDefault(); setDragOver(colKey); };
  const handleDrop = async (colKey) => {
    setDragOver(null);
    if (!dragItem) return;
    const prevStatus = dragItem._status || dragItem.status || 'ABERTA';
    if (prevStatus === colKey) { setDragItem(null); return; }
    setItems(prev => prev.map(i => i.id === dragItem.id ? { ...i, _status: colKey, status: colKey } : i));
    const moved = dragItem;
    setDragItem(null);
    try {
      await tarefaService.atualizar(moved.id, { status: colKey });
      if (undoState?.timer) clearTimeout(undoState.timer);
      const timer = setTimeout(() => { setUndoState(null); fetchData(); }, 5000);
      setUndoState({ item: moved, prevStatus, timer });
      toast.info?.(`Status → ${STATUS_MAP[colKey]?.label || colKey}`);
    } catch {
      toast.error('Erro ao mover tarefa');
      fetchData();
    }
  };

  // Kanban load-more
  const getKanbanLimit = (key) => kanbanLimits[key] || KANBAN_PAGE;
  const loadMoreKanban = (key) => setKanbanLimits(prev => ({ ...prev, [key]: (prev[key] || KANBAN_PAGE) + KANBAN_PAGE }));

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const startIdx = (page - 1) * perPage + 1;
  const endIdx = Math.min(page * perPage, total);

  const handleSaveFilter = () => {
    const name = window.prompt('Nome para este conjunto de filtros:', `Filtro ${savedFilters.length + 1}`);
    if (!name) return;
    const preset = { name, statusFilter, modoFilter, prioFilter, responsavelFilter };
    const updated = [...savedFilters.filter(f => f.name !== name), preset].slice(-5);
    setSavedFilters(updated);
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(updated));
    toast.success(`Filtro "${name}" salvo`);
  };
  const handleApplyFilter = (preset) => {
    setStatusFilter(preset.statusFilter || 'T');
    setModoFilter(preset.modoFilter || 'todas');
    setPrioFilter(preset.prioFilter || '');
    setResponsavelFilter(preset.responsavelFilter || '');
    setPage(1);
  };
  const handleDeleteFilter = (name) => {
    const updated = savedFilters.filter(f => f.name !== name);
    setSavedFilters(updated);
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(updated));
  };

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleBatchConcluir = async () => {
    if (!selectedIds.size) return;
    try {
      const { data } = await tarefaService.batch({ ids: [...selectedIds], action: 'concluir' });
      toast.success(`${data.affected} tarefa(s) concluída(s)`);
      setSelectedIds(new Set());
      fetchData();
    } catch { toast.error('Erro ao concluir tarefas'); }
  };

  const handleBatchReatribuir = async () => {
    if (!batchResponsavel) { toast.error('Selecione um responsável'); return; }
    try {
      const { data } = await tarefaService.batch({ ids: [...selectedIds], action: 'reatribuir', responsavel_id: Number(batchResponsavel) });
      toast.success(`${data.affected} tarefa(s) reatribuída(s)`);
      setSelectedIds(new Set());
      setBatchModal(null);
      setBatchResponsavel('');
      fetchData();
    } catch { toast.error('Erro ao reatribuir tarefas'); }
  };

  return (
    <div className="planos-container">
      {/* ── Sidebar ── */}
      <aside className="planos-sidebar">
        {/* View toggle */}
        <div className="sidebar-section">
          <div className="sidebar-label">Visualização</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setView('lista'); setPage(1); }}
              style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: '1px solid var(--border-primary)', background: view === 'lista' ? 'var(--accent)' : 'transparent', color: view === 'lista' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 600 }}>
              <Icon width={13} height={13}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></Icon>
              Tabela
            </button>
            <button onClick={() => { setView('kanban'); setPage(1); }}
              style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: '1px solid var(--border-primary)', background: view === 'kanban' ? 'var(--accent)' : 'transparent', color: view === 'kanban' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 600 }}>
              <Icon width={13} height={13}><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="10" rx="1"/></Icon>
              Kanban
            </button>
          </div>
        </div>
        <div className="sidebar-divider" />

        {/* Filtro modo */}
        <div className="sidebar-section">
          <div className="sidebar-label">Filtro</div>
          {[
            { value: 'todas',   label: 'Todas as Tarefas' },
            { value: 'minhas',  label: 'Minhas Tarefas' },
            { value: 'aprovar', label: 'Preciso Aprovar' },
          ].map(opt => (
            <label key={opt.value} className={`sidebar-radio ${modoFilter === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${modoFilter === opt.value ? 'checked' : ''}`} />
              <span onClick={() => { setModoFilter(opt.value); setPage(1); }}>{opt.label}</span>
            </label>
          ))}
        </div>
        <div className="sidebar-divider" />

        {/* Status */}
        <div className="sidebar-section">
          <div className="sidebar-label">Status</div>
          {[{ value: 'T', label: 'Todos' }, ...STATUS_BADGES.map(b => ({ value: b.key, label: b.label }))].map(opt => (
            <label key={opt.value} className={`sidebar-radio ${statusFilter === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${statusFilter === opt.value ? 'checked' : ''}`} />
              <span onClick={() => { setStatusFilter(opt.value); setPage(1); }}>{opt.label}</span>
            </label>
          ))}
        </div>
        <div className="sidebar-divider" />

        {/* Prioridade */}
        <div className="sidebar-section">
          <label className="sidebar-label">Prioridade</label>
          <select className="form-control sidebar-select" value={prioFilter}
            onChange={e => setPrioFilter(e.target.value)}>
            <option value="">Todas</option>
            <option value="URGENTE">Urgente</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Média</option>
            <option value="BAIXA">Baixa</option>
          </select>
        </div>
        <div className="sidebar-divider" />

        {/* Responsável */}
        <div className="sidebar-section">
          <label className="sidebar-label">Responsável</label>
          <select className="form-control sidebar-select" value={responsavelFilter}
            onChange={e => setResponsavelFilter(e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
        <div className="sidebar-divider" />

        {/* Prazo range */}
        <div className="sidebar-section">
          <label className="sidebar-label" style={{ marginBottom: 6 }}>
            Prazo
            {(dtPrazoInicio || dtPrazoFim) && (
              <button onClick={() => { setDtPrazoInicio(''); setDtPrazoFim(''); }}
                style={{ marginLeft: 6, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.7rem' }}>limpar</button>
            )}
          </label>
          <input type="date" className="form-control sidebar-date" value={dtPrazoInicio}
            onChange={e => setDtPrazoInicio(e.target.value)} style={{ marginBottom: 4 }} />
          <input type="date" className="form-control sidebar-date" value={dtPrazoFim}
            onChange={e => setDtPrazoFim(e.target.value)} />
        </div>
        <div className="sidebar-divider" />

        {/* Criado em range */}
        <div className="sidebar-section">
          <label className="sidebar-label" style={{ marginBottom: 6 }}>
            Criado em
            {(dtCriadoInicio || dtCriadoFim) && (
              <button onClick={() => { setDtCriadoInicio(''); setDtCriadoFim(''); }}
                style={{ marginLeft: 6, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.7rem' }}>limpar</button>
            )}
          </label>
          <input type="date" className="form-control sidebar-date" value={dtCriadoInicio}
            onChange={e => setDtCriadoInicio(e.target.value)} style={{ marginBottom: 4 }} />
          <input type="date" className="form-control sidebar-date" value={dtCriadoFim}
            onChange={e => setDtCriadoFim(e.target.value)} />
        </div>
        <div className="sidebar-divider" />

        {/* Filtros salvos */}
        <div className="sidebar-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="sidebar-label" style={{ marginBottom: 0 }}>Filtros favoritos</span>
            <button onClick={handleSaveFilter} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.7rem', cursor: 'pointer', padding: 0 }}>+ Salvar</button>
          </div>
          {savedFilters.length === 0
            ? <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Nenhum salvo ainda</span>
            : savedFilters.map(f => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <button onClick={() => handleApplyFilter(f)} style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</button>
                <button onClick={() => handleDeleteFilter(f.name)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px', fontSize: '0.7rem' }} title={`Remover filtro ${f.name}`} aria-label={`Remover filtro ${f.name}`}>✕</button>
              </div>
            ))
          }
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="planos-main">
        {/* Header */}
        <div className="planos-header">
          <h1>Tarefas</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="planos-btn-export" onClick={handleExportCSV} disabled={exporting} title="Exportar CSV">
              <Icon width={14} height={14}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Icon>
              {exporting ? 'Exportando...' : 'CSV'}
            </button>
            <button className="planos-btn-novo" onClick={() => navigate('/tarefas/nova')}>
              <Icon width={14} height={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>
              Nova Tarefa
            </button>
          </div>
        </div>

        {/* Summary bar */}
        {loading ? <SkeletonSummaryBar /> : <SummaryBar items={items} total={total} />}

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="tar-bulk-bar">
            <span className="tar-bulk-count">{selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}</span>
            <button className="tar-bulk-btn tar-bulk-concluir" onClick={handleBatchConcluir}>✓ Concluir</button>
            <button className="tar-bulk-btn tar-bulk-reatribuir" onClick={() => { setBatchModal('reatribuir'); setBatchResponsavel(''); }}>↗ Reatribuir</button>
            <button className="tar-bulk-btn tar-bulk-clear" onClick={() => setSelectedIds(new Set())}>✕ Desmarcar</button>
          </div>
        )}

        {/* Toolbar */}
        <div className="planos-toolbar">
          <div className="planos-search">
            <Icon width={15} height={15}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>
            <input placeholder="Pesquisar tarefas..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="planos-badges">
            {STATUS_BADGES.map(b => {
              const isActive = activeBadges.includes(b.key);
              return (
                <button key={b.key} className={`planos-badge ${isActive ? 'active' : 'inactive'}`}
                  style={{ '--badge-bg': b.bg }} onClick={() => toggleBadge(b.key)}>
                  <span className="badge-check">{isActive ? '✓' : ''}</span>
                  <span className="badge-label">{b.label}</span>
                  <span className="badge-count">{statusCounts[b.key] || 0}</span>
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
                    <th>Título</th>
                    <th>Status</th>
                    <th>Prioridade</th>
                    <th>Responsável</th>
                    <th className="col-center">Prazo</th>
                    <th className="col-center">Tempo Est./Gasto</th>
                    <th className="col-center col-progress">%</th>
                    <th className="col-action" />
                  </tr>
                </thead>
                <tbody><SkeletonTableRows rows={8} /></tbody>
              </table>
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="planos-empty" style={{ padding: '60px 20px' }}>
            <Icon width={52} height={52} style={{ color: 'var(--text-muted)', strokeWidth: 1 }}>
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </Icon>
            <p style={{ fontSize: '1rem', margin: '12px 0 4px' }}>Nenhuma tarefa encontrada</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Crie uma nova tarefa para começar</p>
            <button className="planos-btn-novo" style={{ marginTop: 12 }} onClick={() => navigate('/tarefas/nova')}>+ Nova Tarefa</button>
          </div>
        ) : view === 'lista' ? (
          <>
            <div className="planos-table-wrapper">
              <table className="planos-table">
                <thead>
                  <tr>
                    <th className="col-check">
                      <input type="checkbox"
                        checked={filtered.length > 0 && filtered.every(t => selectedIds.has(t.id))}
                        onChange={e => {
                          if (e.target.checked) setSelectedIds(new Set(filtered.map(t => t.id)));
                          else setSelectedIds(new Set());
                        }}
                        title="Selecionar todos"
                      />
                    </th>
                    <th className="col-action" />
                    <SortTh field="titulo" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}>Título</SortTh>
                    <SortTh field="status" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}>Status</SortTh>
                    <SortTh field="prioridade" sortBy={sortBy} sortDir={sortDir} onSort={handleSort}>Prioridade</SortTh>
                    <th>Responsável</th>
                    <SortTh field="dt_previsao" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="col-center">Prazo</SortTh>
                    <th className="col-center" style={{ fontSize: '0.75rem' }}>Est./Gasto</th>
                    <th className="col-center col-progress">%</th>
                    <th className="col-action" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => {
                    const st = t._status || t.status || 'ABERTA';
                    const stCfg = STATUS_MAP[st] || STATUS_MAP.ABERTA;
                    const prazo = t._dt_previsao || t.dt_previsao;
                    const isAtrasada = prazo && new Date(prazo + 'T00:00:00') < new Date() && st !== 'CONCLUIDA' && st !== 'CANCELADA';
                    const isExpanded = expandedId === t.id;
                    return [
                      <tr key={t.id} className={`planos-row ${isExpanded ? 'planos-row-open' : ''}${selectedIds.has(t.id) ? ' planos-row-selected' : ''}`}
                        style={{ '--row-bg': stCfg.row, borderLeft: `3px solid ${t.prioridade === 'URGENTE' ? '#ef4444' : t.prioridade === 'ALTA' ? '#f59e0b' : t.prioridade === 'MEDIA' ? '#eab308' : t.prioridade === 'BAIXA' ? '#22c55e' : 'transparent'}` }}>
                        <td className="col-check" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)} />
                        </td>
                        <td className="col-action">
                          <button className="edit-btn" onClick={() => handleNavigate(t)} title="Editar">
                            <Icon width={12} height={12}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>
                          </button>
                        </td>
                        {/* click title to preview */}
                        <td className="col-desc" style={{ fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => togglePreview(t.id)} title="Clique para pré-visualizar">
                          {t.titulo || '—'}
                          <span style={{ marginLeft: 6, fontSize: '0.65rem', color: 'var(--text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
                        </td>
                        <td>
                          <span className="status-label" style={{ color: isAtrasada ? '#ef4444' : stCfg.color }}>
                            {isAtrasada ? 'ATRASADA' : stCfg.label}
                          </span>
                        </td>
                        <td>
                          {t.prioridade && <span className={`prioridade-badge ${(t.prioridade || '').toLowerCase()}`}>{t.prioridade}</span>}
                        </td>
                        <td>
                          <div className="user-cell">
                            {t.responsavel_nome && (
                              <div className="user-avatar" style={{ background: avatarColor(t.responsavel_nome) }}>
                                {t.responsavel_nome[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="user-name">{t.responsavel_nome || '—'}</span>
                          </div>
                        </td>
                        <td className="col-center" style={{ color: isAtrasada ? '#ef4444' : undefined, fontWeight: isAtrasada ? 700 : undefined, fontSize: '0.75rem' }}>
                          {fmtPrazo(prazo)}
                        </td>
                        {/* Tempo estimado vs gasto */}
                        <td className="col-center" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                          {(() => {
                            const est = t.tempo_estimado;
                            const gasto = t.tempo_gasto || 0;
                            if (!est && !gasto) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
                            const fmtMin = (m) => {
                              const h = Math.floor(m / 60);
                              const min = m % 60;
                              return h > 0 ? `${h}h${String(min).padStart(2,'0')}m` : `${min}m`;
                            };
                            const excedido = est && gasto > est;
                            return (
                              <span title={`Estimado: ${est ? fmtMin(est) : '—'} / Gasto: ${fmtMin(gasto)}`}
                                style={{ color: excedido ? '#ef4444' : gasto > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                {est ? fmtMin(est) : '?'}
                                {' / '}
                                {gasto > 0 ? fmtMin(gasto) : '0m'}
                              </span>
                            );
                          })()}
                        </td>
                        {/* Progress mini-bar */}
                        <td className="col-center col-progress">
                          {t.percentual > 0 ? (
                            <div className="planos-progress-mini">
                              <div className="planos-progress-mini-bar">
                                <div style={{ width: `${Math.min(t.percentual, 100)}%` }} />
                              </div>
                              <span>{t.percentual}%</span>
                            </div>
                          ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>}
                        </td>
                        <td className="col-action">
                          <button className="delete-btn" title="Excluir" onClick={async e => {
                            e.stopPropagation();
                            if (!window.confirm('Excluir esta tarefa?')) return;
                            try { await tarefaService.excluir(t.id); toast.success('Excluída'); fetchData(); }
                            catch { toast.error('Erro ao excluir'); }
                          }}>
                            <Icon width={12} height={12}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></Icon>
                          </button>
                        </td>
                      </tr>,
                      isExpanded && <RowPreview key={`preview-${t.id}`} item={t} onNavigate={handleNavigate} />,
                    ];
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="planos-pagination">
                <span className="pagination-info">{startIdx}–{endIdx} de {total} registros</span>
                <div className="pagination-buttons">
                  <button disabled={page <= 1} onClick={() => setPage(1)}>«</button>
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
                  <span className="pagination-page">{page} / {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                  <button disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── Kanban ── */
          <div className="tarefas-kanban-board">
            {kanbanData.map(col => {
              const limit = getKanbanLimit(col.key);
              const visible = col.allItems.slice(0, limit);
              const hasMore = col.allItems.length > limit;
              return (
                <div key={col.key}
                  className={`tarefas-kanban-col ${dragOver === col.key ? 'drag-over kanban-col-drag-over' : ''}`}
                  onDragOver={e => handleDragOver(col.key, e)}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => handleDrop(col.key)}>
                  <div className="tarefas-kanban-header" style={{ borderTopColor: col.color }}>
                    <span className="tarefas-kanban-title">{col.label}</span>
                    <span className="tarefas-kanban-count" style={{ background: col.color }}>{col.allItems.length}</span>
                  </div>
                  <div className="tarefas-kanban-body">
                    {visible.length === 0
                      ? <div className="tarefas-kanban-empty">Nenhuma tarefa</div>
                      : visible.map(t => (
                          <KanbanCard key={t.id} item={t}
                            onDragStart={handleDragStart}
                            onClick={() => handleNavigate(t)} />
                        ))}
                    {hasMore && (
                      <button className="kanban-load-more" onClick={() => loadMoreKanban(col.key)}>
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

      {/* Reatribuir modal */}
      {batchModal === 'reatribuir' && (
        <div className="tar-bulk-overlay" onClick={() => setBatchModal(null)}>
          <div className="tar-bulk-modal" onClick={e => e.stopPropagation()}>
            <div className="tar-bulk-modal-title">Reatribuir {selectedIds.size} tarefa{selectedIds.size !== 1 ? 's' : ''}</div>
            <select
              className="form-control"
              value={batchResponsavel}
              onChange={e => setBatchResponsavel(e.target.value)}
              autoFocus
            >
              <option value="">Selecione o responsável...</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <div className="tar-bulk-modal-actions">
              <button className="btn-secondary" onClick={() => setBatchModal(null)}>Cancelar</button>
              <button className="btn-primary" onClick={handleBatchReatribuir}>Reatribuir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

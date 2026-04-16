/**
 * Reuniões — Lista + Agenda semanal
 * Padrão PlanosList: sidebar + summary bar + view toggle (tabela | agenda)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { agendaService } from '../../services/reunioes/agendaService';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { SkeletonReunioesList, SkeletonAgendaView, SkeletonSummaryBar } from '../../components/SkeletonPlanos';
import '../../components/Modal.css';
import './ReunioesList.css';

// ── helpers ──────────────────────────────────────────────────────────────────

function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toYMD(date) {
  return date.toISOString().split('T')[0];
}

function fmtDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function fmtTime(val) {
  if (!val) return '';
  return String(val).substring(0, 5);
}

const STATUS_MAP = {
  AGENDADA:    { label: 'Agendada',    color: '#3b82f6' },
  EM_ANDAMENTO:{ label: 'Em Andamento',color: '#f59e0b' },
  ENCERRADA:   { label: 'Encerrada',  color: '#22c55e' },
  CANCELADA:   { label: 'Cancelada',  color: '#ef4444' },
};

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// ── SummaryBar ────────────────────────────────────────────────────────────────

function SummaryBar({ items }) {
  const counts = useMemo(() => {
    const c = { AGENDADA: 0, EM_ANDAMENTO: 0, ENCERRADA: 0, CANCELADA: 0 };
    items.forEach(r => {
      const st = (r._status || r.status || 'AGENDADA').toUpperCase();
      if (st in c) c[st]++;
    });
    return c;
  }, [items]);

  return (
    <div className="reu-summary-bar">
      {[
        { key: 'total',        label: 'Total',         value: items.length,        color: 'var(--accent)' },
        { key: 'AGENDADA',     label: 'Agendadas',     value: counts.AGENDADA,     color: '#3b82f6' },
        { key: 'EM_ANDAMENTO', label: 'Em Andamento',  value: counts.EM_ANDAMENTO, color: '#f59e0b' },
        { key: 'ENCERRADA',    label: 'Encerradas',    value: counts.ENCERRADA,    color: '#22c55e' },
        { key: 'CANCELADA',    label: 'Canceladas',    value: counts.CANCELADA,    color: '#ef4444' },
      ].map(s => (
        <div key={s.key} className="reu-summary-card">
          <span className="reu-summary-value" style={{ color: s.color }}>{s.value}</span>
          <span className="reu-summary-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── AgendaView ────────────────────────────────────────────────────────────────

function AgendaView({ items, weekStart, onNavigate, onOpenReuniao }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Group items by date string (YYYY-MM-DD)
  const byDay = useMemo(() => {
    const map = {};
    items.forEach(r => {
      const dt = r._dt_agenda || r.dt_agenda;
      if (!dt) return;
      const key = typeof dt === 'string' ? dt.substring(0, 10) : toYMD(new Date(dt));
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    // Sort each day's meetings by start time
    Object.values(map).forEach(arr =>
      arr.sort((a, b) => {
        const ta = (a._hr_inicio || a.hr_inicio || '00:00');
        const tb = (b._hr_inicio || b.hr_inicio || '00:00');
        return ta.localeCompare(tb);
      })
    );
    return map;
  }, [items]);

  const weekRange = `${days[0].toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} — ${days[6].toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  return (
    <div className="reu-agenda-wrap">
      {/* Week navigation */}
      <div className="reu-agenda-nav">
        <button className="reu-agenda-nav-btn" onClick={() => onNavigate(-7)} title="Semana anterior">
          <Icon width={16} height={16}><polyline points="15 18 9 12 15 6"/></Icon>
        </button>
        <span className="reu-agenda-nav-label">{weekRange}</span>
        <button className="reu-agenda-nav-btn" onClick={() => onNavigate(7)} title="Próxima semana">
          <Icon width={16} height={16}><polyline points="9 18 15 12 9 6"/></Icon>
        </button>
        <button className="reu-agenda-today-btn" onClick={() => onNavigate(null)} title="Semana atual">
          Hoje
        </button>
      </div>

      {/* Grid */}
      <div className="reu-agenda-grid">
        {days.map((day, i) => {
          const key = toYMD(day);
          const dayItems = byDay[key] || [];
          const isToday = day.getTime() === today.getTime();
          return (
            <div key={key} className={`reu-agenda-day${isToday ? ' today' : ''}`}>
              <div className="reu-agenda-day-header">
                <span className="reu-agenda-day-name">{WEEK_DAYS[i]}</span>
                <span className={`reu-agenda-day-num${isToday ? ' today' : ''}`}>
                  {day.getDate()}
                </span>
              </div>
              <div className="reu-agenda-day-body">
                {dayItems.length === 0
                  ? <div className="reu-agenda-empty">—</div>
                  : dayItems.map(r => {
                      const st = (r._status || r.status || 'AGENDADA').toUpperCase();
                      const color = STATUS_MAP[st]?.color || '#3b82f6';
                      const hrIni = fmtTime(r._hr_inicio || r.hr_inicio);
                      const hrFim = fmtTime(r._hr_fim || r.hr_fim);
                      return (
                        <div
                          key={r.id}
                          className="reu-agenda-card"
                          style={{ borderLeftColor: color }}
                          onClick={() => onOpenReuniao(r.id)}
                          title={r._titulo || r.titulo || r.descricao || ''}
                        >
                          {(hrIni || hrFim) && (
                            <span className="reu-agenda-card-time">
                              {hrIni}{hrFim ? ` — ${hrFim}` : ''}
                            </span>
                          )}
                          <span className="reu-agenda-card-title">
                            {r._titulo || r.titulo || r.descricao || '—'}
                          </span>
                          {r.tipo_descricao && (
                            <span className="reu-agenda-card-tipo" style={{ background: color + '22', color }}>
                              {r.tipo_descricao}
                            </span>
                          )}
                          {r.local && (
                            <span className="reu-agenda-card-local">
                              <Icon width={10} height={10}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></Icon>
                              {r.local}
                            </span>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <span className="reu-agenda-card-status" style={{ color }}>
                              {STATUS_MAP[st]?.label}
                            </span>
                            {r.qtd_acoes > 0 && (
                              <span className="reu-acoes-badge" title={`${r.qtd_acoes} tarefa(s) gerada(s)`}>
                                {r.qtd_acoes} {r.qtd_acoes === 1 ? 'tarefa' : 'tarefas'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CalendarioView ────────────────────────────────────────────────────────────

const CAL_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function CalendarioView({ items, year, month, onNavigate, onOpenReuniao }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const firstDay = new Date(year, month, 1);

  // Monday-first offset: JS Sunday=0 → offset 6; Monday=1 → offset 0; etc.
  const startOffset = (firstDay.getDay() + 6) % 7;

  const cells = Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 + (i - startOffset)));

  const byDay = useMemo(() => {
    const map = {};
    items.forEach(r => {
      const dt = r._dt_agenda || r.dt_agenda;
      if (!dt) return;
      const key = typeof dt === 'string' ? dt.substring(0, 10) : toYMD(new Date(dt));
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    Object.values(map).forEach(arr =>
      arr.sort((a, b) => (a._hr_inicio || a.hr_inicio || '').localeCompare(b._hr_inicio || b.hr_inicio || ''))
    );
    return map;
  }, [items]);

  const monthLabel = firstDay.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="reu-cal-wrap">
      <div className="reu-agenda-nav">
        <button className="reu-agenda-nav-btn" onClick={() => onNavigate(-1)} title="Mês anterior">
          <Icon width={16} height={16}><polyline points="15 18 9 12 15 6"/></Icon>
        </button>
        <span className="reu-agenda-nav-label" style={{ textTransform: 'capitalize' }}>{monthLabel}</span>
        <button className="reu-agenda-nav-btn" onClick={() => onNavigate(1)} title="Próximo mês">
          <Icon width={16} height={16}><polyline points="9 18 15 12 9 6"/></Icon>
        </button>
        <button className="reu-agenda-today-btn" onClick={() => onNavigate(null)}>Hoje</button>
      </div>

      <div className="reu-cal-grid">
        {CAL_DAYS.map(d => (
          <div key={d} className="reu-cal-head">{d}</div>
        ))}
        {cells.map((date, i) => {
          const inMonth = date.getMonth() === month;
          const isToday = date.getTime() === today.getTime();
          const key = toYMD(date);
          const dayItems = byDay[key] || [];
          const MAX_CHIPS = 3;
          const extra = dayItems.length - MAX_CHIPS;
          return (
            <div
              key={i}
              className={`reu-cal-cell${inMonth ? '' : ' reu-cal-cell-out'}${isToday ? ' reu-cal-cell-today' : ''}`}
            >
              <div className={`reu-cal-day-num${isToday ? ' today' : ''}`}>{date.getDate()}</div>
              {dayItems.slice(0, MAX_CHIPS).map(r => {
                const st = (r._status || r.status || 'AGENDADA').toUpperCase();
                const color = STATUS_MAP[st]?.color || '#3b82f6';
                const title = r._titulo || r.titulo || r.descricao || '—';
                const hrIni = fmtTime(r._hr_inicio || r.hr_inicio);
                return (
                  <div
                    key={r.id}
                    className="reu-cal-chip"
                    style={{ background: color + '22', borderLeft: `3px solid ${color}`, color }}
                    onClick={() => onOpenReuniao(r.id)}
                    title={`${hrIni ? hrIni + ' · ' : ''}${title}`}
                  >
                    {hrIni && <span className="reu-cal-chip-time">{hrIni}</span>}
                    <span className="reu-cal-chip-title">{title}</span>
                  </div>
                );
              })}
              {extra > 0 && <div className="reu-cal-chip-more">+{extra} mais</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── ReunioesList ──────────────────────────────────────────────────────────────

export default function ReunioesList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filtroModo, setFiltroModo] = useState('todas');
  const [statusAtivos, setStatusAtivos] = useState({ AGENDADA: true, EM_ANDAMENTO: true, ENCERRADA: true, CANCELADA: false });
  const [busca, setBusca] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [tipos, setTipos] = useState([]);
  const [view, setView] = useState('tabela');
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ descricao: '', dt_agenda: '', hr_inicio: '', hr_fim: '', local: '', sth_reu_tipo_id: '' });

  const navigate = useNavigate();
  const toast = useToast();
  const perPage = 20;
  const debouncedBusca = useDebounce(busca);

  // Load tipos once
  useEffect(() => {
    agendaService.tipos().then(r => setTipos(r.data.items || [])).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let params = { per_page: perPage };
      if (view === 'agenda') {
        params.dt_inicio = toYMD(weekStart);
        params.dt_fim    = toYMD(addDays(weekStart, 6));
        params.per_page  = 100;
      } else if (view === 'calendario') {
        params.dt_inicio = toYMD(new Date(calendarMonth.year, calendarMonth.month, 1));
        params.dt_fim    = toYMD(new Date(calendarMonth.year, calendarMonth.month + 1, 0));
        params.per_page  = 300;
      } else {
        params.page = page;
      }
      if (tipoFilter)             params.tipo_id = tipoFilter;
      if (debouncedBusca)         params.busca   = debouncedBusca;
      if (filtroModo === 'minhas') params.minhas  = true;
      const { data } = await agendaService.listar(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { toast.error('Erro ao carregar reuniões'); }
    finally { setLoading(false); }
  }, [page, view, weekStart, calendarMonth, tipoFilter, debouncedBusca, filtroModo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleStatus = (key) => setStatusAtivos(prev => ({ ...prev, [key]: !prev[key] }));

  const statusCounts = useMemo(() => {
    const c = { AGENDADA: 0, EM_ANDAMENTO: 0, ENCERRADA: 0, CANCELADA: 0 };
    items.forEach(r => {
      const st = (r._status || r.status || 'AGENDADA').toUpperCase();
      if (st in c) c[st]++;
    });
    return c;
  }, [items]);

  const filteredItems = useMemo(() => {
    const active = Object.entries(statusAtivos).filter(([, v]) => v).map(([k]) => k);
    let result = items;
    if (active.length < Object.keys(STATUS_MAP).length) {
      result = result.filter(r => {
        const st = (r._status || r.status || 'AGENDADA').toUpperCase();
        return active.includes(st);
      });
    }
    return result;
  }, [items, statusAtivos]);

  const handleWeekNavigate = (delta) => {
    if (delta === null) {
      setWeekStart(getMonday(new Date()));
    } else {
      setWeekStart(prev => addDays(prev, delta));
    }
  };

  const handleCalendarNavigate = (delta) => {
    if (delta === null) {
      const d = new Date();
      setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });
    } else {
      setCalendarMonth(prev => {
        let m = prev.month + delta;
        let y = prev.year;
        if (m < 0)  { m = 11; y--; }
        if (m > 11) { m = 0;  y++; }
        return { year: y, month: m };
      });
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const params = {};
      if (tipoFilter) params.tipo_id = tipoFilter;
      if (debouncedBusca) params.busca = debouncedBusca;
      const { data } = await agendaService.exportarCSV(params);
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = 'reunioes.csv'; a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exportado');
    } catch { toast.error('Erro ao exportar'); }
    finally { setExporting(false); }
  };

  const handleCreate = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    if (!form.dt_agenda) { toast.error('Data da reunião obrigatória'); return; }
    if (!form.hr_inicio) { toast.error('Horário de início obrigatório'); return; }
    try {
      const payload = { ...form, titulo: form.descricao.substring(0, 200) };
      if (!payload.sth_reu_tipo_id) delete payload.sth_reu_tipo_id;
      const res = await agendaService.criar(payload);
      toast.success('Reunião criada');
      setModalOpen(false);
      setForm({ descricao: '', dt_agenda: '', hr_inicio: '', hr_fim: '', local: '', sth_reu_tipo_id: '' });
      navigate(`/reunioes/${res.data.id}`);
    } catch { toast.error('Erro ao criar'); }
  };

  const getRowClass = (item) => {
    const st = (item._status || item.status || '').toUpperCase();
    if (st === 'ENCERRADA')   return 'reunioes-row row-encerrada';
    if (st === 'CANCELADA')   return 'reunioes-row row-cancelada';
    if (st === 'AGENDADA')    return 'reunioes-row row-agendada';
    if (st === 'EM_ANDAMENTO') return 'reunioes-row row-andamento';
    return 'reunioes-row';
  };

  const getDatetime = (item, which) => {
    if (which === 'inicio') {
      const dt = item._dt_agenda || (item.dt_hr_inicio ? item.dt_hr_inicio.split('T')[0] : null);
      const tm = item._hr_inicio || (item.dt_hr_inicio ? item.dt_hr_inicio.split('T')[1]?.substring(0, 5) : null);
      return { date: fmtDate(dt), time: fmtTime(tm) };
    }
    const dt = item._dt_agenda || (item.dt_hr_termino ? item.dt_hr_termino.split('T')[0] : null);
    const tm = item._hr_fim || (item.dt_hr_termino ? item.dt_hr_termino.split('T')[1]?.substring(0, 5) : null);
    return { date: fmtDate(dt), time: fmtTime(tm) };
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="reunioes-container">

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <div className="reunioes-sidebar">
        <div className="sidebar-section">
          <div className="sidebar-label">Filtro</div>
          {['todas', 'minhas'].map(mode => (
            <div
              key={mode}
              className={`sidebar-radio ${filtroModo === mode ? 'active' : ''}`}
              onClick={() => setFiltroModo(mode)}
            >
              <span className={`radio-dot ${filtroModo === mode ? 'checked' : ''}`} />
              {mode === 'todas' ? 'Todas' : 'Minhas Reuniões'}
            </div>
          ))}
        </div>

        {tipos.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-label">Tipo</div>
            <select
              className="sidebar-select"
              value={tipoFilter}
              onChange={e => { setTipoFilter(e.target.value); setPage(1); }}
            >
              <option value="">Todos</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <div className="reunioes-main">

        {/* Header */}
        <div className="reunioes-header">
          <h1>Relação ATA de Reuniões</h1>
          <div className="reunioes-header-actions">
            <button
              className="reu-btn-export"
              onClick={handleExportCSV}
              disabled={exporting}
              title="Exportar CSV"
            >
              <Icon width={15} height={15}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Icon>
              {exporting ? '...' : 'CSV'}
            </button>
            <button className="reu-btn-novo" onClick={() => setModalOpen(true)}>
              <Icon width={15} height={15}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>
              Nova
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="reunioes-toolbar">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div className="reunioes-search">
              <Icon width={15} height={15}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>
              <input
                placeholder="Pesquisar reuniões..."
                value={busca}
                onChange={e => { setBusca(e.target.value); setPage(1); }}
              />
            </div>

            {/* View toggle */}
            <div className="reu-view-toggle">
              <button
                className={view === 'tabela' ? 'active' : ''}
                onClick={() => setView('tabela')}
                title="Tabela"
              >
                <Icon width={15} height={15}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></Icon>
                Tabela
              </button>
              <button
                className={view === 'agenda' ? 'active' : ''}
                onClick={() => setView('agenda')}
                title="Agenda"
              >
                <Icon width={15} height={15}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>
                Agenda
              </button>
              <button
                className={view === 'calendario' ? 'active' : ''}
                onClick={() => setView('calendario')}
                title="Calendário mensal"
              >
                <Icon width={15} height={15}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="16" y1="14" x2="16" y2="14"/></Icon>
                Calendário
              </button>
            </div>
          </div>

          {/* Status badges (table view only) */}
          {view === 'tabela' && (
            <div className="planos-badges">
              {Object.entries(STATUS_MAP).map(([key, { label, color }]) => (
                <button
                  key={key}
                  className={`planos-badge ${statusAtivos[key] ? 'active' : 'inactive'}`}
                  style={{ '--badge-bg': color }}
                  onClick={() => toggleStatus(key)}
                >
                  <span className="badge-check">{statusAtivos[key] ? '✓' : ''}</span>
                  {label}
                  <span className="badge-count">{statusCounts[key] || 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Summary bar */}
        {loading ? <SkeletonSummaryBar /> : <SummaryBar items={items} />}

        {/* ── Content ──────────────────────────────────────────────── */}
        {loading ? (
          (view === 'agenda' || view === 'calendario') ? (
            <SkeletonAgendaView />
          ) : (
            <div className="reunioes-table-wrapper">
              <table className="reunioes-table">
                <thead><tr>
                  <th className="col-action"></th>
                  <th>Categoria</th><th>Descrição</th><th>Local</th>
                  <th className="col-center">Início</th><th className="col-center">Fim</th>
                </tr></thead>
                <tbody><SkeletonReunioesList rows={8} /></tbody>
              </table>
            </div>
          )
        ) : view === 'agenda' ? (
          <AgendaView
            items={filteredItems}
            weekStart={weekStart}
            onNavigate={handleWeekNavigate}
            onOpenReuniao={id => navigate(`/reunioes/${id}`)}
          />
        ) : view === 'calendario' ? (
          <CalendarioView
            items={filteredItems}
            year={calendarMonth.year}
            month={calendarMonth.month}
            onNavigate={handleCalendarNavigate}
            onOpenReuniao={id => navigate(`/reunioes/${id}`)}
          />
        ) : filteredItems.length === 0 ? (
          <div className="reunioes-empty">Nenhuma reunião encontrada</div>
        ) : (
          <div className="reunioes-table-wrapper">
            <table className="reunioes-table">
              <thead>
                <tr>
                  <th className="col-action"></th>
                  <th>Categoria</th>
                  <th>Descrição</th>
                  <th>Local</th>
                  <th className="col-center">Início</th>
                  <th className="col-center">Fim</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(r => {
                  const ini = getDatetime(r, 'inicio');
                  const fim = getDatetime(r, 'fim');
                  const st  = (r._status || r.status || 'AGENDADA').toUpperCase();
                  const statusInfo = STATUS_MAP[st] || STATUS_MAP.AGENDADA;
                  return (
                    <tr key={r.id} className={getRowClass(r)} onClick={() => navigate(`/reunioes/${r.id}`)} style={{ cursor: 'pointer' }}>
                      <td className="reu-col-edit" onClick={e => { e.stopPropagation(); navigate(`/reunioes/${r.id}`); }}>
                        <button className="reu-edit-btn" tabIndex={-1} title="Abrir">
                          <Icon width={14} height={14}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>
                        </button>
                      </td>
                      <td className="reu-col-cat">{r.tipo_descricao || '—'}</td>
                      <td className="reu-col-desc">
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span
                            className="reu-status-dot"
                            style={{ background: statusInfo.color, marginTop: 5 }}
                            title={statusInfo.label}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                            <span className="reu-col-desc-text">
                              {r._titulo || r.descricao || r.descricao_old || '—'}
                            </span>
                            {r.qtd_acoes > 0 && (
                              <span className="reu-acoes-badge" title={`${r.qtd_acoes} tarefa(s) criada(s) nesta reunião`}>
                                {r.qtd_acoes} {r.qtd_acoes === 1 ? 'tarefa' : 'tarefas'}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="reu-col-local">{r.local || '—'}</td>
                      <td className="reu-col-dt">
                        <div>{ini.date}</div>
                        <div style={{ color: 'var(--text-muted)' }}>{ini.time}</div>
                      </td>
                      <td className="reu-col-dt">
                        <div>{fim.date}</div>
                        <div style={{ color: 'var(--text-muted)' }}>{fim.time}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination (table view only) */}
        {view === 'tabela' && totalPages > 1 && (
          <div className="reunioes-pagination">
            <span className="pagination-info">
              {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total}
            </span>
            <div className="pagination-buttons">
              <button disabled={page <= 1} onClick={() => setPage(1)} title="Primeira">
                <Icon width={13} height={13}><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></Icon>
              </button>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} title="Anterior">
                <Icon width={13} height={13}><polyline points="15 18 9 12 15 6"/></Icon>
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0 12px' }}>
                {page} / {totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} title="Próxima">
                <Icon width={13} height={13}><polyline points="9 18 15 12 9 6"/></Icon>
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} title="Última">
                <Icon width={13} height={13}><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></Icon>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Criar ──────────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova Reunião"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleCreate}>Criar</button>
          </>
        }
      >
        <div className="form-group">
          <label>Tipo de Reunião</label>
          <select className="form-control" value={form.sth_reu_tipo_id} onChange={e => setForm(f => ({ ...f, sth_reu_tipo_id: e.target.value }))}>
            <option value="">Selecione...</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Descrição / Pauta *</label>
          <textarea className="form-control" rows={4} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Pauta da reunião..." />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Data</label>
            <input type="date" className="form-control" value={form.dt_agenda} onChange={e => setForm(f => ({ ...f, dt_agenda: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Início</label>
            <input type="time" className="form-control" value={form.hr_inicio} onChange={e => setForm(f => ({ ...f, hr_inicio: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Fim</label>
            <input type="time" className="form-control" value={form.hr_fim} onChange={e => setForm(f => ({ ...f, hr_fim: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label>Local</label>
          <input className="form-control" value={form.local} onChange={e => setForm(f => ({ ...f, local: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}

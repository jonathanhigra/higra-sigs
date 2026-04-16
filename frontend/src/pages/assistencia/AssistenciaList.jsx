import { useState, useEffect, useMemo, useCallback } from 'react';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { atendimentoService } from '../../services/assistencia/atendimentoService';
import KanbanBoard from '../../components/KanbanBoard';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { SkeletonKanban, SkeletonSimpleTable } from '../../components/SkeletonPlanos';
import { toCSV } from '../../utils/format';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

const SEV_MAP = {
  CRITICA: { label: 'Crítica', color: '#ef4444', icon: '🔴' },
  ALTA:    { label: 'Alta',    color: '#f59e0b', icon: '🟠' },
  MEDIA:   { label: 'Média',   color: '#eab308', icon: '🟡' },
  BAIXA:   { label: 'Baixa',   color: '#22c55e', icon: '🟢' },
};

function SevBadge({ sev }) {
  if (!sev) return null;
  const cfg = SEV_MAP[sev?.toUpperCase()] || { label: sev, color: 'var(--text-muted)', icon: '⚪' };
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 10,
      background: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.color}44`,
      whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function SlaIndicator({ dtAbertura, dtFechamento }) {
  if (!dtAbertura) return null;
  const start = new Date(dtAbertura);
  const end   = dtFechamento ? new Date(dtFechamento) : new Date();
  if (isNaN(start)) return null;
  const days = Math.floor((end - start) / 86400000);
  const label = days === 0 ? '< 1d' : `${days}d`;
  const color = dtFechamento ? 'var(--text-muted)' : days <= 2 ? '#22c55e' : days <= 7 ? '#f59e0b' : '#ef4444';
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 10,
      background: color + '22', color, border: `1px solid ${color}44`,
      whiteSpace: 'nowrap', display: 'inline-block',
    }} title={`Aberto há ${days} dia(s)`}>
      SLA {label}
    </span>
  );
}

export default function AssistenciaList() {
  const [view, setView] = useState('kanban');
  const [items, setItems] = useState([]);
  const [board, setBoard] = useState({ colunas: [] });
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [sevFilter, setSevFilter] = useState('');
  const [myOnly, setMyOnly] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [filtros, setFiltros] = useState({ canal_id: '', responsavel_id: '', dt_inicio: '', dt_fim: '', sla_vencido: false });
  const [filtrosOpts, setFiltrosOpts] = useState({ canais: [], responsaveis: [] });
  const [modalOpen, setModalOpen] = useState(false);
  // Bulk actions (tarefa 255)
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState('');   // 'atribuir_tecnico' | 'mudar_status'
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkValor, setBulkValor] = useState('');
  const [savingBulk, setSavingBulk] = useState(false);
  const [formOpts, setFormOpts] = useState({ tipos: [], canais: [], responsaveis: [], empresas: [], unidades: [] });
  const [formOptsLoading, setFormOptsLoading] = useState(false);
  const FORM_INIT = {
    titulo: '', descricao: '', cliente: '',
    hgr_ass_cad_tp_atn_id: '', hgr_ass_cad_can_ent_id: '',
    responsavel_id: '', sth_cad_empresa_id: '', sth_cad_filial_id: '',
    severidade: '',
    eqp_equipamento: '', eqp_nr_serie: '', eqp_modelo: '',
  };
  const [form, setForm] = useState(FORM_INIT);
  const navigate = useNavigate();
  const toast = useToast();
  const debouncedBusca = useDebouncedValue(busca, 400);

  useEffect(() => { fetchData(); }, [view, sevFilter, debouncedBusca, myOnly, filtros]);

  useEffect(() => {
    atendimentoService.formOptions().then(r => {
      setFiltrosOpts({ canais: r.data.canais || [], responsaveis: r.data.responsaveis || [] });
    }).catch(() => {});
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (view === 'kanban') {
        const { data } = await atendimentoService.kanban({ my_only: myOnly || undefined });
        setBoard(data);
      } else {
        const params = { page: 1, per_page: 50 };
        if (sevFilter) params.severidade = sevFilter;
        if (myOnly) params.my_only = true;
        if (filtros.canal_id) params.canal_id = filtros.canal_id;
        if (filtros.responsavel_id) params.responsavel_id = filtros.responsavel_id;
        if (filtros.dt_inicio) params.dt_inicio = filtros.dt_inicio;
        if (filtros.dt_fim) params.dt_fim = filtros.dt_fim;
        if (filtros.sla_vencido) params.sla_vencido = true;
        const { data } = await atendimentoService.listar(params);
        setItems(data.items || []);
      }
    } catch { toast.error('Erro ao carregar'); }
    finally { setLoading(false); }
  };

  const handleDrop = async (itemId, fromColId, toColId) => {
    try {
      await atendimentoService.kanbanMover(itemId, { hgr_ass_cfg_fnl_reg_etp_id: toColId });
      toast.success('Atendimento movido');
      fetchData();
    } catch { toast.error('Erro ao mover'); }
  };

  const openModal = async () => {
    setModalOpen(true);
    if (formOpts.tipos.length === 0) {
      setFormOptsLoading(true);
      try {
        const { data } = await atendimentoService.formOptions();
        setFormOpts(data);
      } catch { toast.error('Erro ao carregar opções do formulário'); }
      finally { setFormOptsLoading(false); }
    }
  };

  const handleCreate = async () => {
    if (!form.titulo.trim()) { toast.error('Título obrigatório'); return; }
    try {
      const payload = {
        titulo: form.titulo,
        descricao: form.descricao || null,
        cliente: form.cliente || null,
        hgr_ass_cad_tp_atn_id: form.hgr_ass_cad_tp_atn_id || null,
        hgr_ass_cad_can_ent_id: form.hgr_ass_cad_can_ent_id || null,
        responsavel_id: form.responsavel_id || null,
        sth_cad_empresa_id: form.sth_cad_empresa_id || null,
        sth_cad_filial_id: form.sth_cad_filial_id || null,
        severidade: form.severidade || null,
      };
      const { data } = await atendimentoService.criar(payload);
      // Se informou equipamento, registrar
      if (form.eqp_equipamento.trim()) {
        await atendimentoService.adicionarEquipamento(data.id, {
          equipamento: form.eqp_equipamento,
          nr_serie: form.eqp_nr_serie || null,
          modelo: form.eqp_modelo || null,
        });
      }
      toast.success('Atendimento criado');
      setModalOpen(false);
      setForm(FORM_INIT);
      navigate(`/assistencia/${data.id}`);
    } catch { toast.error('Erro ao criar atendimento'); }
  };

  // Summary counts from kanban columns
  const summary = useMemo(() => {
    if (view === 'kanban') {
      const total = (board.colunas || []).reduce((acc, c) => acc + (c.items || []).length, 0);
      return { total, colunas: (board.colunas || []).map(c => ({ label: c.title, count: (c.items || []).length, color: c.color || 'var(--accent)' })) };
    }
    return { total: items.length, colunas: [] };
  }, [view, board, items]);

  const filteredItems = useMemo(() => {
    if (!debouncedBusca.trim()) return items;
    const q = debouncedBusca.toLowerCase();
    return items.filter(a =>
      (a.titulo || '').toLowerCase().includes(q) ||
      (a.codigo || '').toLowerCase().includes(q) ||
      (a.cliente || '').toLowerCase().includes(q) ||
      (a.responsavel_nome || '').toLowerCase().includes(q)
    );
  }, [items, debouncedBusca]);

  const kanbanColumns = (board.colunas || []).map(c => ({
    id: c.id, title: c.title, color: c.color,
    items: (c.items || []).map(i => ({ ...i, titulo: i.titulo || i.codigo || `#${i.id}` })),
  }));

  // Bulk helpers (tarefa 255)
  const allSelected = filteredItems.length > 0 && selectedIds.length === filteredItems.length;
  const toggleAll = () => setSelectedIds(allSelected ? [] : filteredItems.map(a => a.id));
  const toggleOne = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const openBulkModal = (action) => {
    setBulkAction(action);
    setBulkValor('');
    setBulkModal(true);
  };

  const exportarSelecionados = () => {
    const data = selectedIds.length > 0
      ? filteredItems.filter(a => selectedIds.includes(a.id))
      : filteredItems;
    const cols = [
      { key: 'codigo', label: 'Código' },
      { key: 'titulo', label: 'Título' },
      { key: 'cliente', label: 'Cliente' },
      { key: 'severidade', label: 'Severidade' },
      { key: 'etapa_atual', label: 'Etapa' },
      { key: 'status', label: 'Status' },
      { key: 'responsavel_nome', label: 'Responsável' },
      { key: 'dt_abertura', label: 'Abertura', render: r => r.dt_abertura ? new Date(r.dt_abertura).toLocaleDateString('pt-BR') : '' },
    ];
    const csv = toCSV(data, cols);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atendimentos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkConfirm = async () => {
    if (selectedIds.length === 0) return;
    if (bulkAction !== 'exportar' && !bulkValor) { toast.error('Selecione um valor'); return; }
    setSavingBulk(true);
    try {
      await atendimentoService.bulkUpdate({ ids: selectedIds, action: bulkAction, valor: bulkValor });
      toast.success(`${selectedIds.length} atendimento(s) atualizado(s)`);
      setBulkModal(false);
      setSelectedIds([]);
      fetchData();
    } catch { toast.error('Erro ao aplicar ação em lote'); }
    finally { setSavingBulk(false); }
  };

  const exportarCSV = useCallback(() => {
    const data = view === 'lista' ? filteredItems : (board.colunas || []).flatMap(c => c.items || []);
    const cols = [
      { key: 'codigo',           label: 'Código' },
      { key: 'titulo',           label: 'Título' },
      { key: 'cliente',          label: 'Cliente' },
      { key: 'severidade',       label: 'Severidade' },
      { key: 'etapa_atual',      label: 'Etapa' },
      { key: 'status',           label: 'Status' },
      { key: 'responsavel_nome', label: 'Responsável' },
      { key: 'tipo_atn',         label: 'Tipo' },
      { key: 'canal_entrada',    label: 'Canal' },
      { key: 'dt_abertura',      label: 'Abertura',    render: r => r.dt_abertura    ? new Date(r.dt_abertura).toLocaleDateString('pt-BR')    : '' },
      { key: 'dt_fechamento',    label: 'Fechamento',  render: r => r.dt_fechamento  ? new Date(r.dt_fechamento).toLocaleDateString('pt-BR')  : '' },
    ];
    const csv = toCSV(data, cols);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atendimentos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [view, filteredItems, board]);

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Assistência Técnica</h1>
        <div className="tarefas-actions">
          <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
            <button
              style={{ padding: '5px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: !myOnly ? 'var(--accent)' : 'transparent', color: !myOnly ? '#fff' : 'var(--text-secondary)' }}
              onClick={() => setMyOnly(false)}
            >Todos</button>
            <button
              style={{ padding: '5px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: myOnly ? 'var(--accent)' : 'transparent', color: myOnly ? '#fff' : 'var(--text-secondary)', borderLeft: '1px solid var(--border-primary)' }}
              onClick={() => setMyOnly(true)}
            >Meus</button>
          </div>
          <button className={`btn-secondary ${view === 'kanban' ? 'active' : ''}`} onClick={() => setView('kanban')}>
            <Icon width={13} height={13}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></Icon>
            Kanban
          </button>
          <button className={`btn-secondary ${view === 'lista' ? 'active' : ''}`} onClick={() => setView('lista')}>
            <Icon width={13} height={13}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></Icon>
            Lista
          </button>
          <button className="btn-secondary" onClick={exportarCSV} title="Exportar CSV">
            <Icon width={14} height={14}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Icon>
            CSV
          </button>
          <button className="btn-primary" onClick={openModal}>
            <Icon width={14} height={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>
            Novo Atendimento
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {!loading && summary.total > 0 && (
        <div className="tarefas-summary">
          <div className="tarefas-summary-card">
            <span className="summary-value" style={{ color: 'var(--accent)' }}>{summary.total}</span>
            <span className="summary-label">Total</span>
          </div>
          {summary.colunas.map(col => (
            <div key={col.label} className="tarefas-summary-card">
              <span className="summary-value" style={{ color: col.color }}>{col.count}</span>
              <span className="summary-label">{col.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Severity filter chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
        <button
          style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: `1px solid ${sevFilter === '' ? 'var(--accent)' : 'var(--border-primary)'}`, background: sevFilter === '' ? 'var(--accent)' : 'transparent', color: sevFilter === '' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}
          onClick={() => setSevFilter('')}
        >Todas</button>
        {Object.entries(SEV_MAP).map(([key, cfg]) => (
          <button key={key}
            style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: `1px solid ${sevFilter === key ? cfg.color : 'var(--border-primary)'}`, background: sevFilter === key ? cfg.color + '22' : 'transparent', color: sevFilter === key ? cfg.color : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => setSevFilter(sevFilter === key ? '' : key)}
          >
            {cfg.icon} {cfg.label}
          </button>
        ))}
      </div>

      {/* Filtros avançados (tarefa 254) */}
      <div style={{ marginBottom: 8 }}>
        <button
          style={{ fontSize: '0.75rem', padding: '3px 12px', borderRadius: 16, border: '1px solid var(--border-primary)', background: filtrosAbertos ? 'var(--accent)' : 'transparent', color: filtrosAbertos ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}
          onClick={() => setFiltrosAbertos(v => !v)}
        >
          {filtrosAbertos ? '▲' : '▼'} Filtros Avançados
          {(filtros.canal_id || filtros.responsavel_id || filtros.dt_inicio || filtros.dt_fim || filtros.sla_vencido) && (
            <span style={{ marginLeft: 6, background: '#ef4444', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>●</span>
          )}
        </button>

        {filtrosAbertos && (
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Canal</label>
              <select style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
                value={filtros.canal_id} onChange={e => setFiltros(f => ({ ...f, canal_id: e.target.value }))}>
                <option value="">Todos</option>
                {filtrosOpts.canais.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Técnico/Responsável</label>
              <select style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
                value={filtros.responsavel_id} onChange={e => setFiltros(f => ({ ...f, responsavel_id: e.target.value }))}>
                <option value="">Todos</option>
                {filtrosOpts.responsaveis.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Abertura — de</label>
              <input type="date" style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
                value={filtros.dt_inicio} onChange={e => setFiltros(f => ({ ...f, dt_inicio: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Abertura — até</label>
              <input type="date" style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
                value={filtros.dt_fim} onChange={e => setFiltros(f => ({ ...f, dt_fim: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={filtros.sla_vencido} onChange={e => setFiltros(f => ({ ...f, sla_vencido: e.target.checked }))} />
                Apenas SLA vencidos ({'>'} 7d)
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => setFiltros({ canal_id: '', responsavel_id: '', dt_inicio: '', dt_fim: '', sla_vencido: false })}>
                Limpar filtros
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Search (lista view only) */}
      {view === 'lista' && (
        <div className="tarefas-filters">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', display: 'flex', pointerEvents: 'none' }}>
              <Icon width={14} height={14}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>
            </span>
            <input
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '6px 10px 6px 30px', fontSize: '0.82rem' }}
              placeholder="Pesquisar atendimentos..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Bulk action toolbar (tarefa 255) */}
      {view === 'lista' && selectedIds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--accent)22', border: '1px solid var(--accent)44', borderRadius: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{selectedIds.length} selecionado(s)</span>
          <button
            style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => openBulkModal('atribuir_tecnico')}
          >Atribuir Técnico</button>
          <button
            style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => openBulkModal('mudar_status')}
          >Mudar Status</button>
          <button
            style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}
            onClick={exportarSelecionados}
          >Exportar Selecionados</button>
          <button
            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 'auto' }}
            onClick={() => setSelectedIds([])}
          >Limpar seleção</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        view === 'kanban' ? <SkeletonKanban /> : (
          <table className="data-table">
            <thead><tr><th>Código</th><th>Título</th><th>Cliente</th><th>Etapa</th><th>Status</th><th>Responsável</th></tr></thead>
            <tbody><SkeletonSimpleTable rows={6} cols={[60, '35%', 120, 90, 80, 120]} /></tbody>
          </table>
        )
      ) : view === 'kanban' ? (
        <KanbanBoard
          columns={kanbanColumns}
          dragEnabled={true}
          onDrop={handleDrop}
          onCardClick={(item) => navigate(`/assistencia/${item.id}`)}
          renderCard={(item) => (
            <>
              <div className="kanban-item-title">{item.titulo}</div>
              <div className="kanban-item-meta">
                <span>{item.cliente || '—'}</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {item.severidade && <SevBadge sev={item.severidade} />}
                  <SlaIndicator dtAbertura={item.dt_abertura} dtFechamento={item.dt_fechamento} />
                </div>
              </div>
              {item.responsavel_nome && (
                <div className="kanban-item-footer">
                  <span className="kanban-item-avatar">{item.responsavel_nome[0]}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {item.dt_abertura ? new Date(item.dt_abertura).toLocaleDateString('pt-BR') : ''}
                  </span>
                </div>
              )}
            </>
          )}
        />
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">Nenhum atendimento encontrado</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Selecionar todos" />
              </th>
              <th>Código</th><th>Título</th><th>Cliente</th><th>Severidade</th><th>Etapa</th><th>Status</th><th>SLA</th><th>Responsável</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(a => (
              <tr key={a.id} className="clickable" onClick={() => navigate(`/assistencia/${a.id}`)}>
                <td onClick={e => { e.stopPropagation(); toggleOne(a.id); }} style={{ cursor: 'default' }}>
                  <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleOne(a.id)} onClick={e => e.stopPropagation()} />
                </td>
                <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>{a.codigo || `#${a.id}`}</td>
                <td style={{ fontWeight: 600 }}>{a.titulo}</td>
                <td>{a.cliente || '—'}</td>
                <td><SevBadge sev={a.severidade} /></td>
                <td>{a.etapa_atual && (
                  <span style={{ fontSize: '0.8rem', padding: '2px 6px', borderRadius: 6, background: a.etapa_cor || 'var(--bg-surface)', color: '#fff' }}>
                    {a.etapa_atual}
                  </span>
                )}</td>
                <td><span className={`status-badge ${(a.status || '').toLowerCase()}`}>{a.status}</span></td>
                <td><SlaIndicator dtAbertura={a.dt_abertura} dtFechamento={a.dt_fechamento} /></td>
                <td>{a.responsavel_nome || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setForm(FORM_INIT); }}
        title="Novo Atendimento"
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setModalOpen(false); setForm(FORM_INIT); }}>Cancelar</button>
            <button className="btn-primary" onClick={handleCreate}>Criar Atendimento</button>
          </>
        }
      >
        {formOptsLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '12px 0' }}>Carregando opções...</div>
        ) : (
          <>
            <div className="form-row-2">
              <div className="form-group">
                <label>Título *</label>
                <input className="form-control" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Cliente</label>
                <input className="form-control" value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} />
              </div>
            </div>

            <div className="form-row-3">
              <div className="form-group">
                <label>Tipo de Atendimento</label>
                <select className="form-control" value={form.hgr_ass_cad_tp_atn_id} onChange={e => setForm(f => ({ ...f, hgr_ass_cad_tp_atn_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {formOpts.tipos.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Canal de Entrada</label>
                <select className="form-control" value={form.hgr_ass_cad_can_ent_id} onChange={e => setForm(f => ({ ...f, hgr_ass_cad_can_ent_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {formOpts.canais.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Severidade</label>
                <select className="form-control" value={form.severidade} onChange={e => setForm(f => ({ ...f, severidade: e.target.value }))}>
                  <option value="">Selecione...</option>
                  <option value="CRITICA">🔴 Crítica</option>
                  <option value="ALTA">🟠 Alta</option>
                  <option value="MEDIA">🟡 Média</option>
                  <option value="BAIXA">🟢 Baixa</option>
                </select>
              </div>
            </div>

            <div className="form-row-3">
              <div className="form-group">
                <label>Responsável</label>
                <select className="form-control" value={form.responsavel_id} onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {formOpts.responsaveis.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Empresa</label>
                <select className="form-control" value={form.sth_cad_empresa_id} onChange={e => setForm(f => ({ ...f, sth_cad_empresa_id: e.target.value, sth_cad_filial_id: '' }))}>
                  <option value="">Selecione...</option>
                  {formOpts.empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.descricao}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Unidade</label>
                <select className="form-control" value={form.sth_cad_filial_id} onChange={e => setForm(f => ({ ...f, sth_cad_filial_id: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {formOpts.unidades
                    .filter(u => !form.sth_cad_empresa_id || String(u.sth_cad_empresa_id) === String(form.sth_cad_empresa_id))
                    .map(u => <option key={u.id} value={u.id}>{u.descricao}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Descrição</label>
              <textarea className="form-control" rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>

            <div className="form-section-divider">
              <span>Equipamento (opcional)</span>
            </div>

            <div className="form-row-3">
              <div className="form-group">
                <label>Equipamento</label>
                <input className="form-control" placeholder="Nome / descrição" value={form.eqp_equipamento} onChange={e => setForm(f => ({ ...f, eqp_equipamento: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Nr. Série</label>
                <input className="form-control" value={form.eqp_nr_serie} onChange={e => setForm(f => ({ ...f, eqp_nr_serie: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Modelo</label>
                <input className="form-control" value={form.eqp_modelo} onChange={e => setForm(f => ({ ...f, eqp_modelo: e.target.value }))} />
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* Modal ações em lote (tarefa 255) */}
      <Modal
        open={bulkModal}
        onClose={() => setBulkModal(false)}
        title={bulkAction === 'atribuir_tecnico' ? `Atribuir Técnico — ${selectedIds.length} atendimento(s)` : `Mudar Status — ${selectedIds.length} atendimento(s)`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBulkModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleBulkConfirm} disabled={savingBulk || !bulkValor}>
              {savingBulk ? 'Aplicando...' : 'Confirmar'}
            </button>
          </>
        }
      >
        {bulkAction === 'atribuir_tecnico' && (
          <div className="form-group">
            <label>Novo responsável</label>
            <select className="form-control" value={bulkValor} onChange={e => setBulkValor(e.target.value)}>
              <option value="">Selecione um técnico...</option>
              {filtrosOpts.responsaveis.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        )}
        {bulkAction === 'mudar_status' && (
          <div className="form-group">
            <label>Novo status</label>
            <select className="form-control" value={bulkValor} onChange={e => setBulkValor(e.target.value)}>
              <option value="">Selecione um status...</option>
              <option value="ABERTO">Aberto</option>
              <option value="EM_ATENDIMENTO">Em Atendimento</option>
              <option value="AGUARDANDO_PECA">Aguardando Peça</option>
              <option value="AGUARDANDO_CLIENTE">Aguardando Cliente</option>
              <option value="RESOLVIDO">Resolvido</option>
              <option value="FECHADO">Fechado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          Esta ação será aplicada a todos os {selectedIds.length} atendimento(s) selecionado(s).
        </p>
      </Modal>
    </div>
  );
}

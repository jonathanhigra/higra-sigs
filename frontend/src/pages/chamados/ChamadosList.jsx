import { useState, useEffect, useMemo } from 'react';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { chamadoService } from '../../services/chamados/chamadoService';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { SkeletonSimpleTable } from '../../components/SkeletonPlanos';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

const STATUS_MAP = {
  ABERTO:       { label: 'Aberto',       color: '#3b82f6' },
  EM_ANDAMENTO: { label: 'Em Andamento', color: '#f59e0b' },
  RESOLVIDO:    { label: 'Resolvido',    color: '#22c55e' },
  FECHADO:      { label: 'Fechado',      color: '#6b7280' },
};

const PRIORIDADE_COLORS = {
  URGENTE: '#ef4444', ALTA: '#f59e0b', MEDIA: '#3b82f6', BAIXA: '#22c55e',
};

function SummaryBar({ items }) {
  const counts = useMemo(() => {
    const c = { ABERTO: 0, EM_ANDAMENTO: 0, RESOLVIDO: 0, FECHADO: 0 };
    items.forEach(i => { const s = (i.status || 'ABERTO').toUpperCase(); if (s in c) c[s]++; });
    return c;
  }, [items]);

  return (
    <div className="tarefas-summary">
      {[
        { key: 'total',        label: 'Total',        value: items.length,        color: 'var(--accent)' },
        { key: 'ABERTO',       label: 'Abertos',      value: counts.ABERTO,       color: '#3b82f6' },
        { key: 'EM_ANDAMENTO', label: 'Em Andamento', value: counts.EM_ANDAMENTO, color: '#f59e0b' },
        { key: 'RESOLVIDO',    label: 'Resolvidos',   value: counts.RESOLVIDO,    color: '#22c55e' },
        { key: 'FECHADO',      label: 'Fechados',     value: counts.FECHADO,      color: '#6b7280' },
      ].map(s => (
        <div key={s.key} className="tarefas-summary-card">
          <span className="summary-value" style={{ color: s.color }}>{s.value}</span>
          <span className="summary-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function ChamadosList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', meus: false, nao_atribuidos: false });
  const [busca, setBusca] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', descricao: '', prioridade: 'MEDIA' });
  const navigate = useNavigate();
  const toast = useToast();
  const perPage = 20;
  const debouncedBusca = useDebouncedValue(busca, 400);

  useEffect(() => { fetchData(); }, [page, filters]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage };
      if (filters.status) params.status = filters.status;
      if (filters.meus) params.meus = true;
      if (filters.nao_atribuidos) params.nao_atribuidos = true;
      const { data } = await chamadoService.listar(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { toast.error('Erro ao carregar chamados'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.titulo.trim()) { toast.error('Título obrigatório'); return; }
    try {
      const { data } = await chamadoService.criar(form);
      toast.success('Chamado criado');
      setModalOpen(false);
      navigate(`/chamados/${data.id}`);
    } catch { toast.error('Erro ao criar'); }
  };

  const filteredItems = useMemo(() => {
    if (!debouncedBusca.trim()) return items;
    const q = debouncedBusca.toLowerCase();
    return items.filter(c =>
      (c.titulo || '').toLowerCase().includes(q) ||
      (c.codigo || '').toLowerCase().includes(q) ||
      (c.categoria || '').toLowerCase().includes(q) ||
      (c.responsavel_nome || '').toLowerCase().includes(q)
    );
  }, [items, debouncedBusca]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Chamados</h1>
        <div className="tarefas-actions">
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            <Icon width={14} height={14}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>
            Novo Chamado
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="tarefas-filters">
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', display: 'flex', pointerEvents: 'none' }}>
            <Icon width={14} height={14}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>
          </span>
          <input
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '6px 10px 6px 30px', fontSize: '0.82rem' }}
            placeholder="Pesquisar chamados..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        <select
          value={filters.status}
          onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}
          style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '6px 10px', fontSize: '0.82rem' }}
        >
          <option value="">Todos os status</option>
          <option value="ABERTO">Aberto</option>
          <option value="EM_ANDAMENTO">Em andamento</option>
          <option value="RESOLVIDO">Resolvido</option>
          <option value="FECHADO">Fechado</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={filters.meus} onChange={e => { setFilters(f => ({ ...f, meus: e.target.checked })); setPage(1); }} />
          Meus chamados
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={filters.nao_atribuidos} onChange={e => { setFilters(f => ({ ...f, nao_atribuidos: e.target.checked })); setPage(1); }} />
          Não atribuídos
        </label>
        <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '5px 12px' }}
          onClick={() => navigate('/chamados/categorias')}>
          Categorias
        </button>
      </div>

      {/* Summary */}
      {!loading && <SummaryBar items={items} />}

      {/* Table */}
      {loading ? (
        <table className="data-table">
          <thead><tr>
            <th>Código</th><th>Título</th><th>Categoria</th>
            <th>Prioridade</th><th>Status</th><th>Responsável</th><th>Coments.</th>
          </tr></thead>
          <tbody><SkeletonSimpleTable rows={6} cols={[60, '40%', 100, 80, 90, 120, 40]} /></tbody>
        </table>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">Nenhum chamado encontrado</div>
      ) : (
        <table className="data-table">
          <thead><tr>
            <th>Código</th><th>Título</th><th>Categoria</th>
            <th>Prioridade</th><th>Status</th><th>Responsável</th><th>Coments.</th>
          </tr></thead>
          <tbody>
            {filteredItems.map(c => {
              const st = (c.status || 'ABERTO').toUpperCase();
              const stInfo = STATUS_MAP[st] || STATUS_MAP.ABERTO;
              const pri = (c.prioridade || '').toUpperCase();
              const priColor = PRIORIDADE_COLORS[pri] || '#6b7280';
              return (
                <tr key={c.id} className="clickable"
                  style={{ borderLeft: `3px solid ${stInfo.color}`, cursor: 'pointer' }}
                  onClick={() => navigate(`/chamados/${c.id}`)}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>{c.codigo || `#${c.id}`}</td>
                  <td style={{ fontWeight: 600 }}>{c.titulo}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{c.categoria || '—'}</td>
                  <td>
                    {c.prioridade && (
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: priColor + '22', color: priColor }}>
                        {c.prioridade}
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: stInfo.color + '22', color: stInfo.color }}>
                      {stInfo.label}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{c.responsavel_nome || '—'}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{c.qtd_comentarios || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, padding: '12px 0' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginRight: 8 }}>
            {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total}
          </span>
          <button disabled={page <= 1} onClick={() => setPage(1)}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex' }}>
            <Icon width={12} height={12}><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></Icon>
          </button>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex' }}>
            <Icon width={12} height={12}><polyline points="15 18 9 12 15 6"/></Icon>
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0 8px' }}>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex' }}>
            <Icon width={12} height={12}><polyline points="9 18 15 12 9 6"/></Icon>
          </button>
          <button disabled={page >= totalPages} onClick={() => setPage(totalPages)}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex' }}>
            <Icon width={12} height={12}><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></Icon>
          </button>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Chamado"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleCreate}>Criar</button>
          </>
        }
      >
        <div className="form-group">
          <label>Título *</label>
          <input className="form-control" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Descrição</label>
          <textarea className="form-control" rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Prioridade</label>
          <select className="form-control" value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value }))}>
            <option value="URGENTE">Urgente</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Média</option>
            <option value="BAIXA">Baixa</option>
          </select>
        </div>
      </Modal>
    </div>
  );
}

/**
 * Comunicacao / Eventos — Lista (PlanosList pattern)
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import api from '../../lib/api';
import Icon from '../../components/Icon';
import { SkeletonSimpleTable } from '../../components/SkeletonPlanos';
import Modal from '../../components/Modal';
import '../../components/Modal.css';
import { UserAvatar, StatusBadge } from '../../components/ui';
import '../planos_acao/PlanosList.css';
import './EventosList.css';

const STATUS_BADGES = [
  { key: 'ATIVO',   label: 'Ativo',   bg: '#4caf50' },
  { key: 'INATIVO', label: 'Inativo', bg: '#999' },
];

function fmtDate(d) {
  if (!d) return '\u2014';
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export default function EventosList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tipoFilter, setTipoFilter] = useState('T');
  const [search, setSearch] = useState('');
  const [activeBadges, setActiveBadges] = useState(STATUS_BADGES.map(b => b.key));
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDetail, setModalDetail] = useState(null);
  const [form, setForm] = useState({ titulo: '', descricao: '', dt_evento: '', local: '' });
  const toast = useToast();
  const perPage = 20;

  useEffect(() => { fetchData(); }, [page, tipoFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage };
      if (tipoFilter !== 'T') params.tipo = tipoFilter;
      const { data } = await api.get('/api/comunicacao/eventos', { params });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { toast.error('Erro ao carregar comunica\u00e7\u00f5es'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.titulo.trim()) { toast.error('T\u00edtulo obrigat\u00f3rio'); return; }
    try {
      await api.post('/api/comunicacao/eventos', form);
      toast.success('Evento criado');
      setModalOpen(false);
      setForm({ titulo: '', descricao: '', dt_evento: '', local: '' });
      fetchData();
    } catch { toast.error('Erro ao criar'); }
  };

  const toggleBadge = (key) => {
    setActiveBadges(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const filtered = items.filter(item => {
    const status = item.status || 'ATIVO';
    if (!activeBadges.includes(status)) return false;
    if (search) {
      const haystack = `${item.titulo || ''} ${item.responsavel_nome || ''} ${item.local || ''}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const startIdx = (page - 1) * perPage + 1;
  const endIdx = Math.min(page * perPage, total);

  return (
    <div className="comunicacao-container">
      {/* LEFT SIDEBAR */}
      <aside className="planos-sidebar">
        <div className="sidebar-section">
          <label className="sidebar-label">
            <span style={{ fontSize: '0.85rem' }}>&#9776;</span> Filtros
          </label>
        </div>

        <div className="sidebar-section">
          <label className="sidebar-label">Tipo</label>
          {[
            { value: 'T', label: 'Todos' },
            { value: 'INFORME', label: 'Comunicados' },
            { value: 'EVENTO', label: 'Eventos' },
          ].map(opt => (
            <label key={opt.value} className={`sidebar-radio ${tipoFilter === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${tipoFilter === opt.value ? 'checked' : ''}`} />
              <span onClick={() => { setTipoFilter(opt.value); setPage(1); }}>{opt.label}</span>
            </label>
          ))}
        </div>
      </aside>

      {/* MAIN */}
      <main className="planos-main">
        {/* Header */}
        <div className="planos-header">
          <h1>Comunicação</h1>
          <button className="planos-btn-novo" onClick={() => setModalOpen(true)}>
            Novo +
          </button>
        </div>

        {/* Search + Badges */}
        <div className="planos-toolbar">
          <div className="planos-search">
            <Icon width={15} height={15}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>
            <input type="text" placeholder="Pesquisar comunicações..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="planos-badges">
            {STATUS_BADGES.map(b => {
              const isActive = activeBadges.includes(b.key);
              const count = items.filter(i => (i.status || 'ATIVO') === b.key).length;
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
              <thead><tr><th className="col-action"></th><th>Título</th><th className="col-center">Tipo</th><th className="col-center">Status</th><th className="col-center">Data</th><th>Responsável</th></tr></thead>
              <tbody><SkeletonSimpleTable rows={6} cols={[36, '45%', 80, 70, 80, 130]} /></tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="planos-empty">
            <span style={{ fontSize: '2.5rem' }}>&#128227;</span>
            <p>Nenhuma comunicação encontrada</p>
          </div>
        ) : (
          <>
            <div className="planos-table-wrapper">
              <table className="planos-table">
                <thead>
                  <tr>
                    <th className="col-action"></th>
                    <th>Título</th>
                    <th className="col-center">Tipo</th>
                    <th className="col-center">Status</th>
                    <th className="col-center">Data</th>
                    <th>Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => {
                    const status = e.status || 'ATIVO';
                    const tipo = e._source || e.tipo || 'EVENTO';
                    return (
                      <tr key={e.id} className={status === 'INATIVO' ? 'comunicacao-row-inativo' : 'comunicacao-row-default'}
                          style={{ cursor: 'pointer' }} onClick={() => setModalDetail(e)}>
                        <td className="col-action" onClick={ev => ev.stopPropagation()}>
                          <button className="edit-btn" title="Editar" onClick={() => setModalDetail(e)}>
                            <Icon width={13} height={13}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>
                          </button>
                        </td>
                        <td className="comunicacao-titulo">{e.titulo || '\u2014'}</td>
                        <td className="col-center">
                          <span className={`comunicacao-tipo-badge tipo-${tipo.toLowerCase()}`}>
                            {tipo === 'INFORME' ? 'Comunicado' : 'Evento'}
                          </span>
                        </td>
                        <td className="col-center">
                          <StatusBadge status={status} label={status === 'ATIVO' ? 'Ativo' : 'Inativo'} />
                        </td>
                        <td className="col-center col-nowrap">{fmtDate(e.dt_evento)}</td>
                        <td>
                          <div className="user-cell">
                            <UserAvatar name={e.responsavel_nome} size={32} />
                            <span className="user-name">{e.responsavel_nome || '\u2014'}</span>
                          </div>
                        </td>
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
                <button disabled={page <= 1} onClick={() => setPage(1)}>&laquo;</button>
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>&lsaquo;</button>
                <span className="pagination-page">Página {page} de {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>&rsaquo;</button>
                <button disabled={page >= totalPages} onClick={() => setPage(totalPages)}>&raquo;</button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Modal detalhe */}
      <Modal open={!!modalDetail} onClose={() => setModalDetail(null)} title={modalDetail?.titulo || 'Comunicado'} size="large"
        footer={<button className="btn-secondary" onClick={() => setModalDetail(null)}>Fechar</button>}>
        {modalDetail && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Tipo</div><div style={{ fontSize: '0.85rem' }}>{modalDetail._source === 'INFORME' ? 'Comunicado' : 'Evento'}</div></div>
              <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Status</div><div style={{ fontSize: '0.85rem' }}>{modalDetail.status || 'Ativo'}</div></div>
              <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Data</div><div style={{ fontSize: '0.85rem' }}>{fmtDate(modalDetail.dt_evento || modalDetail.created_at)}</div></div>
              {modalDetail.local && <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Local</div><div style={{ fontSize: '0.85rem' }}>{modalDetail.local}</div></div>}
              {modalDetail.responsavel_nome && <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Autor</div><div style={{ fontSize: '0.85rem' }}>{modalDetail.responsavel_nome}</div></div>}
            </div>
            {modalDetail.descricao && (
              <div style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--text-primary)', padding: '12px 0', borderTop: '1px solid var(--border-subtle)', whiteSpace: 'pre-wrap' }}>
                {modalDetail.descricao}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Modal criar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Evento"
        footer={<><button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button><button className="btn-primary" onClick={handleCreate}>Criar</button></>}>
        <div className="form-group"><label>Título *</label><input className="form-control" value={form.titulo} onChange={e => setForm(f => ({...f, titulo: e.target.value}))} /></div>
        <div className="form-row">
          <div className="form-group"><label>Data</label><input type="date" className="form-control" value={form.dt_evento} onChange={e => setForm(f => ({...f, dt_evento: e.target.value}))} /></div>
          <div className="form-group"><label>Local</label><input className="form-control" value={form.local} onChange={e => setForm(f => ({...f, local: e.target.value}))} /></div>
        </div>
        <div className="form-group"><label>Descrição</label><textarea className="form-control" rows={3} value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} /></div>
      </Modal>
    </div>
  );
}

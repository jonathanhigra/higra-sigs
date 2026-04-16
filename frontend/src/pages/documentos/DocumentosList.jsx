/**
 * APEX pg 73 — Relação de Documentos (IR)
 * Colunas: Editar, Código, Título, Tipo, Rev., Status, Responsável, Processo
 * APEX pg 74 — Biblioteca (IR)
 * APEX pg 75 — Cadastro de Documento (Form)
 * APEX pg 71 — Compartilhar Documento (MODAL)
 * Padrão visual idêntico ao PlanosList
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { documentoService } from '../../services/documentos/documentoService';
import useLovStore from '../../stores/lovStore';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { SkeletonSimpleTable } from '../../components/SkeletonPlanos';
import '../../components/Modal.css';
import './DocumentosList.css';

const STATUS_MAP = {
  S: { label: 'Ativo',   color: '#22c55e' },
  N: { label: 'Inativo', color: '#ef4444' },
};

export default function DocumentosList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tipos, setTipos] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [statusAtivos, setStatusAtivos] = useState({ S: true, N: false });
  const [busca, setBusca] = useState('');

  // Modal criar (pg 75)
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', descricao: '', codigo: '', sth_doc_cad_tipo_id: '' });
  // Modal compartilhar (pg 71)
  const [modalShare, setModalShare] = useState(null);
  const [shareUserId, setShareUserId] = useState('');
  const [shareSearch, setShareSearch] = useState('');
  const [showShareDrop, setShowShareDrop] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const getUsuarios = useLovStore(s => s.getUsuarios);
  // Modal detail
  const [modalDetail, setModalDetail] = useState(null);

  const navigate = useNavigate();
  const toast = useToast();
  const perPage = 20;

  useEffect(() => { fetchData(); }, [page, filtroTipo]);
  useEffect(() => { documentoService.tipos().then(r => setTipos(r.data.items || [])).catch(() => {}); }, []);
  useEffect(() => { getUsuarios().then(list => setUsuarios(list)).catch(() => {}); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage };
      if (filtroTipo) params.tipo_id = filtroTipo;
      const { data } = await documentoService.listar(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { toast.error('Erro ao carregar documentos'); }
    finally { setLoading(false); }
  };

  const toggleStatus = (key) => {
    setStatusAtivos(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Counts
  const statusCounts = useMemo(() => {
    const counts = { S: 0, N: 0 };
    items.forEach(r => {
      const st = r.ativo || 'S';
      if (st in counts) counts[st]++;
    });
    return counts;
  }, [items]);

  // Client-side filter
  const filteredItems = useMemo(() => {
    let result = items;
    const active = Object.entries(statusAtivos).filter(([, v]) => v).map(([k]) => k);
    if (active.length > 0 && active.length < 2) {
      result = result.filter(r => active.includes(r.ativo || 'S'));
    }
    if (busca.trim()) {
      const term = busca.toLowerCase();
      result = result.filter(r =>
        (r.titulo || '').toLowerCase().includes(term) ||
        (r.codigo || '').toLowerCase().includes(term) ||
        (r.tipo || '').toLowerCase().includes(term) ||
        (r.responsavel_nome || '').toLowerCase().includes(term) ||
        (r.processo_nome || '').toLowerCase().includes(term)
      );
    }
    return result;
  }, [items, statusAtivos, busca]);

  const handleCreate = async () => {
    if (!form.titulo.trim()) { toast.error('Título obrigatório'); return; }
    try {
      const payload = { ...form };
      if (!payload.sth_doc_cad_tipo_id) delete payload.sth_doc_cad_tipo_id;
      await documentoService.criar(payload);
      toast.success('Documento criado');
      setModalOpen(false);
      setForm({ titulo: '', descricao: '', codigo: '', sth_doc_cad_tipo_id: '' });
      fetchData();
    } catch { toast.error('Erro ao criar'); }
  };

  const handleShare = async () => {
    if (!shareUserId) { toast.error('Selecione um usuário'); return; }
    try {
      await documentoService.compartilhar(modalShare.id, { usuario_id: Number(shareUserId) });
      toast.success('Documento compartilhado');
      setModalShare(null); setShareUserId(''); setShareSearch('');
    } catch { toast.error('Erro ao compartilhar'); }
  };

  const filteredShareUsers = useMemo(() => {
    if (!shareSearch.trim()) return usuarios.slice(0, 10);
    const term = shareSearch.toLowerCase();
    return usuarios.filter(u => (u.nome || u.name || '').toLowerCase().includes(term)).slice(0, 10);
  }, [usuarios, shareSearch]);

  const handleDetail = (id) => {
    navigate(`/documentos/${id}`);
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="documentos-container">
      {/* Sidebar */}
      <div className="documentos-sidebar">
        <div className="sidebar-section">
          <div className="sidebar-label">Tipo de Documento</div>
          <select
            className="form-control sidebar-select"
            value={filtroTipo}
            onChange={e => { setFiltroTipo(e.target.value); setPage(1); }}
          >
            <option value="">Todos</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}
          </select>
        </div>
        <div className="sidebar-divider" />
        <div className="sidebar-section">
          <div className="sidebar-label">Processos</div>
          {/* Processos distintos poderiam ser listados aqui */}
        </div>
      </div>

      {/* Main */}
      <div className="documentos-main">
        <div className="documentos-header">
          <h1>Documentos</h1>
          <button className="planos-btn-novo" onClick={() => setModalOpen(true)}>+ Novo Documento</button>
        </div>

        {/* Toolbar */}
        <div className="documentos-toolbar">
          <div className="documentos-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input
              placeholder="Pesquisar documentos..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>

          {/* Status badges */}
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
        </div>

        {/* Table */}
        {loading ? (
          <div className="documentos-table-wrapper">
            <table className="documentos-table">
              <thead><tr><th>Editar</th><th>Código</th><th>Título</th><th>Tipo</th><th>Rev.</th><th>Status</th><th>Responsável</th><th>Processo</th><th></th></tr></thead>
              <tbody><SkeletonSimpleTable rows={7} cols={[36, 70, '35%', 90, 40, 70, 120, 100, 36]} /></tbody>
            </table>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="documentos-empty">Nenhum documento encontrado</div>
        ) : (
          <div className="documentos-table-wrapper">
            <table className="documentos-table">
              <thead>
                <tr>
                  <th className="col-action">Editar</th>
                  <th>Código</th>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th className="col-center">Rev.</th>
                  <th>Status</th>
                  <th>Responsável</th>
                  <th>Processo</th>
                  <th className="col-action"></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(d => (
                  <tr
                    key={d.id}
                    className={`documentos-row ${d.ativo === 'N' ? 'row-inativo' : 'row-ativo'}`}
                    onClick={() => handleDetail(d.id)}
                  >
                    <td className="doc-col-edit" onClick={e => e.stopPropagation()}>
                      <button className="edit-btn" onClick={() => handleDetail(d.id)}>
                        <Icon width={13} height={13}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>
                      </button>
                    </td>
                    <td className="doc-col-codigo">{d.codigo || '—'}</td>
                    <td className="doc-col-titulo">{d.titulo || '—'}</td>
                    <td className="doc-col-tipo">
                      {d.tipo ? <span className="doc-tipo-badge">{d.tipo}</span> : '—'}
                    </td>
                    <td className="doc-col-rev">{d.revisao_atual || '—'}</td>
                    <td>
                      <span className={`doc-status-badge ${d.ativo === 'N' ? 'inativo' : 'ativo'}`}>
                        {d.ativo === 'N' ? 'Inativo' : 'Ativo'}
                      </span>
                    </td>
                    <td>
                      <div className="user-cell">
                        {d.responsavel_nome && (
                          <div className="user-avatar" style={{ background: `hsl(${(d._responsavel_id || 0) * 37 % 360}, 50%, 45%)` }}>
                            {d.responsavel_nome.charAt(0)}
                          </div>
                        )}
                        <span className="user-name">{d.responsavel_nome || '—'}</span>
                      </div>
                    </td>
                    <td className="doc-col-processo">{d.processo_nome || '—'}</td>
                    <td className="doc-col-edit" onClick={e => e.stopPropagation()}>
                      <button className="delete-btn" title="Compartilhar" onClick={() => setModalShare(d)}>
                        &#128279;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="documentos-pagination">
            <span className="pagination-info">
              {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total}
            </span>
            <div className="pagination-buttons">
              <button disabled={page <= 1} onClick={() => setPage(1)}>&#171;</button>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>&#8249;</button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0 12px' }}>
                {page} / {totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>&#8250;</button>
              <button disabled={page >= totalPages} onClick={() => setPage(totalPages)}>&#187;</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Criar — APEX pg 75 */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Documento"
        footer={<><button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button><button className="btn-primary" onClick={handleCreate}>Criar</button></>}>
        <div className="form-group"><label>Título *</label><input className="form-control" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} /></div>
        <div className="form-row">
          <div className="form-group"><label>Código</label><input className="form-control" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} /></div>
          <div className="form-group"><label>Tipo</label>
            <select className="form-control" value={form.sth_doc_cad_tipo_id} onChange={e => setForm(f => ({ ...f, sth_doc_cad_tipo_id: e.target.value }))}>
              <option value="">Selecione...</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group"><label>Descrição</label><textarea className="form-control" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} /></div>
      </Modal>

      {/* Modal Compartilhar — APEX pg 71 */}
      <Modal open={!!modalShare} onClose={() => { setModalShare(null); setShareSearch(''); setShareUserId(''); }} title={`Compartilhar — ${modalShare?.titulo || ''}`} size="small"
        footer={<><button className="btn-secondary" onClick={() => { setModalShare(null); setShareSearch(''); setShareUserId(''); }}>Cancelar</button><button className="btn-primary" onClick={handleShare}>Compartilhar</button></>}>
        <div className="form-group">
          <label>Usuário</label>
          <div style={{ position: 'relative' }}>
            <input
              className="form-control"
              placeholder="Pesquisar usuário..."
              value={shareSearch}
              onChange={e => { setShareSearch(e.target.value); setShareUserId(''); setShowShareDrop(true); }}
              onFocus={() => setShowShareDrop(true)}
              onBlur={() => setTimeout(() => setShowShareDrop(false), 150)}
              autoComplete="off"
            />
            {showShareDrop && filteredShareUsers.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 6, zIndex: 200, maxHeight: 180, overflowY: 'auto', boxShadow: 'var(--shadow-md)' }}>
                {filteredShareUsers.map(u => (
                  <div key={u.id}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.83rem', color: 'var(--text-primary)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                    onMouseDown={() => { setShareUserId(String(u.id)); setShareSearch(u.nome || u.name || ''); setShowShareDrop(false); }}>
                    {u.nome || u.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal Detail — APEX pg 75 detail */}
      <Modal open={!!modalDetail} onClose={() => setModalDetail(null)} title={modalDetail?._titulo || modalDetail?.titulo || 'Documento'} size="large"
        footer={<button className="btn-secondary" onClick={() => setModalDetail(null)}>Fechar</button>}>
        {modalDetail && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Código</div><div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{modalDetail._codigo || modalDetail.codigo || modalDetail.cod_documento || '—'}</div></div>
              <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Tipo</div><div style={{ fontSize: '0.85rem' }}>{modalDetail.tipo || '—'}</div></div>
              <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Status</div><div><span className={`doc-status-badge ${modalDetail.ativo === 'N' ? 'inativo' : 'ativo'}`}>{modalDetail.ativo === 'N' ? 'Inativo' : 'Ativo'}</span></div></div>
              <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Responsável</div><div style={{ fontSize: '0.85rem' }}>{modalDetail.responsavel_nome || '—'}</div></div>
              <div><div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>Processo</div><div style={{ fontSize: '0.85rem' }}>{modalDetail.processo_nome || '—'}</div></div>
            </div>

            {modalDetail.descricao && <p style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>{modalDetail.descricao}</p>}

            {/* Revisões */}
            {(modalDetail.revisoes || []).length > 0 && (
              <>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Histórico de Revisões</h3>
                <div className="documentos-table-wrapper" style={{ marginBottom: 16 }}>
                  <table className="documentos-table">
                    <thead><tr><th>Rev.</th><th>Alteração</th><th>Autor</th><th>Data</th></tr></thead>
                    <tbody>
                      {(modalDetail.revisoes || []).map(r => (
                        <tr key={r.id} className="documentos-row row-ativo">
                          <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{r.numero_revisao}</td>
                          <td>{r.descricao_alteracao || '—'}</td>
                          <td>{r.autor || '—'}</td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Compartilhado com */}
            {(modalDetail.compartilhado_com || []).length > 0 && (
              <>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginTop: 8, marginBottom: 8, color: 'var(--text-primary)' }}>Compartilhado com</h3>
                {(modalDetail.compartilhado_com || []).map(c => (
                  <div key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.82rem' }}>{c.usuario_nome || `User #${c.usuario_id}`}</div>
                ))}
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

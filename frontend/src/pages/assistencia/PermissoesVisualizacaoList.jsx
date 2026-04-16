/**
 * APEX P0416 — Configuração: Permissões de Visualização (Assistência)
 * CRUD de hgr_ass_cad_vw_cfg + atribuição de usuários por view
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const VW_BASE = '/api/assistencia/vw-cfg';
const ATN_BASE = '/api/assistencia/atendimentos';

export default function PermissoesVisualizacaoList() {
  const toast = useToast();
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);

  // CRUD modal
  const [crudModal, setCrudModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const FORM_INIT = { descricao: '', codigo: '', ativo: 'S' };
  const [form, setForm] = useState(FORM_INIT);
  const [saving, setSaving] = useState(false);

  // Usuário modal
  const [addUserModal, setAddUserModal] = useState(false);
  const [userBusca, setUserBusca] = useState('');
  const [userResultados, setUserResultados] = useState([]);
  const [userSelecionado, setUserSelecionado] = useState(null);
  const [savingUser, setSavingUser] = useState(false);

  const loadViews = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(VW_BASE);
      setViews(data);
    } catch { toast.error('Erro ao carregar configurações de visualização'); }
    finally { setLoading(false); }
  };

  const loadUsuariosView = useCallback(async (vwId) => {
    setLoadingUsuarios(true);
    try {
      const { data } = await api.get(`${VW_BASE}/${vwId}/usuarios`);
      setUsuarios(data);
    } catch { setUsuarios([]); }
    finally { setLoadingUsuarios(false); }
  }, []);

  useEffect(() => { loadViews(); }, []);

  useEffect(() => {
    if (selectedView) loadUsuariosView(selectedView.id);
    else setUsuarios([]);
  }, [selectedView, loadUsuariosView]);

  const openCreate = () => { setEditItem(null); setForm(FORM_INIT); setCrudModal(true); };
  const openEdit = (v) => { setEditItem(v); setForm({ descricao: v.descricao, codigo: v.codigo || '', ativo: v.ativo || 'S' }); setCrudModal(true); };

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSaving(true);
    const payload = { ...form, codigo: form.codigo || null };
    try {
      if (editItem) { await api.put(`${VW_BASE}/${editItem.id}`, payload); toast.success('Configuração atualizada'); }
      else { await api.post(VW_BASE, payload); toast.success('Configuração criada'); }
      setCrudModal(false);
      loadViews();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (v) => {
    if (!window.confirm(`Excluir "${v.descricao}"? Isso removerá todos os usuários vinculados.`)) return;
    try {
      await api.delete(`${VW_BASE}/${v.id}`);
      toast.success('Configuração excluída');
      if (selectedView?.id === v.id) setSelectedView(null);
      loadViews();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Erro ao excluir'); }
  };

  const handleBuscarUsuarios = async (q) => {
    setUserBusca(q);
    setUserSelecionado(null);
    if (q.length < 2) { setUserResultados([]); return; }
    try {
      const { data } = await api.get(`${ATN_BASE}/buscar-usuarios-sigs`, { params: { q, limit: 30 } });
      setUserResultados(data);
    } catch { setUserResultados([]); }
  };

  const handleAddUser = async () => {
    if (!userSelecionado) { toast.error('Selecione um usuário'); return; }
    setSavingUser(true);
    try {
      await api.post(`${VW_BASE}/${selectedView.id}/usuarios`, { beg_usuarios_id: userSelecionado.id });
      toast.success('Usuário adicionado');
      setAddUserModal(false);
      setUserBusca(''); setUserResultados([]); setUserSelecionado(null);
      loadUsuariosView(selectedView.id);
    } catch { toast.error('Erro ao adicionar usuário'); }
    finally { setSavingUser(false); }
  };

  const handleRemoveUser = async (reg) => {
    if (!window.confirm(`Remover ${reg.usuario_nome || 'usuário'} desta view?`)) return;
    try {
      await api.delete(`${VW_BASE}/${selectedView.id}/usuarios/${reg.id}`);
      toast.success('Usuário removido');
      loadUsuariosView(selectedView.id);
    } catch { toast.error('Erro ao remover'); }
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[{ label: 'Assistência Técnica', to: '/assistencia' }, { label: 'Permissões de Visualização' }]} />
          <h1>Permissões de Visualização</h1>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Nova Configuração</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedView ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Lista de views */}
        <div>
          {loading ? <div className="empty-state">Carregando...</div> :
           views.length === 0 ? <div className="empty-state">Nenhuma configuração cadastrada</div> : (
            <table className="data-table">
              <thead><tr><th>Descrição</th><th>Código</th><th>Usuários</th><th>Ativo</th><th style={{ width: 120 }}>Ações</th></tr></thead>
              <tbody>
                {views.map(v => (
                  <tr key={v.id} className={selectedView?.id === v.id ? 'clickable' : 'clickable'} onClick={() => setSelectedView(selectedView?.id === v.id ? null : v)} style={{ background: selectedView?.id === v.id ? 'color-mix(in srgb, var(--accent) 8%, var(--card-bg))' : undefined }}>
                    <td style={{ fontWeight: 600 }}>{v.descricao}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{v.codigo || '—'}</td>
                    <td>{v.total_usuarios}</td>
                    <td><span className={`status-badge ${v.ativo === 'S' ? 'ativo' : 'inativo'}`}>{v.ativo === 'S' ? 'Ativo' : 'Inativo'}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.74rem' }} onClick={() => openEdit(v)}>Editar</button>
                        <button style={{ padding: '2px 8px', fontSize: '0.74rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 5, cursor: 'pointer' }} onClick={() => handleDelete(v)}>×</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Usuários da view selecionada */}
        {selectedView && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedView.descricao} — Usuários</div>
              <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '4px 12px' }} onClick={() => setAddUserModal(true)}>+ Usuário</button>
            </div>
            {loadingUsuarios ? <div className="empty-state">Carregando...</div> :
             usuarios.length === 0 ? <div className="empty-state">Nenhum usuário</div> : (
              <table className="data-table">
                <thead><tr><th>Usuário</th><th>Login</th><th style={{ width: 80 }}></th></tr></thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.usuario_nome || `#${u.beg_usuarios_id}`}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{u.usuario || '—'}</td>
                      <td>
                        <button style={{ padding: '2px 8px', fontSize: '0.72rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 5, cursor: 'pointer' }} onClick={() => handleRemoveUser(u)}>Remover</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Modal CRUD */}
      <Modal open={crudModal} onClose={() => setCrudModal(false)} title={editItem ? 'Editar View' : 'Nova Configuração de Visualização'}
        footer={<><button className="btn-secondary" onClick={() => setCrudModal(false)}>Cancelar</button><button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button></>}
      >
        <div className="form-row-2">
          <div className="form-group">
            <label>Descrição *</label>
            <input className="form-control" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} autoFocus />
          </div>
          <div className="form-group">
            <label>Código</label>
            <input className="form-control" placeholder="ex: VW_ASS_01" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label>Ativo</label>
          <select className="form-control" value={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.value }))}><option value="S">Sim</option><option value="N">Não</option></select>
        </div>
      </Modal>

      {/* Modal Adicionar Usuário */}
      <Modal open={addUserModal} onClose={() => { setAddUserModal(false); setUserBusca(''); setUserResultados([]); setUserSelecionado(null); }} title={`Adicionar Usuário — ${selectedView?.descricao || ''}`}
        footer={<><button className="btn-secondary" onClick={() => setAddUserModal(false)}>Cancelar</button><button className="btn-primary" onClick={handleAddUser} disabled={savingUser || !userSelecionado}>{savingUser ? 'Adicionando...' : 'Adicionar'}</button></>}
      >
        <div className="form-group">
          <label>Buscar usuário</label>
          <input className="form-control" placeholder="Nome do usuário..." value={userBusca} onChange={e => handleBuscarUsuarios(e.target.value)} autoFocus />
        </div>
        {userResultados.length > 0 && (
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: 6, marginTop: 4 }}>
            {userResultados.map(u => (
              <div key={u.id} onClick={() => setUserSelecionado(u)}
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-primary)', background: userSelecionado?.id === u.id ? 'color-mix(in srgb, var(--accent) 12%, var(--card-bg))' : 'var(--card-bg)' }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{u.nome}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{u.usuario}</div>
              </div>
            ))}
          </div>
        )}
        {userSelecionado && (
          <div style={{ marginTop: 8, padding: 8, background: 'color-mix(in srgb, var(--accent) 8%, var(--card-bg))', borderRadius: 6, fontSize: '0.82rem', border: '1px solid var(--accent)' }}>
            Selecionado: <strong>{userSelecionado.nome}</strong>
          </div>
        )}
      </Modal>
    </div>
  );
}

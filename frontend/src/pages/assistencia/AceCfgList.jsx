/**
 * APEX P0417 — Configuração: Permissões de Acesso (Assistência)
 * CRUD de hgr_ass_cad_ace_cfg + vinculação multi-select de usuários
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const ACE_BASE = '/api/assistencia/ace-cfg';
const ATN_BASE = '/api/assistencia/atendimentos';

export default function AceCfgList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);

  // CRUD modal
  const [crudModal, setCrudModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const FORM_INIT = { descricao: '', codigo: '', ativo: 'S' };
  const [form, setForm] = useState(FORM_INIT);
  const [saving, setSaving] = useState(false);

  // Multi-select usuário modal
  const [multiModal, setMultiModal] = useState(false);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [selecionados, setSelecionados] = useState([]); // [{id, nome, usuario}]
  const [savingMulti, setSavingMulti] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(ACE_BASE);
      setItems(data);
    } catch { toast.error('Erro ao carregar configurações de acesso'); }
    finally { setLoading(false); }
  };

  const loadUsuarios = useCallback(async (aceId) => {
    setLoadingUsuarios(true);
    try {
      const { data } = await api.get(`${ACE_BASE}/${aceId}/usuarios`);
      setUsuarios(data);
    } catch { setUsuarios([]); }
    finally { setLoadingUsuarios(false); }
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (selectedItem) loadUsuarios(selectedItem.id);
    else setUsuarios([]);
  }, [selectedItem, loadUsuarios]);

  const openCreate = () => { setEditItem(null); setForm(FORM_INIT); setCrudModal(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ descricao: item.descricao, codigo: item.codigo || '', ativo: item.ativo || 'S' });
    setCrudModal(true);
  };

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSaving(true);
    const payload = { ...form, codigo: form.codigo || null };
    try {
      if (editItem) {
        await api.put(`${ACE_BASE}/${editItem.id}`, payload);
        toast.success('Configuração atualizada');
      } else {
        await api.post(ACE_BASE, payload);
        toast.success('Configuração criada');
      }
      setCrudModal(false);
      load();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Excluir "${item.descricao}"? Isso removerá todos os usuários vinculados.`)) return;
    try {
      await api.delete(`${ACE_BASE}/${item.id}`);
      toast.success('Configuração excluída');
      if (selectedItem?.id === item.id) setSelectedItem(null);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Erro ao excluir'); }
  };

  // Multi-select logic
  const handleBuscar = async (q) => {
    setBusca(q);
    if (q.length < 2) { setResultados([]); return; }
    try {
      const { data } = await api.get(`${ATN_BASE}/buscar-usuarios-sigs`, { params: { q, limit: 30 } });
      setResultados(data);
    } catch { setResultados([]); }
  };

  const toggleSelecionado = (u) => {
    setSelecionados(prev =>
      prev.some(s => s.id === u.id)
        ? prev.filter(s => s.id !== u.id)
        : [...prev, u]
    );
  };

  const openMultiModal = () => {
    setBusca(''); setResultados([]); setSelecionados([]); setMultiModal(true);
  };

  const handleVincularMulti = async () => {
    if (!selecionados.length) { toast.error('Selecione ao menos um usuário'); return; }
    setSavingMulti(true);
    try {
      const { data } = await api.post(`${ACE_BASE}/${selectedItem.id}/usuarios/multi`, {
        beg_usuarios_ids: selecionados.map(u => u.id),
      });
      toast.success(`${data.inseridos} usuário(s) vinculado(s)`);
      setMultiModal(false);
      loadUsuarios(selectedItem.id);
      load();
    } catch { toast.error('Erro ao vincular usuários'); }
    finally { setSavingMulti(false); }
  };

  const handleRemoverUsuario = async (reg) => {
    if (!window.confirm(`Remover ${reg.usuario_nome || 'usuário'} desta permissão?`)) return;
    try {
      await api.delete(`${ACE_BASE}/${selectedItem.id}/usuarios/${reg.id}`);
      toast.success('Usuário removido');
      loadUsuarios(selectedItem.id);
      load();
    } catch { toast.error('Erro ao remover'); }
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Assistência Técnica', to: '/assistencia' },
            { label: 'Permissões de Acesso' },
          ]} />
          <h1>Permissões de Acesso</h1>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Nova Permissão</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedItem ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Lista de permissões */}
        <div>
          {loading ? <div className="empty-state">Carregando...</div>
           : items.length === 0 ? <div className="empty-state">Nenhuma permissão cadastrada</div>
           : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Código</th>
                  <th>Usuários</th>
                  <th>Ativo</th>
                  <th style={{ width: 120 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr
                    key={item.id}
                    className="clickable"
                    onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                    style={{ background: selectedItem?.id === item.id ? 'color-mix(in srgb, var(--accent) 8%, var(--card-bg))' : undefined }}
                  >
                    <td style={{ fontWeight: 600 }}>{item.descricao}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.codigo || '—'}</td>
                    <td>
                      <span style={{ background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600 }}>
                        {item.total_usuarios}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${item.ativo === 'S' ? 'ativo' : 'inativo'}`}>
                        {item.ativo === 'S' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.74rem' }} onClick={() => openEdit(item)}>Editar</button>
                        <button
                          style={{ padding: '2px 8px', fontSize: '0.74rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 5, cursor: 'pointer' }}
                          onClick={() => handleDelete(item)}
                        >×</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Usuários da permissão selecionada */}
        {selectedItem && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedItem.descricao}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Usuários vinculados</div>
              </div>
              <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '4px 12px' }} onClick={openMultiModal}>
                + Vincular Usuários
              </button>
            </div>

            {loadingUsuarios ? <div className="empty-state">Carregando...</div>
             : usuarios.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div>Nenhum usuário vinculado</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Clique em "Vincular Usuários" para adicionar
                </div>
              </div>
             ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Login</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.usuario_nome || `#${u.beg_usuarios_id}`}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{u.usuario || '—'}</td>
                      <td>
                        <button
                          style={{ padding: '2px 8px', fontSize: '0.72rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 5, cursor: 'pointer' }}
                          onClick={() => handleRemoverUsuario(u)}
                        >Remover</button>
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
      <Modal
        open={crudModal}
        onClose={() => setCrudModal(false)}
        title={editItem ? 'Editar Permissão de Acesso' : 'Nova Permissão de Acesso'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCrudModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="form-row-2">
          <div className="form-group">
            <label>Descrição *</label>
            <input
              className="form-control"
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Código</label>
            <input
              className="form-control"
              placeholder="ex: ACE_ASS_01"
              value={form.codigo}
              onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
            />
          </div>
        </div>
        <div className="form-group">
          <label>Ativo</label>
          <select className="form-control" value={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.value }))}>
            <option value="S">Sim</option>
            <option value="N">Não</option>
          </select>
        </div>
      </Modal>

      {/* Modal Multi-select Usuários */}
      <Modal
        open={multiModal}
        onClose={() => setMultiModal(false)}
        title={`Vincular Usuários — ${selectedItem?.descricao || ''}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setMultiModal(false)}>Cancelar</button>
            <button
              className="btn-primary"
              onClick={handleVincularMulti}
              disabled={savingMulti || !selecionados.length}
            >
              {savingMulti ? 'Vinculando...' : `Vincular ${selecionados.length > 0 ? `(${selecionados.length})` : ''}`}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Buscar usuário</label>
          <input
            className="form-control"
            placeholder="Digite o nome do usuário..."
            value={busca}
            onChange={e => handleBuscar(e.target.value)}
            autoFocus
          />
        </div>

        {/* Resultados da busca */}
        {resultados.length > 0 && (
          <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: 6, marginTop: 4 }}>
            {resultados.map(u => {
              const sel = selecionados.some(s => s.id === u.id);
              return (
                <div
                  key={u.id}
                  onClick={() => toggleSelecionado(u)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border-primary)',
                    background: sel ? 'color-mix(in srgb, var(--accent) 14%, var(--card-bg))' : 'var(--card-bg)',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? 'var(--accent)' : 'var(--border-primary)'}`,
                    background: sel ? 'var(--accent)' : 'transparent', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {sel && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{u.nome}</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{u.usuario}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Selecionados */}
        {selecionados.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>
              Selecionados ({selecionados.length}):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selecionados.map(u => (
                <span
                  key={u.id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', background: 'color-mix(in srgb, var(--accent) 12%, var(--card-bg))',
                    border: '1px solid var(--accent)', borderRadius: 20, fontSize: '0.8rem',
                  }}
                >
                  {u.nome}
                  <button
                    onClick={() => toggleSelecionado(u)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

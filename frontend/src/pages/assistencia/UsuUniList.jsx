/**
 * APEX P0420 — Registro de Unidades por Usuário (Distribuição)
 * Atribui unidades (filiais) a usuários do SIGS para a AT
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const BASE = '/api/assistencia/usu-uni';

export default function UsuUniList() {
  const toast = useToast();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [unidades, setUnidades] = useState([]);
  const [loadingUnidades, setLoadingUnidades] = useState(false);

  // Modal adicionar unidade
  const [addModal, setAddModal] = useState(false);
  const [empresas, setEmpresas] = useState([]);
  const [filiais, setFiliais] = useState([]);
  const [empresaSel, setEmpresaSel] = useState('');
  const [filialSel, setFilialSel] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(BASE);
      setUsuarios(data);
    } catch { toast.error('Erro ao carregar usuários'); }
    finally { setLoading(false); }
  };

  const loadUnidades = useCallback(async (begId) => {
    setLoadingUnidades(true);
    try {
      const { data } = await api.get(`${BASE}/${begId}/unidades`);
      setUnidades(data);
    } catch { setUnidades([]); }
    finally { setLoadingUnidades(false); }
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (selectedUser) loadUnidades(selectedUser.beg_usuarios_id);
    else setUnidades([]);
  }, [selectedUser, loadUnidades]);

  const openAddModal = async () => {
    if (empresas.length === 0) {
      try {
        const { data } = await api.get('/api/assistencia/atendimentos/form-options');
        // Build empresa → filiais map
        const empMap = {};
        (data.empresas || []).forEach(e => { empMap[e.id] = { ...e, filiais: [] }; });
        (data.unidades || []).forEach(u => {
          if (empMap[u.sth_cad_empresa_id]) empMap[u.sth_cad_empresa_id].filiais.push(u);
        });
        setEmpresas(Object.values(empMap));
      } catch { toast.error('Erro ao carregar empresas'); return; }
    }
    setEmpresaSel(''); setFilialSel(''); setAddModal(true);
  };

  const handleEmpresaChange = (empId) => {
    setEmpresaSel(empId);
    setFilialSel('');
    const emp = empresas.find(e => e.id.toString() === empId);
    setFiliais(emp ? emp.filiais : []);
  };

  const handleAdd = async () => {
    if (!filialSel) { toast.error('Selecione uma unidade'); return; }
    setSaving(true);
    try {
      await api.post(`${BASE}/${selectedUser.beg_usuarios_id}/unidades`, {
        sth_cad_filial_id: Number(filialSel),
      });
      toast.success('Unidade atribuída ao usuário');
      setAddModal(false);
      loadUnidades(selectedUser.beg_usuarios_id);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao atribuir unidade');
    } finally { setSaving(false); }
  };

  const handleRemover = async (reg) => {
    if (!window.confirm(`Remover unidade "${reg.filial_nome}" deste usuário?`)) return;
    try {
      await api.delete(`${BASE}/${selectedUser.beg_usuarios_id}/unidades/${reg.id}`);
      toast.success('Unidade removida');
      loadUnidades(selectedUser.beg_usuarios_id);
      load();
    } catch { toast.error('Erro ao remover'); }
  };

  const filtered = usuarios.filter(u =>
    !search || u.nome?.toLowerCase().includes(search.toLowerCase()) || u.usuario?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Assistência Técnica', to: '/assistencia' },
            { label: 'Distribuição de Unidades' },
          ]} />
          <h1>Registro de Unidades por Usuário</h1>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Lista de usuários */}
        <div>
          <div style={{ marginBottom: 12 }}>
            <input
              className="form-control"
              placeholder="Filtrar por nome ou login..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {loading ? <div className="empty-state">Carregando...</div>
           : filtered.length === 0 ? <div className="empty-state">Nenhum usuário encontrado</div>
           : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Login</th>
                  <th>Unidades</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr
                    key={u.beg_usuarios_id}
                    className="clickable"
                    onClick={() => setSelectedUser(selectedUser?.beg_usuarios_id === u.beg_usuarios_id ? null : u)}
                    style={{ background: selectedUser?.beg_usuarios_id === u.beg_usuarios_id ? 'color-mix(in srgb, var(--accent) 8%, var(--card-bg))' : undefined }}
                  >
                    <td style={{ fontWeight: 600 }}>{u.nome}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{u.usuario || '—'}</td>
                    <td>
                      <span style={{
                        background: u.total_unidades > 0 ? 'color-mix(in srgb, var(--accent) 15%, var(--card-bg))' : 'var(--bg-surface)',
                        padding: '2px 8px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600,
                      }}>
                        {u.total_unidades}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Unidades do usuário selecionado */}
        {selectedUser && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedUser.nome}</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  {unidades.length} unidade{unidades.length !== 1 ? 's' : ''} atribuída{unidades.length !== 1 ? 's' : ''}
                </div>
              </div>
              <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '4px 12px' }} onClick={openAddModal}>
                + Atribuir Unidade
              </button>
            </div>

            {loadingUnidades ? <div className="empty-state">Carregando...</div>
             : unidades.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div>Nenhuma unidade atribuída</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Clique em "+ Atribuir Unidade" para começar
                </div>
              </div>
             ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Unidade / Filial</th>
                    <th>Atribuído em</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {unidades.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{u.empresa_nome}</td>
                      <td style={{ fontWeight: 600 }}>{u.filial_nome}</td>
                      <td style={{ fontSize: '0.78rem' }}>{u.created ? new Date(u.created).toLocaleDateString('pt-BR') : '—'}</td>
                      <td>
                        <button
                          style={{ padding: '2px 8px', fontSize: '0.72rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 5, cursor: 'pointer' }}
                          onClick={() => handleRemover(u)}
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

      {/* Modal Atribuir Unidade */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title={`Atribuir Unidade — ${selectedUser?.nome || ''}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAddModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleAdd} disabled={saving || !filialSel}>
              {saving ? 'Salvando...' : 'Atribuir'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Empresa</label>
          <select className="form-control" value={empresaSel} onChange={e => handleEmpresaChange(e.target.value)} autoFocus>
            <option value="">Selecione a empresa...</option>
            {empresas.map(e => (
              <option key={e.id} value={e.id}>{e.descricao}</option>
            ))}
          </select>
        </div>
        {empresaSel && (
          <div className="form-group">
            <label>Unidade / Filial</label>
            <select className="form-control" value={filialSel} onChange={e => setFilialSel(e.target.value)}>
              <option value="">Selecione a unidade...</option>
              {filiais.map(f => (
                <option key={f.id} value={f.id}>{f.descricao}</option>
              ))}
            </select>
          </div>
        )}
      </Modal>
    </div>
  );
}

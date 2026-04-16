/**
 * APEX P0422 — Cadastro de Usuário (Assistência Técnica)
 * Gerencia usuários SIGS com permissões específicas de AT
 * Exibe lista de beg_usuarios com vínculos de ace_cfg e unidades
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const ATN_BASE = '/api/assistencia/atendimentos';
const ACE_BASE = '/api/assistencia/ace-cfg';
const UNI_BASE = '/api/assistencia/usu-uni';

export default function UsuarioASSList() {
  const toast = useToast();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [aceCfgs, setAceCfgs] = useState([]);

  // Modal detalhes/permissões
  const [detailModal, setDetailModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPerms, setUserPerms] = useState([]);
  const [userUnidades, setUserUnidades] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Modal add permissão
  const [addPermModal, setAddPermModal] = useState(false);
  const [permSel, setPermSel] = useState('');
  const [savingPerm, setSavingPerm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [usersRes, aceRes] = await Promise.all([
        api.get(UNI_BASE),
        api.get(ACE_BASE),
      ]);
      setUsuarios(usersRes.data);
      setAceCfgs(aceRes.data);
    } catch { toast.error('Erro ao carregar usuários'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (u) => {
    setSelectedUser(u);
    setDetailModal(true);
    setLoadingDetail(true);
    try {
      const [uniRes] = await Promise.all([
        api.get(`${UNI_BASE}/${u.beg_usuarios_id}/unidades`),
      ]);
      setUserUnidades(uniRes.data);
      // Find permissions from ace_cfg that have this user
      const perms = [];
      for (const ace of aceCfgs) {
        const aceUsersRes = await api.get(`${ACE_BASE}/${ace.id}/usuarios`);
        const found = aceUsersRes.data.find(au => au.beg_usuarios_id === u.beg_usuarios_id);
        if (found) perms.push({ ...ace, reg_id: found.id });
      }
      setUserPerms(perms);
    } catch { toast.error('Erro ao carregar detalhes'); }
    finally { setLoadingDetail(false); }
  };

  const handleAddPerm = async () => {
    if (!permSel) { toast.error('Selecione uma permissão'); return; }
    setSavingPerm(true);
    try {
      await api.post(`${ACE_BASE}/${permSel}/usuarios/multi`, {
        beg_usuarios_ids: [selectedUser.beg_usuarios_id],
      });
      toast.success('Permissão atribuída');
      setAddPermModal(false);
      setPermSel('');
      // Reload perms
      const perms = [];
      for (const ace of aceCfgs) {
        const aceUsersRes = await api.get(`${ACE_BASE}/${ace.id}/usuarios`);
        const found = aceUsersRes.data.find(au => au.beg_usuarios_id === selectedUser.beg_usuarios_id);
        if (found) perms.push({ ...ace, reg_id: found.id });
      }
      setUserPerms(perms);
      load();
    } catch { toast.error('Erro ao atribuir permissão'); }
    finally { setSavingPerm(false); }
  };

  const handleRemovePerm = async (ace) => {
    if (!window.confirm(`Remover permissão "${ace.descricao}" deste usuário?`)) return;
    try {
      await api.delete(`${ACE_BASE}/${ace.id}/usuarios/${ace.reg_id}`);
      toast.success('Permissão removida');
      setUserPerms(prev => prev.filter(p => p.id !== ace.id));
    } catch { toast.error('Erro ao remover permissão'); }
  };

  const availablePerms = aceCfgs.filter(a => !userPerms.some(p => p.id === a.id));

  const filtered = usuarios.filter(u =>
    !search || u.nome?.toLowerCase().includes(search.toLowerCase()) || u.usuario?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Assistência Técnica', to: '/assistencia' },
            { label: 'Cadastro de Usuários AT' },
          ]} />
          <h1>Usuários — Assistência Técnica</h1>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          className="form-control"
          style={{ maxWidth: 360 }}
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
              <th>Unidades AT</th>
              <th style={{ width: 100 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const initials = u.nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
              const hue = (u.beg_usuarios_id * 47) % 360;
              return (
                <tr key={u.beg_usuarios_id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: `hsl(${hue}, 55%, 45%)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 700, fontSize: '0.78rem',
                      }}>
                        {initials}
                      </div>
                      <span style={{ fontWeight: 600 }}>{u.nome}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{u.usuario || '—'}</td>
                  <td>
                    <span style={{
                      background: u.total_unidades > 0 ? 'color-mix(in srgb, var(--accent) 15%, var(--card-bg))' : 'var(--bg-surface)',
                      padding: '2px 8px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600,
                    }}>
                      {u.total_unidades}
                    </span>
                  </td>
                  <td>
                    <button className="btn-secondary" style={{ fontSize: '0.76rem', padding: '3px 10px' }} onClick={() => openDetail(u)}>
                      Permissões
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Modal Detalhes de Permissões */}
      <Modal
        open={detailModal}
        onClose={() => { setDetailModal(false); setSelectedUser(null); setUserPerms([]); setUserUnidades([]); }}
        title={selectedUser ? `Permissões AT — ${selectedUser.nome}` : ''}
        footer={
          <button className="btn-secondary" onClick={() => setDetailModal(false)}>Fechar</button>
        }
      >
        {loadingDetail ? (
          <div className="empty-state">Carregando permissões...</div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>Permissões de Acesso ({userPerms.length})</div>
                {availablePerms.length > 0 && (
                  <button className="btn-primary" style={{ fontSize: '0.74rem', padding: '3px 10px' }} onClick={() => { setPermSel(''); setAddPermModal(true); }}>
                    + Adicionar
                  </button>
                )}
              </div>
              {userPerms.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '8px 0' }}>
                  Nenhuma permissão de acesso atribuída
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {userPerms.map(p => (
                    <span key={p.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 10px',
                      background: 'color-mix(in srgb, var(--accent) 10%, var(--card-bg))',
                      border: '1px solid var(--accent)', borderRadius: 20, fontSize: '0.8rem',
                    }}>
                      {p.descricao}
                      {p.codigo && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.codigo}</span>}
                      <button
                        onClick={() => handleRemovePerm(p)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1, marginLeft: 2 }}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="form-section-divider" />

            <div>
              <div style={{ fontWeight: 600, fontSize: '0.86rem', marginBottom: 8 }}>
                Unidades Atribuídas ({userUnidades.length})
              </div>
              {userUnidades.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '8px 0' }}>
                  Nenhuma unidade atribuída —{' '}
                  <a href="/assistencia/config/usu-uni" style={{ color: 'var(--accent)' }}>gerenciar distribuição</a>
                </div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Empresa</th><th>Unidade</th></tr></thead>
                  <tbody>
                    {userUnidades.map(u => (
                      <tr key={u.id}>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.empresa_nome}</td>
                        <td style={{ fontWeight: 600, fontSize: '0.86rem' }}>{u.filial_nome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* Modal Add Permissão */}
      <Modal
        open={addPermModal}
        onClose={() => setAddPermModal(false)}
        title="Adicionar Permissão de Acesso"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAddPermModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleAddPerm} disabled={savingPerm || !permSel}>
              {savingPerm ? 'Salvando...' : 'Atribuir'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Permissão de Acesso</label>
          <select className="form-control" value={permSel} onChange={e => setPermSel(e.target.value)} autoFocus>
            <option value="">Selecione...</option>
            {availablePerms.map(a => (
              <option key={a.id} value={a.id}>{a.descricao}{a.codigo ? ` [${a.codigo}]` : ''}</option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  );
}

/**
 * 582 — Cadastro de Usuário SIGS (CRUD com vínculos empresa/filial/processo/tipo).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { usuarioSigsService } from '../../services/cadastros/usuarioSigsService';
import { empresaService } from '../../services/cadastros/empresaService';
import { filialService } from '../../services/cadastros/filialService';
import { processoService } from '../../services/cadastros/processoService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

export default function UsuariosSIGSPage() {
  const { showToast } = useToast();
  const [usuarios, setUsuarios] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [filiais, setFiliais] = useState([]);
  const [processos, setProcessos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usrRes, tipoRes, empRes, filRes, procRes] = await Promise.all([
        usuarioSigsService.listar({ per_page: 100 }),
        usuarioSigsService.listarTipos(),
        empresaService.listar({ per_page: 100 }),
        filialService.listar({ per_page: 100 }),
        processoService.listar({ per_page: 100 }),
      ]);
      setUsuarios(usrRes.data?.items || []);
      setTipos(tipoRes.data?.items || []);
      setEmpresas(empRes.data?.items || []);
      setFiliais(filRes.data?.items || []);
      setProcessos(procRes.data?.items || []);
    } catch {
      showToast('Erro ao carregar usuários', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function openEdit(u) {
    setEditForm({
      hgr_stm_cad_tipo_usu_id: u.hgr_stm_cad_tipo_usu_id || '',
      sth_cad_empresa_id: u.sth_cad_empresa_id || '',
      sth_cad_filial_id: u.sth_cad_filial_id || '',
      beg_processo_id: u.beg_processo_id || '',
      ativo: u.ativo || 'S',
    });
    setEditModal(u);
  }

  async function salvar(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await usuarioSigsService.atualizarSigs(editModal.id, {
        hgr_stm_cad_tipo_usu_id: editForm.hgr_stm_cad_tipo_usu_id || null,
        sth_cad_empresa_id: editForm.sth_cad_empresa_id || null,
        sth_cad_filial_id: editForm.sth_cad_filial_id || null,
        beg_processo_id: editForm.beg_processo_id || null,
        ativo: editForm.ativo,
      });
      showToast('Usuário atualizado', 'success');
      setEditModal(null);
      fetchAll();
    } catch {
      showToast('Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  const usuariosFiltrados = usuarios.filter((u) => {
    const matchSearch = !search || (
      (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase())
    );
    const matchTipo = !tipoFiltro || u.tipo_usuario === tipoFiltro;
    return matchSearch && matchTipo;
  });

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Usuários SIGS</h1>
          <p className="ptf-subtitle">Gerenciamento de vínculos e tipos de usuário</p>
        </div>
        <span className="ptf-total-badge">{usuariosFiltrados.length} usuário{usuariosFiltrados.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="ptf-filters-bar" style={{ marginBottom: 16 }}>
        <label>
          Buscar
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, login ou e-mail" />
        </label>
        <label>
          Tipo
          <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.hgr_vlr_retorno}>{t.hgr_vlr_retorno} — {t.hgr_descricao}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && <div className="ptf-loading">Carregando...</div>}

      {!loading && (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Login</th>
                <th>Tipo</th>
                <th>Empresa</th>
                <th>Filial</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>
                  Nenhum usuário encontrado.
                </td></tr>
              ) : usuariosFiltrados.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name || '—'}</strong></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--feed-muted)' }}>{u.username || u.email}</td>
                  <td>
                    {u.tipo_usuario && (
                      <span className="ptf-rec-badge">{u.tipo_usuario}</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{u.empresa_descricao || '—'}</td>
                  <td style={{ fontSize: '0.82rem' }}>{u.filial_descricao || '—'}</td>
                  <td>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: u.ativo === 'S' ? '#22c55e22' : '#ef444422',
                      color: u.ativo === 'S' ? '#22c55e' : '#ef4444',
                    }}>{u.ativo === 'S' ? 'Ativo' : 'Inativo'}</span>
                  </td>
                  <td>
                    <button className="ptf-btn-secondary" style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                      onClick={() => openEdit(u)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editModal && (
        <div className="ptf-modal-overlay" onClick={() => setEditModal(null)}>
          <div className="ptf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ptf-modal-header">
              <h3>Editar — {editModal.name || editModal.username}</h3>
              <button className="ptf-modal-close" onClick={() => setEditModal(null)}>✕</button>
            </div>
            <form onSubmit={salvar} className="ptf-modal-body">
              <label>Tipo de Usuário
                <select value={editForm.hgr_stm_cad_tipo_usu_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, hgr_stm_cad_tipo_usu_id: e.target.value }))}>
                  <option value="">—</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>{t.hgr_vlr_retorno} — {t.hgr_descricao}</option>
                  ))}
                </select>
              </label>
              <label>Empresa
                <select value={editForm.sth_cad_empresa_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, sth_cad_empresa_id: e.target.value }))}>
                  <option value="">—</option>
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.descricao}</option>)}
                </select>
              </label>
              <label>Filial
                <select value={editForm.sth_cad_filial_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, sth_cad_filial_id: e.target.value }))}>
                  <option value="">—</option>
                  {filiais.map((f) => <option key={f.id} value={f.id}>{f.descricao}</option>)}
                </select>
              </label>
              <label>Processo/Setor
                <select value={editForm.beg_processo_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, beg_processo_id: e.target.value }))}>
                  <option value="">—</option>
                  {processos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </label>
              <label>Status
                <select value={editForm.ativo}
                  onChange={(e) => setEditForm((f) => ({ ...f, ativo: e.target.value }))}>
                  <option value="S">Ativo</option>
                  <option value="N">Inativo</option>
                </select>
              </label>
              <div className="ptf-modal-actions">
                <button type="button" className="ptf-btn-secondary" onClick={() => setEditModal(null)}>Cancelar</button>
                <button type="submit" className="ptf-btn-primary" disabled={saving}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

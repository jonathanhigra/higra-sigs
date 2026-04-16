/**
 * APEX P0447 — Cadastro de Tipo de Atividade (Assistência Técnica)
 * CRUD de hgr_ass_cad_tp_ativ
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const BASE = '/api/assistencia/tipos-ativ';

export default function TiposAtividadeList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const FORM_INIT = { descricao: '', ativo: 'S', ordem: '' };
  const [form, setForm] = useState(FORM_INIT);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(BASE);
      setItems(data);
    } catch { toast.error('Erro ao carregar tipos de atividade'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditItem(null); setForm(FORM_INIT); setModalOpen(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ descricao: item.descricao, ativo: item.ativo || 'S', ordem: item.ordem?.toString() || '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSaving(true);
    const payload = { ...form, ordem: form.ordem ? Number(form.ordem) : null };
    try {
      if (editItem) {
        await api.put(`${BASE}/${editItem.id}`, payload);
        toast.success('Tipo atualizado');
      } else {
        await api.post(BASE, payload);
        toast.success('Tipo criado');
      }
      setModalOpen(false);
      load();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Excluir tipo "${item.descricao}"?`)) return;
    try {
      await api.delete(`${BASE}/${item.id}`);
      toast.success('Tipo excluído');
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Erro ao excluir'); }
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Assistência Técnica', to: '/assistencia' },
            { label: 'Tipos de Atividade' },
          ]} />
          <h1>Tipos de Atividade</h1>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Novo Tipo</button>
      </div>

      {loading ? <div className="empty-state">Carregando...</div>
       : items.length === 0 ? <div className="empty-state">Nenhum tipo cadastrado</div>
       : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>Ordem</th>
              <th>Descrição</th>
              <th>Ativo</th>
              <th style={{ width: 130 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{item.ordem ?? '—'}</td>
                <td style={{ fontWeight: 600 }}>{item.descricao}</td>
                <td>
                  <span className={`status-badge ${item.ativo === 'S' ? 'ativo' : 'inativo'}`}>
                    {item.ativo === 'S' ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-secondary" style={{ fontSize: '0.76rem', padding: '2px 8px' }} onClick={() => openEdit(item)}>Editar</button>
                    <button
                      style={{ fontSize: '0.76rem', padding: '2px 8px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 5, cursor: 'pointer' }}
                      onClick={() => handleDelete(item)}
                    >Excluir</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? 'Editar Tipo de Atividade' : 'Novo Tipo de Atividade'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Descrição *</label>
          <input
            className="form-control"
            placeholder="ex: Diagnóstico, Reparo, Visita Técnica"
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            autoFocus
          />
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label>Ordem de Exibição</label>
            <input
              type="number"
              className="form-control"
              placeholder="1, 2, 3..."
              value={form.ordem}
              onChange={e => setForm(f => ({ ...f, ordem: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Ativo</label>
            <select className="form-control" value={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.value }))}>
              <option value="S">Sim</option>
              <option value="N">Não</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/**
 * APEX P0413 — Configuração: Status de Atendimento
 * CRUD de hgr_ass_cad_stt
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';

const BASE = '/api/assistencia/status-atn';

function ColorSwatch({ cor }) {
  if (!cor) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: cor, border: '1px solid rgba(0,0,0,0.2)' }} />
      <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{cor}</span>
    </span>
  );
}

export default function StatusAtendimentoList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const FORM_INIT = { descricao: '', sigla: '', cor: '#3b82f6', icone: '', ativo: 'S' };
  const [form, setForm] = useState(FORM_INIT);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(BASE);
      setItems(data);
    } catch { toast.error('Erro ao carregar status'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditItem(null); setForm(FORM_INIT); setModalOpen(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ descricao: item.descricao, sigla: item.sigla || '', cor: item.cor || '#3b82f6', icone: item.icone || '', ativo: item.ativo || 'S' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSaving(true);
    const payload = { ...form, sigla: form.sigla || null, icone: form.icone || null };
    try {
      if (editItem) {
        await api.put(`${BASE}/${editItem.id}`, payload);
        toast.success('Status atualizado');
      } else {
        await api.post(BASE, payload);
        toast.success('Status criado');
      }
      setModalOpen(false);
      load();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Excluir status "${item.descricao}"?`)) return;
    try {
      await api.delete(`${BASE}/${item.id}`);
      toast.success('Status excluído');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao excluir');
    }
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Assistência Técnica', to: '/assistencia' },
            { label: 'Status de Atendimento' },
          ]} />
          <h1>Status de Atendimento</h1>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Novo Status</button>
      </div>

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhum status cadastrado</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Sigla</th>
              <th>Cor</th>
              <th>Ícone</th>
              <th>Ativo</th>
              <th style={{ width: 140 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td style={{ fontWeight: 600 }}>{item.descricao}</td>
                <td>
                  {item.sigla && (
                    <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', background: item.cor || 'var(--bg-surface)', color: '#fff', padding: '2px 8px', borderRadius: 6 }}>
                      {item.sigla}
                    </span>
                  )}
                </td>
                <td><ColorSwatch cor={item.cor} /></td>
                <td style={{ fontSize: '1.1rem' }}>{item.icone || '—'}</td>
                <td>
                  <span className={`status-badge ${item.ativo === 'S' ? 'ativo' : 'inativo'}`}>
                    {item.ativo === 'S' ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => openEdit(item)}>Editar</button>
                    <button style={{ padding: '3px 10px', fontSize: '0.78rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, cursor: 'pointer' }} onClick={() => handleDelete(item)}>Excluir</button>
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
        title={editItem ? 'Editar Status' : 'Novo Status de Atendimento'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </>
        }
      >
        <div className="form-row-2">
          <div className="form-group">
            <label>Descrição *</label>
            <input className="form-control" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} autoFocus />
          </div>
          <div className="form-group">
            <label>Sigla</label>
            <input className="form-control" maxLength={20} placeholder="ex: AND, AGU, CON" value={form.sigla} onChange={e => setForm(f => ({ ...f, sigla: e.target.value }))} />
          </div>
        </div>
        <div className="form-row-3">
          <div className="form-group">
            <label>Cor</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={form.cor || '#3b82f6'} onChange={e => setForm(f => ({ ...f, cor: e.target.value }))} style={{ width: 40, height: 32, padding: 2, borderRadius: 4, border: '1px solid var(--border-primary)', cursor: 'pointer' }} />
              <input className="form-control" style={{ fontFamily: 'monospace' }} value={form.cor} onChange={e => setForm(f => ({ ...f, cor: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Ícone (emoji)</label>
            <input className="form-control" placeholder="🔧 ✅ ⏳ ❌" value={form.icone} onChange={e => setForm(f => ({ ...f, icone: e.target.value }))} />
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

/**
 * Cadastro de Agente Causador — SST (tarefa 264)
 * CRUD de hgr_sst_cad_agente_caus (agente causador de acidente de trabalho)
 */
import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const BASE = '/api/qualidade/rq03-config/sst/agentes-causadores';

export default function AgenteCausadorList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const FORM_INIT = { descricao: '', categoria: '', ativo: 'S' };
  const [form, setForm] = useState(FORM_INIT);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(BASE);
      setItems(data);
    } catch { toast.error('Erro ao carregar agentes causadores'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditItem(null); setForm(FORM_INIT); setModalOpen(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ descricao: item.descricao, categoria: item.categoria || '', ativo: item.ativo || 'S' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSaving(true);
    try {
      const payload = { descricao: form.descricao, categoria: form.categoria || null, ativo: form.ativo };
      if (editItem) {
        await api.put(`${BASE}/${editItem.id}`, payload);
        toast.success('Agente atualizado');
      } else {
        await api.post(BASE, payload);
        toast.success('Agente cadastrado');
      }
      setModalOpen(false);
      load();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Excluir agente causador "${item.descricao}"?`)) return;
    try {
      await api.delete(`${BASE}/${item.id}`);
      toast.success('Agente excluído');
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Erro ao excluir'); }
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Qualidade', to: '/qualidade/rq03' },
            { label: 'Agentes Causadores SST' },
          ]} />
          <h1>Agentes Causadores — SST</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Cadastro de agentes causadores de acidentes de trabalho (hgr_sst_cad_agente_caus)
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Novo Agente</button>
      </div>

      {loading ? <div className="empty-state">Carregando...</div>
       : items.length === 0 ? <div className="empty-state">Nenhum agente causador cadastrado</div>
       : (
        <table className="data-table">
          <thead>
            <tr><th>Descrição</th><th>Categoria</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} style={{ opacity: item.ativo === 'S' ? 1 : 0.55 }}>
                <td style={{ fontWeight: 600 }}>{item.descricao}</td>
                <td>{item.categoria || '—'}</td>
                <td><span className={`status-badge ${item.ativo === 'S' ? 'ativo' : 'inativo'}`}>{item.ativo === 'S' ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-secondary" style={{ fontSize: '0.72rem', padding: '2px 8px' }} onClick={() => openEdit(item)}>Editar</button>
                    <button style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 5, cursor: 'pointer' }} onClick={() => handleDelete(item)}>Excluir</button>
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
        title={editItem ? 'Editar Agente Causador' : 'Novo Agente Causador'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </>
        }
      >
        <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          Exemplos: Agente Físico, Agente Químico, Agente Biológico, Ergonômico, Acidente de Trajeto
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label>Descrição *</label>
            <input className="form-control" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} autoFocus />
          </div>
          <div className="form-group">
            <label>Categoria</label>
            <input className="form-control" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="Ex: Físico, Químico..." />
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
    </div>
  );
}

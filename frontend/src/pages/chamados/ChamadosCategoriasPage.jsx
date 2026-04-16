import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

export default function ChamadosCategoriasPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ descricao: '' });
  const [saving, setSaving] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState(null);
  const [editDesc, setEditDesc] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const toast = useToast();

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/chamados/categorias');
      setItems(data.items || data || []);
    } catch { toast.error('Erro ao carregar categorias'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSaving(true);
    try {
      await api.post('/api/chamados/categorias', form);
      toast.success('Categoria criada');
      setModalOpen(false);
      setForm({ descricao: '' });
      fetchData();
    } catch { toast.error('Erro ao criar'); }
    finally { setSaving(false); }
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditDesc(item.descricao || '');
  };

  const handleSaveEdit = async (id) => {
    if (!editDesc.trim()) { toast.error('Descrição obrigatória'); return; }
    setSavingEdit(true);
    try {
      await api.put(`/api/chamados/categorias/${id}`, { descricao: editDesc });
      toast.success('Categoria atualizada');
      setEditingId(null);
      fetchData();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSavingEdit(false); }
  };

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Categorias de Chamados</h1>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>+ Nova Categoria</button>
      </div>

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhuma categoria cadastrada</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th style={{ width: 60 }}>ID</th><th>Descrição</th><th style={{ width: 120 }}></th></tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontFamily: 'monospace' }}>{item.id}</td>
                <td>
                  {editingId === item.id ? (
                    <input
                      className="form-control"
                      style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(item.id); if (e.key === 'Escape') setEditingId(null); }}
                      autoFocus
                    />
                  ) : (
                    <span style={{ fontWeight: 500 }}>{item.descricao}</span>
                  )}
                </td>
                <td>
                  {editingId === item.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-primary" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                        disabled={savingEdit} onClick={() => handleSaveEdit(item.id)}>
                        {savingEdit ? '...' : 'Salvar'}
                      </button>
                      <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                        onClick={() => setEditingId(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                      onClick={() => handleEdit(item)}>Editar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova Categoria"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleCreate}>
              {saving ? 'Criando...' : 'Criar'}
            </button>
          </>
        }>
        <div className="form-group">
          <label>Descrição *</label>
          <input className="form-control" value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Ex: Suporte Técnico" />
        </div>
      </Modal>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

export default function TipoServicoChamadoList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ descricao: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/laudos/tipo-servico');
      setItems(data.items || data || []);
    } catch { toast.error('Erro ao carregar tipos de serviço'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSaving(true);
    try {
      await api.post('/api/laudos/tipo-servico', form);
      toast.success('Tipo de serviço criado');
      setModalOpen(false);
      setForm({ descricao: '' });
      fetchData();
    } catch { toast.error('Erro ao criar'); }
    finally { setSaving(false); }
  };

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Tipos de Serviço</h1>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>+ Novo Tipo</button>
      </div>

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhum tipo de serviço cadastrado</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th style={{ width: 60 }}>ID</th><th>Descrição</th></tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontFamily: 'monospace' }}>{item.id}</td>
                <td style={{ fontWeight: 500 }}>{item.descricao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Tipo de Serviço"
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
            placeholder="Ex: Manutenção preventiva" />
        </div>
      </Modal>
    </div>
  );
}

/**
 * Motores — Classes de Proteção (IP)
 * Route: /motores/classes-protecao
 * Uses api directly (not yet in motorService)
 */
import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

const ENDPOINT = '/api/motores/classes-protecao';
const EMPTY_FORM = { codigo: '', descricao: '' };

export default function ClasseProtecaoList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(ENDPOINT);
      setItems(Array.isArray(data) ? data : (data.items || []));
    } catch {
      toast.error('Erro ao carregar classes de proteção');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => { setForm(EMPTY_FORM); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.codigo.trim()) { toast.error('Código obrigatório'); return; }
    if (saving) return;
    setSaving(true);
    try {
      await api.post(ENDPOINT, form);
      toast.success('Classe de proteção cadastrada com sucesso');
      setModalOpen(false);
      fetchData();
    } catch {
      toast.error('Erro ao cadastrar classe de proteção');
    } finally {
      setSaving(false);
    }
  };

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Classes de Proteção (IP)</h1>
        <button className="btn-primary" onClick={openModal}>+ Nova Classe</button>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhuma classe de proteção cadastrada.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id ?? item.codigo}>
                <td><strong>{item.codigo}</strong></td>
                <td>{item.descricao}</td>
                <td>{item.ativo ? 'Sim' : 'Não'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nova Classe de Proteção">
        <div className="form-group">
          <label>Código *</label>
          <input className="form-control" value={form.codigo} onChange={set('codigo')} placeholder="Ex: IP54, IP55, IP65" />
        </div>
        <div className="form-group">
          <label>Descrição</label>
          <input className="form-control" value={form.descricao} onChange={set('descricao')} placeholder="Descrição do grau de proteção" />
        </div>
        <div className="form-row" style={{ justifyContent: 'flex-end', gap: '8px' }}>
          <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

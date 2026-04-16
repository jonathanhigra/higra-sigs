/**
 * Motores — Sensores compatíveis
 * Route: /motores/sensores
 */
import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { motorService } from '../../services/motores/motorService';
import Modal from '../../components/Modal';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

const EMPTY_FORM = { descricao: '', tipo: '', compatibilidade: '' };

export default function SensoresMotorList() {
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
      const { data } = await motorService.listarSensores();
      setItems(Array.isArray(data) ? data : (data.items || []));
    } catch {
      toast.error('Erro ao carregar sensores');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => { setForm(EMPTY_FORM); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    if (saving) return;
    setSaving(true);
    try {
      await motorService.criarSensor(form);
      toast.success('Sensor cadastrado com sucesso');
      setModalOpen(false);
      fetchData();
    } catch {
      toast.error('Erro ao cadastrar sensor');
    } finally {
      setSaving(false);
    }
  };

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Sensores de Motor</h1>
        <button className="btn-primary" onClick={openModal}>+ Novo Sensor</button>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhum sensor cadastrado.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Tipo</th>
              <th>Compatibilidade</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.descricao}</td>
                <td>{item.tipo || '—'}</td>
                <td>{item.compatibilidade || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Novo Sensor">
        <div className="form-group">
          <label>Descrição *</label>
          <input className="form-control" value={form.descricao} onChange={set('descricao')} placeholder="Nome ou descrição do sensor" />
        </div>
        <div className="form-group">
          <label>Tipo</label>
          <input className="form-control" value={form.tipo} onChange={set('tipo')} placeholder="Ex: temperatura, vibração, corrente" />
        </div>
        <div className="form-group">
          <label>Compatibilidade</label>
          <textarea className="form-control" rows={3} value={form.compatibilidade} onChange={set('compatibilidade')} placeholder="Modelos ou séries compatíveis" />
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

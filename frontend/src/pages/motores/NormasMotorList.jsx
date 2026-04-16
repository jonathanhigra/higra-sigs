/**
 * Motores — Normas (ABNT, ISO, IEC, API)
 * Route: /motores/normas
 */
import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { motorService } from '../../services/motores/motorService';
import Modal from '../../components/Modal';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

const EMPTY_FORM = { codigo: '', descricao: '', orgao: '' };

export default function NormasMotorList() {
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
      const { data } = await motorService.listarNormas();
      setItems(Array.isArray(data) ? data : (data.items || []));
    } catch {
      toast.error('Erro ao carregar normas');
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
      await motorService.criarNorma(form);
      toast.success('Norma cadastrada com sucesso');
      setModalOpen(false);
      fetchData();
    } catch {
      toast.error('Erro ao cadastrar norma');
    } finally {
      setSaving(false);
    }
  };

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Normas de Motor</h1>
        <button className="btn-primary" onClick={openModal}>+ Nova Norma</button>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhuma norma cadastrada.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Órgão</th>
              <th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id ?? item.codigo}>
                <td>{item.codigo}</td>
                <td>{item.descricao}</td>
                <td>{item.orgao}</td>
                <td>{item.ativo ? 'Sim' : 'Não'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nova Norma">
        <div className="form-group">
          <label>Código *</label>
          <input className="form-control" value={form.codigo} onChange={set('codigo')} placeholder="Ex: NBR 17094" />
        </div>
        <div className="form-group">
          <label>Descrição</label>
          <input className="form-control" value={form.descricao} onChange={set('descricao')} placeholder="Descrição da norma" />
        </div>
        <div className="form-group">
          <label>Órgão</label>
          <input className="form-control" value={form.orgao} onChange={set('orgao')} placeholder="Ex: ABNT, ISO, IEC, API" />
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

/**
 * Motores — Fornecedores de componentes
 * Route: /motores/fornecedores
 */
import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { motorService } from '../../services/motores/motorService';
import Modal from '../../components/Modal';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

const PAGE_SIZE = 20;
const EMPTY_FORM = { nome: '', cnpj: '', tipo: 'fabricante' };
const TIPOS = ['fabricante', 'distribuidor', 'importador'];

export default function FornecedorMotorList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { fetchData(); }, [page]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await motorService.listarFornecedores({ page, page_size: PAGE_SIZE });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Erro ao carregar fornecedores');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => { setForm(EMPTY_FORM); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }
    if (saving) return;
    setSaving(true);
    try {
      await motorService.criarFornecedor(form);
      toast.success('Fornecedor cadastrado com sucesso');
      setModalOpen(false);
      fetchData();
    } catch {
      toast.error('Erro ao cadastrar fornecedor');
    } finally {
      setSaving(false);
    }
  };

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Fornecedores de Motor</h1>
        <button className="btn-primary" onClick={openModal}>+ Novo Fornecedor</button>
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhum fornecedor cadastrado.</div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CNPJ</th>
                <th>Tipo</th>
                <th>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.nome}</td>
                  <td>{item.cnpj || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{item.tipo}</td>
                  <td>{item.ativo ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="form-row" style={{ justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
              <button className="btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                Anterior
              </button>
              <span style={{ lineHeight: '32px' }}>Página {page} de {totalPages}</span>
              <button className="btn-secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                Próxima
              </button>
            </div>
          )}
        </>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Novo Fornecedor">
        <div className="form-group">
          <label>Nome *</label>
          <input className="form-control" value={form.nome} onChange={set('nome')} placeholder="Razão social ou nome fantasia" />
        </div>
        <div className="form-group">
          <label>CNPJ</label>
          <input className="form-control" value={form.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" />
        </div>
        <div className="form-group">
          <label>Tipo</label>
          <select className="form-control" value={form.tipo} onChange={set('tipo')}>
            {TIPOS.map((t) => (
              <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
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

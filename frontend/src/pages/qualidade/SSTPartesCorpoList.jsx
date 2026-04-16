/**
 * Tarefas 291-292 — SST Partes do Corpo (CRUD simples)
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { sstService } from '../../services/qualidade/qualidadeService';
import Modal from '../../components/Modal';
import '../../components/Modal.css';
import '../planos_acao/PlanosList.css';

export default function SSTPartesCorpoList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ descricao: '', ativo: true });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await sstService.partesCorpo();
      setItems(data.items || data || []);
    } catch {
      toast.error('Erro ao carregar partes do corpo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditItem(null);
    setForm({ descricao: '', ativo: true });
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ descricao: item.descricao || '', ativo: item.ativo !== false });
    setModalOpen(true);
  };

  const handleSalvar = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    if (saving) return;
    setSaving(true);
    try {
      if (editItem) {
        await sstService.atualizarParteCorpo(editItem.id, form);
        toast.success('Atualizado com sucesso');
      } else {
        await sstService.criarParteCorpo(form);
        toast.success('Criado com sucesso');
      }
      setModalOpen(false);
      fetchData();
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAtivo = async (item) => {
    try {
      await sstService.atualizarParteCorpo(item.id, { ativo: !item.ativo });
      fetchData();
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  return (
    <div className="planos-container">
      <main className="planos-main">
        <div className="planos-header">
          <h1>Partes do Corpo — SST</h1>
          <button className="planos-btn-novo" onClick={openNew}>Novo +</button>
        </div>

        {loading ? (
          <div className="planos-empty"><p>Carregando...</p></div>
        ) : items.length === 0 ? (
          <div className="planos-empty">
            <span style={{ fontSize: '2.5rem' }}>🦴</span>
            <p>Nenhuma parte do corpo cadastrada</p>
          </div>
        ) : (
          <div className="planos-table-wrapper">
            <table className="planos-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th className="col-center">Ativo</th>
                  <th className="col-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="planos-row">
                    <td>{item.descricao}</td>
                    <td className="col-center">
                      <button
                        onClick={() => handleToggleAtivo(item)}
                        style={{
                          padding: '3px 12px',
                          borderRadius: 10,
                          border: 'none',
                          background: item.ativo !== false ? '#22c55e22' : '#ef444422',
                          color: item.ativo !== false ? '#22c55e' : '#ef4444',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        {item.ativo !== false ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="col-center">
                      <button className="edit-btn" onClick={() => openEdit(item)} title="Editar">✎</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? 'Editar Parte do Corpo' : 'Nova Parte do Corpo'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleSalvar}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Descrição *</label>
          <input
            className="form-control"
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Ex: Mão direita"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
            />
            Ativo
          </label>
        </div>
      </Modal>
    </div>
  );
}

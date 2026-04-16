/**
 * Tarefas 291-292 — SST Tipos de Acidente (CRUD simples)
 * Campos extras: tipo (TIPICO/TRAJETO/DOENCA)
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { sstService } from '../../services/qualidade/qualidadeService';
import Modal from '../../components/Modal';
import '../../components/Modal.css';
import '../planos_acao/PlanosList.css';

const TIPO_ACIDENTE_MAP = {
  TIPICO:  { label: 'Típico',  color: '#f59e0b' },
  TRAJETO: { label: 'Trajeto', color: '#3b82f6' },
  DOENCA:  { label: 'Doença',  color: '#ef4444' },
};

export default function SSTTiposAcidenteList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ descricao: '', tipo: 'TIPICO', ativo: true });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await sstService.tiposAcidente();
      setItems(data.items || data || []);
    } catch {
      toast.error('Erro ao carregar tipos de acidente');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditItem(null);
    setForm({ descricao: '', tipo: 'TIPICO', ativo: true });
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ descricao: item.descricao || '', tipo: item.tipo || 'TIPICO', ativo: item.ativo !== false });
    setModalOpen(true);
  };

  const handleSalvar = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    if (saving) return;
    setSaving(true);
    try {
      if (editItem) {
        await sstService.criarTipoAcidente({ ...form, id: editItem.id });
        toast.success('Atualizado com sucesso');
      } else {
        await sstService.criarTipoAcidente(form);
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
      await sstService.criarTipoAcidente({ ...item, ativo: !item.ativo, id: item.id });
      fetchData();
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  return (
    <div className="planos-container">
      <main className="planos-main">
        <div className="planos-header">
          <h1>Tipos de Acidente — SST</h1>
          <button className="planos-btn-novo" onClick={openNew}>Novo +</button>
        </div>

        {loading ? (
          <div className="planos-empty"><p>Carregando...</p></div>
        ) : items.length === 0 ? (
          <div className="planos-empty">
            <span style={{ fontSize: '2.5rem' }}>⚠️</span>
            <p>Nenhum tipo de acidente cadastrado</p>
          </div>
        ) : (
          <div className="planos-table-wrapper">
            <table className="planos-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th className="col-center">Ativo</th>
                  <th className="col-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const tipoInfo = TIPO_ACIDENTE_MAP[item.tipo] || TIPO_ACIDENTE_MAP.TIPICO;
                  return (
                    <tr key={item.id} className="planos-row">
                      <td>{item.descricao}</td>
                      <td>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 600, padding: '2px 10px', borderRadius: 10,
                          background: tipoInfo.color + '22', color: tipoInfo.color,
                        }}>
                          {tipoInfo.label}
                        </span>
                      </td>
                      <td className="col-center">
                        <button
                          onClick={() => handleToggleAtivo(item)}
                          style={{
                            padding: '3px 12px', borderRadius: 10, border: 'none',
                            background: item.ativo !== false ? '#22c55e22' : '#ef444422',
                            color: item.ativo !== false ? '#22c55e' : '#ef4444',
                            fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer',
                          }}
                        >
                          {item.ativo !== false ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>
                      <td className="col-center">
                        <button className="edit-btn" onClick={() => openEdit(item)} title="Editar">✎</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? 'Editar Tipo de Acidente' : 'Novo Tipo de Acidente'}
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
            placeholder="Ex: Acidente com equipamento"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>Tipo *</label>
          <select className="form-control" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
            <option value="TIPICO">Típico</option>
            <option value="TRAJETO">Trajeto</option>
            <option value="DOENCA">Doença</option>
          </select>
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />
            Ativo
          </label>
        </div>
      </Modal>
    </div>
  );
}

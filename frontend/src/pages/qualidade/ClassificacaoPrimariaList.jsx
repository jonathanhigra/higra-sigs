/**
 * Cadastro de Classificação Primária de NC (tarefa 265)
 * CRUD de hgr_rq03_cad_class_prim (tipo de NC: produto, processo, sistema, etc.)
 */
import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const BASE = '/api/qualidade/rq03-config/class-prim';

export default function ClassificacaoPrimariaList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const FORM_INIT = { descricao: '', sigla: '', ativo: 'S' };
  const [form, setForm] = useState(FORM_INIT);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(BASE);
      setItems(data);
    } catch { toast.error('Erro ao carregar classificações'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditItem(null); setForm(FORM_INIT); setModalOpen(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ descricao: item.descricao, sigla: item.sigla || '', ativo: item.ativo || 'S' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSaving(true);
    try {
      const payload = { descricao: form.descricao, sigla: form.sigla || null, ativo: form.ativo };
      if (editItem) {
        await api.put(`${BASE}/${editItem.id}`, payload);
        toast.success('Classificação atualizada');
      } else {
        await api.post(BASE, payload);
        toast.success('Classificação cadastrada');
      }
      setModalOpen(false);
      load();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Excluir classificação "${item.descricao}"?`)) return;
    try {
      await api.delete(`${BASE}/${item.id}`);
      toast.success('Classificação excluída');
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Erro ao excluir'); }
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Qualidade', to: '/qualidade/rq03' },
            { label: 'Classificação Primária' },
          ]} />
          <h1>Classificação Primária de NC</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Tipo de não conformidade: produto, processo, sistema, etc.
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Nova Classificação</button>
      </div>

      {loading ? <div className="empty-state">Carregando...</div>
       : items.length === 0 ? <div className="empty-state">Nenhuma classificação cadastrada</div>
       : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {items.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px',
              background: 'var(--card-bg)',
              border: '1px solid var(--border-primary)',
              borderRadius: 10,
              opacity: item.ativo === 'S' ? 1 : 0.6,
            }}>
              {item.sigla && (
                <div style={{
                  minWidth: 40, height: 40, borderRadius: 8,
                  background: 'var(--accent)22', color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', fontWeight: 800,
                }}>{item.sigla}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.descricao}
                </div>
                <span className={`status-badge ${item.ativo === 'S' ? 'ativo' : 'inativo'}`}>
                  {item.ativo === 'S' ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button className="btn-secondary" style={{ fontSize: '0.72rem', padding: '2px 8px' }} onClick={() => openEdit(item)}>Editar</button>
                <button style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 5, cursor: 'pointer' }} onClick={() => handleDelete(item)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? 'Editar Classificação Primária' : 'Nova Classificação Primária'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </>
        }
      >
        <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          Exemplos: Produto (PRD), Processo (PRC), Sistema (SIS), Material (MAT), Serviço (SVC)
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label>Descrição *</label>
            <input className="form-control" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} autoFocus />
          </div>
          <div className="form-group">
            <label>Sigla</label>
            <input className="form-control" maxLength={20} value={form.sigla} onChange={e => setForm(f => ({ ...f, sigla: e.target.value.toUpperCase() }))} placeholder="Ex: PRD" />
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

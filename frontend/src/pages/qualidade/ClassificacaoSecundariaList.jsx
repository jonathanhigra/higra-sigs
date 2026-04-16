/**
 * Cadastro de Classificação Secundária de NC (tarefa 266)
 * CRUD de hgr_rq03_cad_class_sec — subcategorias vinculadas à class primária
 */
import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const BASE = '/api/qualidade/rq03-config/class-sec';
const BASE_PRIM = '/api/qualidade/rq03-config/class-prim';

export default function ClassificacaoSecundariaList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [classPrims, setClassPrims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterPrimId, setFilterPrimId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const FORM_INIT = { descricao: '', hgr_rq03_cad_class_prim_id: '', ativo: 'S' };
  const [form, setForm] = useState(FORM_INIT);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = filterPrimId ? { prim_id: filterPrimId } : {};
      const { data } = await api.get(BASE, { params });
      setItems(data);
    } catch { toast.error('Erro ao carregar classificações secundárias'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    api.get(BASE_PRIM).then(({ data }) => setClassPrims(data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filterPrimId]);

  const openCreate = () => { setEditItem(null); setForm(FORM_INIT); setModalOpen(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      descricao: item.descricao,
      hgr_rq03_cad_class_prim_id: item.hgr_rq03_cad_class_prim_id || '',
      ativo: item.ativo || 'S',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSaving(true);
    try {
      const payload = {
        descricao: form.descricao,
        hgr_rq03_cad_class_prim_id: form.hgr_rq03_cad_class_prim_id ? Number(form.hgr_rq03_cad_class_prim_id) : null,
        ativo: form.ativo,
      };
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
    if (!window.confirm(`Excluir "${item.descricao}"?`)) return;
    try {
      await api.delete(`${BASE}/${item.id}`);
      toast.success('Excluído');
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Erro ao excluir'); }
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Qualidade', to: '/qualidade/rq03' },
            { label: 'Classificação Primária', to: '/qualidade/config/class-prim' },
            { label: 'Classificação Secundária' },
          ]} />
          <h1>Classificação Secundária de NC</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Subcategorias de não conformidade</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Nova Subcategoria</button>
      </div>

      {/* Filter by primary */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Filtrar por primária:</label>
        <select style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13 }}
          value={filterPrimId} onChange={e => setFilterPrimId(e.target.value)}>
          <option value="">Todas</option>
          {classPrims.map(p => <option key={p.id} value={p.id}>{p.descricao}</option>)}
        </select>
      </div>

      {loading ? <div className="empty-state">Carregando...</div>
       : items.length === 0 ? <div className="empty-state">Nenhuma classificação secundária</div>
       : (
        <table className="data-table">
          <thead>
            <tr><th>Descrição</th><th>Classificação Primária</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} style={{ opacity: item.ativo === 'S' ? 1 : 0.55 }}>
                <td style={{ fontWeight: 600 }}>{item.descricao}</td>
                <td>{item.class_prim_descricao || '—'}</td>
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
        title={editItem ? 'Editar Classificação Secundária' : 'Nova Classificação Secundária'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </>
        }
      >
        <div className="form-row-2">
          <div className="form-group">
            <label>Descrição *</label>
            <input className="form-control" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} autoFocus />
          </div>
          <div className="form-group">
            <label>Classificação Primária</label>
            <select className="form-control" value={form.hgr_rq03_cad_class_prim_id} onChange={e => setForm(f => ({ ...f, hgr_rq03_cad_class_prim_id: e.target.value }))}>
              <option value="">Sem classificação primária</option>
              {classPrims.map(p => <option key={p.id} value={p.id}>{p.descricao}</option>)}
            </select>
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

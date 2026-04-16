/**
 * APEX P0432 — Cadastro de Canal de Entrada
 * CRUD de hgr_ass_cad_can_ent (telefone, email, presencial, site, etc.)
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const BASE = '/api/assistencia/canais-entrada';

const CANAL_ICONS = {
  telefone: '📞', fone: '📞', phone: '📞',
  email: '✉️', 'e-mail': '✉️',
  presencial: '🤝', visita: '🤝',
  site: '🌐', web: '🌐', portal: '🌐',
  chat: '💬', whatsapp: '💬',
};

function getCanalIcon(descricao) {
  if (!descricao) return '📡';
  const d = descricao.toLowerCase();
  for (const [key, icon] of Object.entries(CANAL_ICONS)) {
    if (d.includes(key)) return icon;
  }
  return '📡';
}

export default function CanaisEntradaList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const FORM_INIT = { descricao: '', ativo: 'S' };
  const [form, setForm] = useState(FORM_INIT);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(BASE);
      setItems(data);
    } catch { toast.error('Erro ao carregar canais'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditItem(null); setForm(FORM_INIT); setModalOpen(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ descricao: item.descricao, ativo: item.ativo || 'S' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSaving(true);
    try {
      if (editItem) {
        await api.put(`${BASE}/${editItem.id}`, form);
        toast.success('Canal atualizado');
      } else {
        await api.post(BASE, form);
        toast.success('Canal cadastrado');
      }
      setModalOpen(false);
      load();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Excluir canal "${item.descricao}"?`)) return;
    try {
      await api.delete(`${BASE}/${item.id}`);
      toast.success('Canal excluído');
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Erro ao excluir'); }
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Assistência Técnica', to: '/assistencia' },
            { label: 'Canais de Entrada' },
          ]} />
          <h1>Canais de Entrada</h1>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Novo Canal</button>
      </div>

      {loading ? <div className="empty-state">Carregando...</div>
       : items.length === 0 ? <div className="empty-state">Nenhum canal cadastrado</div>
       : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {items.map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px',
                background: 'var(--card-bg)',
                border: `1px solid ${item.ativo === 'S' ? 'var(--border-primary)' : 'var(--border-muted, var(--border-primary))'}`,
                borderRadius: 10,
                opacity: item.ativo === 'S' ? 1 : 0.6,
              }}
            >
              <div style={{ fontSize: '1.6rem', flexShrink: 0 }}>{getCanalIcon(item.descricao)}</div>
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
                <button
                  style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 5, cursor: 'pointer' }}
                  onClick={() => handleDelete(item)}
                >Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? 'Editar Canal de Entrada' : 'Novo Canal de Entrada'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div style={{ marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Exemplos: Telefone, E-mail, Presencial, Site/Portal, Chat, WhatsApp
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label>Descrição *</label>
            <input
              className="form-control"
              placeholder="ex: Telefone"
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Ativo</label>
            <select className="form-control" value={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.value }))}>
              <option value="S">Sim</option>
              <option value="N">Não</option>
            </select>
          </div>
        </div>
        {form.descricao && (
          <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Ícone detectado: <span style={{ fontSize: '1.2rem' }}>{getCanalIcon(form.descricao)}</span>
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * APEX P0384 — Configuração: Tipos de Atendimento
 * CRUD de hgr_ass_cad_tp_atn
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';

const BASE = '/api/assistencia/tipos-atn';
const CANAIS_URL = '/api/assistencia/canais-entrada';

export default function TiposAtendimentoList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [canais, setCanais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const FORM_INIT = { descricao: '', ativo: 'S', categoria: '', canal_default_id: '', sla_dias: '' };
  const [form, setForm] = useState(FORM_INIT);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [tiposRes, canaisRes] = await Promise.all([api.get(BASE), api.get(CANAIS_URL)]);
      setItems(tiposRes.data);
      setCanais(canaisRes.data);
    } catch { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditItem(null);
    setForm(FORM_INIT);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      descricao: item.descricao,
      ativo: item.ativo || 'S',
      categoria: item.categoria || '',
      canal_default_id: item.canal_default_id || '',
      sla_dias: item.sla_dias ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSaving(true);
    const payload = {
      descricao: form.descricao,
      ativo: form.ativo,
      categoria: form.categoria || null,
      canal_default_id: form.canal_default_id ? Number(form.canal_default_id) : null,
      sla_dias: form.sla_dias !== '' ? Number(form.sla_dias) : null,
    };
    try {
      if (editItem) {
        await api.put(`${BASE}/${editItem.id}`, payload);
        toast.success('Tipo atualizado');
      } else {
        await api.post(BASE, payload);
        toast.success('Tipo criado');
      }
      setModalOpen(false);
      load();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Excluir tipo "${item.descricao}"?`)) return;
    try {
      await api.delete(`${BASE}/${item.id}`);
      toast.success('Tipo excluído');
      load();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Erro ao excluir';
      toast.error(msg);
    }
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Assistência Técnica', to: '/assistencia' },
            { label: 'Tipos de Atendimento' },
          ]} />
          <h1>Tipos de Atendimento</h1>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Novo Tipo</button>
      </div>

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhum tipo cadastrado</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Canal Default</th>
              <th>SLA (dias)</th>
              <th>Ativo</th>
              <th style={{ width: 140 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{item.id}</td>
                <td style={{ fontWeight: 600 }}>{item.descricao}</td>
                <td>{item.categoria || '—'}</td>
                <td>{item.canal_default_nome || '—'}</td>
                <td>{item.sla_dias != null ? `${item.sla_dias}d` : '—'}</td>
                <td>
                  <span className={`status-badge ${item.ativo === 'S' ? 'ativo' : 'inativo'}`}>
                    {item.ativo === 'S' ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => openEdit(item)}>
                      Editar
                    </button>
                    <button
                      style={{ padding: '3px 10px', fontSize: '0.78rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, cursor: 'pointer' }}
                      onClick={() => handleDelete(item)}
                    >
                      Excluir
                    </button>
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
        title={editItem ? 'Editar Tipo de Atendimento' : 'Novo Tipo de Atendimento'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="form-row-2">
          <div className="form-group">
            <label>Descrição *</label>
            <input
              className="form-control"
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Categoria</label>
            <input
              className="form-control"
              placeholder="ex: Técnico, Comercial, Ouvidoria"
              value={form.categoria}
              onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-row-3">
          <div className="form-group">
            <label>Canal de Entrada Padrão</label>
            <select className="form-control" value={form.canal_default_id} onChange={e => setForm(f => ({ ...f, canal_default_id: e.target.value }))}>
              <option value="">Nenhum</option>
              {canais.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>SLA (dias)</label>
            <input
              className="form-control"
              type="number"
              min={0}
              placeholder="ex: 5"
              value={form.sla_dias}
              onChange={e => setForm(f => ({ ...f, sla_dias: e.target.value }))}
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
      </Modal>
    </div>
  );
}

/**
 * APEX P0438 — Cadastro de Cliente (Assistência Técnica)
 * CRUD de clientes usando sth_cad_empresa com validação de CNPJ
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const BASE = '/api/assistencia/empresas';

function formatCNPJ(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function validateCNPJ(cnpj) {
  if (!cnpj) return true; // optional
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  const calc = (ds, len) => {
    let sum = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += parseInt(ds.charAt(len - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(d, 12) === parseInt(d.charAt(12)) && calc(d, 13) === parseInt(d.charAt(13));
}

export default function ClienteASSList() {
  const toast = useToast();
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const FORM_INIT = { descricao: '', cnpj: '', ativo: 'S' };
  const [form, setForm] = useState(FORM_INIT);
  const [saving, setSaving] = useState(false);

  const load = async (q = '') => {
    setLoading(true);
    try {
      const params = q ? { q } : {};
      const { data } = await api.get(BASE, { params });
      setClientes(data);
    } catch { toast.error('Erro ao carregar clientes'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSearch = (v) => {
    setSearch(v);
    load(v);
  };

  const openCreate = () => { setEditItem(null); setForm(FORM_INIT); setModalOpen(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ descricao: item.descricao, cnpj: item.cnpj ? formatCNPJ(item.cnpj) : '', ativo: item.ativo || 'S' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Nome/Razão Social obrigatória'); return; }
    if (form.cnpj && !validateCNPJ(form.cnpj)) {
      toast.error('CNPJ inválido. Verifique os dígitos verificadores.');
      return;
    }
    setSaving(true);
    const payload = { ...form, cnpj: form.cnpj ? form.cnpj.replace(/\D/g, '') : null };
    try {
      if (editItem) {
        await api.put(`${BASE}/${editItem.id}`, payload);
        toast.success('Cliente atualizado');
      } else {
        await api.post(BASE, payload);
        toast.success('Cliente cadastrado');
      }
      setModalOpen(false);
      load(search);
    } catch (err) { toast.error(err?.response?.data?.detail || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const cnpjValid = !form.cnpj || validateCNPJ(form.cnpj);

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Assistência Técnica', to: '/assistencia' },
            { label: 'Cadastro de Clientes' },
          ]} />
          <h1>Clientes — Assistência Técnica</h1>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Novo Cliente</button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <input
          className="form-control"
          style={{ maxWidth: 400 }}
          placeholder="Buscar por nome ou CNPJ..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
      </div>

      {loading ? <div className="empty-state">Carregando...</div>
       : clientes.length === 0 ? <div className="empty-state">Nenhum cliente encontrado</div>
       : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Razão Social / Nome</th>
              <th>CNPJ</th>
              <th>Unidades</th>
              <th>Ativo</th>
              <th style={{ width: 120 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.descricao}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                  {c.cnpj ? formatCNPJ(c.cnpj) : '—'}
                </td>
                <td>
                  <span style={{ background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600 }}>
                    {c.total_filiais}
                  </span>
                </td>
                <td>
                  <span className={`status-badge ${c.ativo === 'S' ? 'ativo' : 'inativo'}`}>
                    {c.ativo === 'S' ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td>
                  <button className="btn-secondary" style={{ fontSize: '0.76rem', padding: '3px 10px' }} onClick={() => openEdit(c)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? 'Editar Cliente' : 'Novo Cliente'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !cnpjValid}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Razão Social / Nome *</label>
          <input
            className="form-control"
            placeholder="Nome completo da empresa ou pessoa"
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            autoFocus
          />
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label>
              CNPJ
              {form.cnpj && (
                <span style={{ marginLeft: 8, fontSize: '0.72rem', color: cnpjValid ? '#22c55e' : '#ef4444' }}>
                  {cnpjValid ? '✓ válido' : '✗ inválido'}
                </span>
              )}
            </label>
            <input
              className="form-control"
              placeholder="00.000.000/0000-00"
              value={form.cnpj}
              onChange={e => setForm(f => ({ ...f, cnpj: formatCNPJ(e.target.value) }))}
              style={{ borderColor: form.cnpj && !cnpjValid ? '#ef4444' : undefined }}
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

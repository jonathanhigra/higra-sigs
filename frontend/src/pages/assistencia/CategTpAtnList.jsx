import React, { useEffect, useState } from 'react';
import api from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

const BASE = '/api/assistencia/cat-tp-atn';
const EMPTY = { descricao: '', ativo: 'S' };

export default function CategTpAtnList() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  async function fetchAll() {
    setLoading(true);
    try {
      const r = await api.get(BASE);
      setRows(r.data);
    } catch {
      showToast('Erro ao carregar categorias', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  function openNew() {
    setEditId(null);
    setForm(EMPTY);
    setModal(true);
  }

  function openEdit(row) {
    setEditId(row.id);
    setForm({ descricao: row.descricao, ativo: row.ativo });
    setModal(true);
  }

  async function handleSave() {
    if (!form.descricao.trim()) { showToast('Descrição obrigatória', 'error'); return; }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`${BASE}/${editId}`, form);
        showToast('Categoria atualizada');
      } else {
        await api.post(BASE, form);
        showToast('Categoria criada');
      }
      setModal(false);
      fetchAll();
    } catch {
      showToast('Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Excluir esta categoria?')) return;
    try {
      await api.delete(`${BASE}/${id}`);
      showToast('Categoria excluída');
      fetchAll();
    } catch {
      showToast('Erro ao excluir', 'error');
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            Categorias de Tipo de Atendimento
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
            Ref: P0543 — hgr_ass_cad_cat_tp_atn
          </p>
        </div>
        <button
          onClick={openNew}
          style={{
            padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 14,
          }}
        >
          + Nova Categoria
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Carregando…</p>
      ) : rows.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: 'var(--card-bg)', borderRadius: 12, color: 'var(--text-muted)',
        }}>
          Nenhuma categoria cadastrada.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Descrição</th>
              <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, width: 80 }}>Ativo</th>
              <th style={{ width: 100 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                style={{ borderBottom: '1px solid var(--border)', transition: 'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <td style={{ padding: '10px 12px', fontSize: 14, color: 'var(--text-primary)' }}>{row.descricao}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                    background: row.ativo === 'S' ? 'var(--success-bg, #d4edda)' : 'var(--muted-bg, #f0f0f0)',
                    color: row.ativo === 'S' ? 'var(--success, #198754)' : 'var(--text-muted)',
                  }}>
                    {row.ativo === 'S' ? 'Sim' : 'Não'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <button
                    onClick={() => openEdit(row)}
                    style={{ marginRight: 8, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(row.id)}
                    style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--danger, #dc3545)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--danger, #dc3545)' }}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--card-bg)', borderRadius: 12, padding: 28,
            width: 420, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.2)',
          }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {editId ? 'Editar Categoria' : 'Nova Categoria'}
            </h2>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              Descrição *
            </label>
            <input
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Ex: Instalação, Manutenção, Suporte…"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--input-bg)',
                color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', marginBottom: 16,
              }}
            />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              Ativo
            </label>
            <select
              value={form.ativo}
              onChange={e => setForm(f => ({ ...f, ativo: e.target.value }))}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--input-bg)',
                color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', marginBottom: 24,
              }}
            >
              <option value="S">Sim</option>
              <option value="N">Não</option>
            </select>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModal(false)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 14, opacity: saving ? .6 : 1 }}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

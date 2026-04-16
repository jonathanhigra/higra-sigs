import React, { useCallback, useEffect, useState } from 'react';
import { agendaService } from '../../services/reunioes/agendaService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

const EMPTY_FORM = { descricao: '', sigla: '' };

export default function TiposReuniaoList() {
  const { showToast } = useToast();
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchTipos = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await agendaService.tipos();
      setTipos(data?.items || data || []);
    } catch {
      showToast('Erro ao carregar tipos', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchTipos(); }, [fetchTipos]);

  function handleField(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.descricao.trim()) return showToast('Descrição obrigatória', 'error');
    setSaving(true);
    try {
      await agendaService.criarTipo({ descricao: form.descricao.trim(), sigla: form.sigla.trim() });
      showToast('Tipo criado', 'success');
      setModalOpen(false);
      setForm(EMPTY_FORM);
      fetchTipos();
    } catch {
      showToast('Erro ao salvar tipo', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Desativar este tipo de reunião?')) return;
    try {
      await agendaService.excluirTipo(id);
      showToast('Tipo desativado', 'success');
      setTipos((t) => t.filter((x) => x.id !== id));
    } catch {
      showToast('Erro ao excluir', 'error');
    }
  }

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Tipos de Reunião</h1>
          <p className="ptf-subtitle">Categorias de reunião (RACO, MDR, etc.)</p>
        </div>
        <button className="ptf-btn-primary" onClick={() => setModalOpen(true)}>
          + Novo Tipo
        </button>
      </div>

      {loading ? (
        <div className="ptf-loading">Carregando...</div>
      ) : tipos.length === 0 ? (
        <div className="ptf-empty">Nenhum tipo cadastrado.</div>
      ) : (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead>
              <tr>
                <th>Sigla</th>
                <th>Descrição</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.sigla && (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                        background: 'var(--color-primary, #7c3aed)22',
                        color: 'var(--color-primary, #7c3aed)',
                        fontSize: '0.78rem', fontWeight: 700,
                      }}>{t.sigla}</span>
                    )}
                  </td>
                  <td><strong>{t.descricao}</strong></td>
                  <td>
                    <button
                      className="ptf-btn-danger-sm"
                      onClick={() => handleDelete(t.id)}
                      title="Desativar"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="ptf-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="ptf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ptf-modal-header">
              <h3>Novo Tipo de Reunião</h3>
              <button className="ptf-modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSave} className="ptf-modal-body">
              <div className="ptf-form-row">
                <label>
                  Sigla (ex: RACO)
                  <input
                    name="sigla"
                    value={form.sigla}
                    onChange={handleField}
                    maxLength={20}
                    placeholder="RACO"
                    style={{ textTransform: 'uppercase' }}
                  />
                </label>
                <label>
                  Descrição *
                  <input
                    name="descricao"
                    value={form.descricao}
                    onChange={handleField}
                    placeholder="Reunião de Acompanhamento"
                    required
                  />
                </label>
              </div>
              <div className="ptf-modal-actions">
                <button type="button" className="ptf-btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="ptf-btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

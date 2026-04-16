import React, { useCallback, useEffect, useState } from 'react';
import { documentoService } from '../../services/documentos/documentoService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

const EMPTY_FORM = { descricao: '' };

export default function CategoriaDocumentoList() {
  const { showToast } = useToast();
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchTipos = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await documentoService.tipos();
      setTipos(data?.items || data || []);
    } catch {
      showToast('Erro ao carregar categorias', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchTipos(); }, [fetchTipos]);

  async function handleSave(e) {
    e.preventDefault();
    if (!form.descricao.trim()) return showToast('Descrição obrigatória', 'error');
    setSaving(true);
    try {
      await documentoService.criarTipo({ descricao: form.descricao.trim() });
      showToast('Categoria criada', 'success');
      setModalOpen(false);
      setForm(EMPTY_FORM);
      fetchTipos();
    } catch {
      showToast('Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Desativar esta categoria?')) return;
    try {
      await documentoService.excluirTipo(id);
      showToast('Categoria desativada', 'success');
      setTipos((t) => t.filter((x) => x.id !== id));
    } catch {
      showToast('Erro ao excluir', 'error');
    }
  }

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Categorias de Documento</h1>
          <p className="ptf-subtitle">Tipos: Instrução, Procedimento, Formulário, Registro...</p>
        </div>
        <button className="ptf-btn-primary" onClick={() => setModalOpen(true)}>
          + Nova Categoria
        </button>
      </div>

      {loading ? (
        <div className="ptf-loading">Carregando...</div>
      ) : tipos.length === 0 ? (
        <div className="ptf-empty">Nenhuma categoria cadastrada.</div>
      ) : (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Descrição</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((t, i) => (
                <tr key={t.id}>
                  <td style={{ color: 'var(--feed-muted)', width: 40 }}>{i + 1}</td>
                  <td><strong>{t.descricao}</strong></td>
                  <td>
                    <button className="ptf-btn-danger-sm" onClick={() => handleDelete(t.id)} title="Desativar">
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
              <h3>Nova Categoria</h3>
              <button className="ptf-modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSave} className="ptf-modal-body">
              <label>
                Descrição *
                <input
                  name="descricao"
                  value={form.descricao}
                  onChange={(e) => setForm({ descricao: e.target.value })}
                  placeholder="Ex: Procedimento Operacional"
                  required
                />
              </label>
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

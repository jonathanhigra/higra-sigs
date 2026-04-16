/**
 * 567 — Categorias de Comunicado (CRUD).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { eventoService } from '../../services/comunicacao/eventoService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

export default function CategoriasComunicadoList() {
  const { showToast } = useToast();
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ descricao: '' });

  const fetchCategorias = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await eventoService.listarTipos();
      setCategorias(data?.items || []);
    } catch {
      showToast('Erro ao carregar categorias', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchCategorias(); }, [fetchCategorias]);

  async function salvar(e) {
    e.preventDefault();
    if (!form.descricao.trim()) return showToast('Descrição obrigatória', 'error');
    setSaving(true);
    try {
      await eventoService.criarTipo({ descricao: form.descricao.trim() });
      showToast('Categoria criada', 'success');
      setModal(false);
      setForm({ descricao: '' });
      fetchCategorias();
    } catch {
      showToast('Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function excluir(id) {
    if (!window.confirm('Desativar categoria?')) return;
    try {
      await eventoService.excluirTipo(id);
      showToast('Categoria desativada', 'success');
      fetchCategorias();
    } catch {
      showToast('Erro ao excluir', 'error');
    }
  }

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Categorias de Comunicado</h1>
          <p className="ptf-subtitle">Tipos de eventos e comunicados (segurança, RH, novos produtos, etc.)</p>
        </div>
        <button className="ptf-btn-primary" onClick={() => setModal(true)}>+ Nova Categoria</button>
      </div>

      {loading && <div className="ptf-loading">Carregando...</div>}

      {!loading && (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead><tr><th>Descrição</th><th></th></tr></thead>
            <tbody>
              {categorias.length === 0 ? (
                <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>
                  Nenhuma categoria cadastrada.
                </td></tr>
              ) : categorias.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.descricao}</strong></td>
                  <td><button className="ptf-btn-danger-sm" onClick={() => excluir(c.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="ptf-modal-overlay" onClick={() => setModal(false)}>
          <div className="ptf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ptf-modal-header">
              <h3>Nova Categoria</h3>
              <button className="ptf-modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={salvar} className="ptf-modal-body">
              <label>Descrição *
                <input value={form.descricao} onChange={(e) => setForm({ descricao: e.target.value })}
                  placeholder="Ex: Segurança, RH, Novos Produtos..." required autoFocus />
              </label>
              <div className="ptf-modal-actions">
                <button type="button" className="ptf-btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="ptf-btn-primary" disabled={saving}>Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

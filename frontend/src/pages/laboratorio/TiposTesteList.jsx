/**
 * 538 — CRUD Tipos de Teste de Bancada
 */
import React, { useCallback, useEffect, useState } from 'react';
import { laboratorioService } from '../../services/laboratorio/laboratorioService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

export default function TiposTesteList() {
  const { showToast } = useToast();
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ descricao: '' });

  const fetchTipos = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await laboratorioService.tiposTeste();
      setTipos(data?.items || []);
    } catch {
      showToast('Erro ao carregar tipos', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchTipos(); }, [fetchTipos]);

  async function salvar(e) {
    e.preventDefault();
    if (!form.descricao.trim()) return showToast('Descrição obrigatória', 'error');
    setSaving(true);
    try {
      await laboratorioService.criarTipoTeste({ descricao: form.descricao.trim() });
      showToast('Tipo de teste criado', 'success');
      setModal(false);
      setForm({ descricao: '' });
      fetchTipos();
    } catch {
      showToast('Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function excluir(id) {
    if (!window.confirm('Desativar tipo de teste?')) return;
    try {
      await laboratorioService.excluirTipoTeste(id);
      showToast('Tipo desativado', 'success');
      fetchTipos();
    } catch {
      showToast('Erro ao excluir', 'error');
    }
  }

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Tipos de Teste de Bancada</h1>
          <p className="ptf-subtitle">Categorias de testes para agendamento</p>
        </div>
        <button className="ptf-btn-primary" onClick={() => setModal(true)}>+ Novo Tipo</button>
      </div>

      {loading && <div className="ptf-loading">Carregando...</div>}

      {!loading && (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead>
              <tr><th>Descrição</th><th></th></tr>
            </thead>
            <tbody>
              {tipos.length === 0 ? (
                <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>
                  Nenhum tipo de teste cadastrado.
                </td></tr>
              ) : tipos.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.descricao}</strong></td>
                  <td><button className="ptf-btn-danger-sm" onClick={() => excluir(t.id)}>✕</button></td>
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
              <h3>Novo Tipo de Teste</h3>
              <button className="ptf-modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={salvar} className="ptf-modal-body">
              <label>Descrição *
                <input
                  value={form.descricao}
                  onChange={(e) => setForm({ descricao: e.target.value })}
                  placeholder="Ex: Performance Hidráulica, Ensaio de Vibração..."
                  required
                  autoFocus
                />
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

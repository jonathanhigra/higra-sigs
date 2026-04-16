import React, { useCallback, useEffect, useState } from 'react';
import { metaService } from '../../services/indicadores/metaService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

export default function AnoFiscalList() {
  const { showToast } = useToast();
  const [anos, setAnos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ano: new Date().getFullYear(), dt_inicio: '', dt_fim: '', descricao: '' });

  const fetchAnos = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await metaService.listarAnosFiscais();
      setAnos(data?.items || []);
    } catch {
      showToast('Erro ao carregar anos fiscais', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchAnos(); }, [fetchAnos]);

  async function salvar(e) {
    e.preventDefault();
    if (!form.dt_inicio || !form.dt_fim) return showToast('Datas obrigatórias', 'error');
    setSaving(true);
    try {
      await metaService.criarAnoFiscal(form);
      showToast('Ano fiscal criado', 'success');
      setModal(false);
      setForm({ ano: new Date().getFullYear(), dt_inicio: '', dt_fim: '', descricao: '' });
      fetchAnos();
    } catch {
      showToast('Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function excluir(id) {
    if (!window.confirm('Excluir ano fiscal?')) return;
    try {
      await metaService.excluirAnoFiscal(id);
      showToast('Ano fiscal removido', 'success');
      fetchAnos();
    } catch {
      showToast('Erro ao excluir', 'error');
    }
  }

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Anos Fiscais</h1>
          <p className="ptf-subtitle">Configuração de períodos fiscais para indicadores</p>
        </div>
        <button className="ptf-btn-primary" onClick={() => setModal(true)}>+ Novo Ano Fiscal</button>
      </div>

      {loading && <div className="ptf-loading">Carregando...</div>}

      {!loading && (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead>
              <tr>
                <th>Ano</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Descrição</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {anos.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>
                  Nenhum ano fiscal cadastrado.
                </td></tr>
              ) : anos.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.ano}</strong></td>
                  <td style={{ fontSize: '0.85rem' }}>
                    {a.dt_inicio ? new Date(a.dt_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    {a.dt_fim ? new Date(a.dt_fim + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td style={{ color: 'var(--feed-muted)', fontSize: '0.85rem' }}>{a.descricao || '—'}</td>
                  <td><button className="ptf-btn-danger-sm" onClick={() => excluir(a.id)}>✕</button></td>
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
              <h3>Novo Ano Fiscal</h3>
              <button className="ptf-modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={salvar} className="ptf-modal-body">
              <label>Ano *
                <input
                  type="number"
                  value={form.ano}
                  onChange={(e) => setForm((f) => ({ ...f, ano: parseInt(e.target.value) }))}
                  min={2000} max={2100} required
                />
              </label>
              <div className="ptf-form-row">
                <label>Data de Início *
                  <input type="date" value={form.dt_inicio}
                    onChange={(e) => setForm((f) => ({ ...f, dt_inicio: e.target.value }))} required />
                </label>
                <label>Data de Fim *
                  <input type="date" value={form.dt_fim}
                    onChange={(e) => setForm((f) => ({ ...f, dt_fim: e.target.value }))} required />
                </label>
              </div>
              <label>Descrição
                <input value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Exercício fiscal 2025" />
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

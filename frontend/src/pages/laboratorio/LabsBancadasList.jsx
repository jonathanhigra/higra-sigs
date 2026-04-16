/**
 * 550 — Cadastro de Labs (laboratórios/bancadas disponíveis)
 */
import React, { useCallback, useEffect, useState } from 'react';
import { laboratorioService } from '../../services/laboratorio/laboratorioService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

export default function LabsBancadasList() {
  const { showToast } = useToast();
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ descricao: '', codigo: '', localizacao: '', capacidade: '' });

  const fetchLabs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await laboratorioService.listarLabs();
      setLabs(data?.items || []);
    } catch {
      showToast('Erro ao carregar bancadas', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchLabs(); }, [fetchLabs]);

  async function salvar(e) {
    e.preventDefault();
    if (!form.descricao.trim()) return showToast('Descrição obrigatória', 'error');
    setSaving(true);
    try {
      await laboratorioService.criarLab({
        descricao: form.descricao.trim(),
        codigo: form.codigo.trim() || null,
        localizacao: form.localizacao.trim() || null,
        capacidade: form.capacidade ? parseInt(form.capacidade) : null,
      });
      showToast('Bancada criada', 'success');
      setModal(false);
      setForm({ descricao: '', codigo: '', localizacao: '', capacidade: '' });
      fetchLabs();
    } catch {
      showToast('Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function excluir(id) {
    if (!window.confirm('Desativar bancada?')) return;
    try {
      await laboratorioService.excluirLab(id);
      showToast('Bancada desativada', 'success');
      fetchLabs();
    } catch {
      showToast('Erro ao excluir', 'error');
    }
  }

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Bancadas / Laboratórios</h1>
          <p className="ptf-subtitle">Cadastro de bancadas e laboratórios disponíveis para testes</p>
        </div>
        <button className="ptf-btn-primary" onClick={() => setModal(true)}>+ Nova Bancada</button>
      </div>

      {loading && <div className="ptf-loading">Carregando...</div>}

      {!loading && (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>Localização</th>
                <th>Capacidade</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {labs.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>
                  Nenhuma bancada cadastrada.
                </td></tr>
              ) : labs.map((lab) => (
                <tr key={lab.id}>
                  <td>{lab.codigo && <span className="ptf-rec-badge">{lab.codigo}</span>}</td>
                  <td><strong>{lab.descricao}</strong></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--feed-muted)' }}>{lab.localizacao || '—'}</td>
                  <td style={{ fontSize: '0.82rem' }}>{lab.capacidade ?? '—'}</td>
                  <td><button className="ptf-btn-danger-sm" onClick={() => excluir(lab.id)}>✕</button></td>
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
              <h3>Nova Bancada</h3>
              <button className="ptf-modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={salvar} className="ptf-modal-body">
              <div className="ptf-form-row">
                <label>Código
                  <input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                    placeholder="Ex: BANC-01" maxLength={50} />
                </label>
                <label>Descrição *
                  <input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                    placeholder="Nome da bancada" required />
                </label>
              </div>
              <label>Localização
                <input value={form.localizacao} onChange={(e) => setForm((f) => ({ ...f, localizacao: e.target.value }))}
                  placeholder="Ex: Galpão B, Sala 3" />
              </label>
              <label>Capacidade simultânea (testes)
                <input type="number" min={1} value={form.capacidade}
                  onChange={(e) => setForm((f) => ({ ...f, capacidade: e.target.value }))}
                  placeholder="Ex: 2" />
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

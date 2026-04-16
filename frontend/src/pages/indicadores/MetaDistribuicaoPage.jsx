/**
 * Meta Distribution page — distribute targets by Usuario, Trimestre or Vertical.
 * Route: /indicadores/:id/distribuicao
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { metaService } from '../../services/indicadores/metaService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

const TIPOS = [
  { value: 'USUARIO', label: 'Por Usuário' },
  { value: 'TRIMESTRE', label: 'Por Trimestre' },
  { value: 'VERTICAL', label: 'Por Vertical' },
];

const TRIMESTRES = ['Q1', 'Q2', 'Q3', 'Q4'];

export default function MetaDistribuicaoPage() {
  const { id: metaId } = useParams();
  const { showToast } = useToast();

  const [meta, setMeta] = useState(null);
  const [tab, setTab] = useState('USUARIO');
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tipo: 'USUARIO', referencia: '', valor_meta: '', percentual: '' });

  const fetchMeta = useCallback(async () => {
    try {
      const { data } = await metaService.obter(metaId);
      setMeta(data);
    } catch { /* silent */ }
  }, [metaId]);

  const fetchDistribuicao = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await metaService.listarDistribuicao(metaId, { tipo: tab });
      setItens(data?.items || []);
    } catch {
      showToast('Erro ao carregar distribuição', 'error');
    } finally {
      setLoading(false);
    }
  }, [metaId, tab, showToast]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchDistribuicao(); }, [fetchDistribuicao]);

  function openModal() {
    setForm({ tipo: tab, referencia: '', valor_meta: '', percentual: '' });
    setModal(true);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!form.referencia.trim()) return showToast('Referência obrigatória', 'error');
    setSaving(true);
    try {
      await metaService.criarDistribuicao(metaId, {
        tipo: form.tipo,
        referencia: form.referencia.trim(),
        valor_meta: parseFloat(form.valor_meta) || null,
        percentual: parseFloat(form.percentual) || null,
      });
      showToast('Distribuição adicionada', 'success');
      setModal(false);
      fetchDistribuicao();
    } catch {
      showToast('Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function excluir(itemId) {
    if (!window.confirm('Remover esta distribuição?')) return;
    try {
      await metaService.excluirDistribuicao(metaId, itemId);
      showToast('Removido', 'success');
      fetchDistribuicao();
    } catch {
      showToast('Erro ao excluir', 'error');
    }
  }

  const totalPerc = itens.reduce((s, i) => s + (parseFloat(i.percentual) || 0), 0);
  const totalValor = itens.reduce((s, i) => s + (parseFloat(i.valor_meta) || 0), 0);

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <Link to={`/indicadores`} style={{ color: 'var(--feed-muted)', fontSize: '0.82rem', textDecoration: 'none' }}>
            ← Indicadores
          </Link>
          <h1 className="ptf-title" style={{ marginTop: 4 }}>
            Distribuição de Meta{meta ? `: ${meta.descricao}` : ''}
          </h1>
          <p className="ptf-subtitle">Distribua a meta entre usuários, trimestres ou verticais</p>
        </div>
        <button className="ptf-btn-primary" onClick={openModal}>+ Adicionar</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TIPOS.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)} style={{
            padding: '6px 14px', borderRadius: 20,
            border: '1px solid var(--feed-border)',
            background: tab === t.value ? 'var(--color-primary)' : 'var(--feed-card)',
            color: tab === t.value ? '#fff' : 'var(--feed-muted)',
            cursor: 'pointer', fontSize: '0.82rem', fontWeight: tab === t.value ? 700 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {loading && <div className="ptf-loading">Carregando...</div>}

      {!loading && (
        <>
          {itens.length > 0 && (
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <span className="ptf-total-badge">
                {totalPerc.toFixed(1)}% alocado
              </span>
              {totalPerc > 100 && (
                <span className="ptf-total-badge" style={{ background: '#ef444422', color: '#ef4444' }}>
                  ⚠ Soma ultrapassa 100%
                </span>
              )}
              {totalPerc === 100 && (
                <span className="ptf-total-badge" style={{ background: '#22c55e22', color: '#22c55e' }}>
                  ✓ Distribuição completa
                </span>
              )}
            </div>
          )}

          <div className="ptf-table-wrap">
            <table className="ptf-table">
              <thead>
                <tr>
                  <th>Referência</th>
                  <th style={{ textAlign: 'right' }}>Valor Meta</th>
                  <th style={{ textAlign: 'right' }}>Percentual (%)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>
                    Nenhuma distribuição cadastrada para esta categoria.
                  </td></tr>
                ) : (
                  <>
                    {itens.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.referencia}</strong></td>
                        <td style={{ textAlign: 'right' }}>
                          {item.valor_meta != null ? item.valor_meta.toLocaleString('pt-BR') : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {item.percentual != null ? `${item.percentual}%` : '—'}
                        </td>
                        <td>
                          <button className="ptf-btn-danger-sm" onClick={() => excluir(item.id)}>✕</button>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 700, background: 'var(--feed-bg)' }}>
                      <td>Total</td>
                      <td style={{ textAlign: 'right' }}>{totalValor.toLocaleString('pt-BR')}</td>
                      <td style={{ textAlign: 'right', color: totalPerc > 100 ? '#ef4444' : totalPerc === 100 ? '#22c55e' : 'inherit' }}>
                        {totalPerc.toFixed(1)}%
                      </td>
                      <td></td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modal && (
        <div className="ptf-modal-overlay" onClick={() => setModal(false)}>
          <div className="ptf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ptf-modal-header">
              <h3>Adicionar Distribuição</h3>
              <button className="ptf-modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={salvar} className="ptf-modal-body">
              <label>Tipo
                <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                  {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label>
                {form.tipo === 'TRIMESTRE' ? 'Trimestre' : form.tipo === 'VERTICAL' ? 'Vertical' : 'Usuário'} *
                {form.tipo === 'TRIMESTRE' ? (
                  <select value={form.referencia} onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))}>
                    <option value="">Selecione</option>
                    {TRIMESTRES.map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                ) : (
                  <input
                    value={form.referencia}
                    onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))}
                    placeholder={form.tipo === 'USUARIO' ? 'Login do usuário' : 'Nome da vertical'}
                    required
                  />
                )}
              </label>
              <div className="ptf-form-row">
                <label>Valor Meta
                  <input type="number" step="any" value={form.valor_meta}
                    onChange={(e) => setForm((f) => ({ ...f, valor_meta: e.target.value }))}
                    placeholder="Ex: 1000" />
                </label>
                <label>Percentual (%)
                  <input type="number" step="0.01" min={0} max={100} value={form.percentual}
                    onChange={(e) => setForm((f) => ({ ...f, percentual: e.target.value }))}
                    placeholder="Ex: 25" />
                </label>
              </div>
              <div className="ptf-modal-actions">
                <button type="button" className="ptf-btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="ptf-btn-primary" disabled={saving}>Adicionar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

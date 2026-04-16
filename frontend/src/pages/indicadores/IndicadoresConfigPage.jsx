/**
 * Config page for Indicadores: Unidades de Medida, Tendências, Semáforos (Ranges).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { metaService } from '../../services/indicadores/metaService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

const CORES = [
  { value: 'verde', label: 'Verde', hex: '#22c55e' },
  { value: 'amarelo', label: 'Amarelo', hex: '#f59e0b' },
  { value: 'vermelho', label: 'Vermelho', hex: '#ef4444' },
];

const TIPOS_TENDENCIA = [
  { value: 'CRESCENTE', label: 'Crescente (maior = melhor)' },
  { value: 'DECRESCENTE', label: 'Decrescente (menor = melhor)' },
  { value: 'NEUTRO', label: 'Neutro' },
];

export default function IndicadoresConfigPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState('unidades');

  // Unidades
  const [unidades, setUnidades] = useState([]);
  const [uForm, setUForm] = useState({ descricao: '', sigla: '' });
  const [uModal, setUModal] = useState(false);

  // Tendências
  const [tendencias, setTendencias] = useState([]);
  const [tForm, setTForm] = useState({ descricao: '', tipo: 'CRESCENTE' });
  const [tModal, setTModal] = useState(false);

  // Semáforos
  const [semaforos, setSemaforos] = useState([]);
  const [sForm, setSForm] = useState({ descricao: '', cor: 'verde', vlr_min: '', vlr_max: '' });
  const [sModal, setSModal] = useState(false);

  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    const [u, t, s] = await Promise.all([
      metaService.listarUnidades().catch(() => ({ data: { items: [] } })),
      metaService.listarTendencias().catch(() => ({ data: { items: [] } })),
      metaService.listarSemaforos().catch(() => ({ data: { items: [] } })),
    ]);
    setUnidades(u.data?.items || []);
    setTendencias(t.data?.items || []);
    setSemaforos(s.data?.items || []);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Unidade handlers
  async function salvarUnidade(e) {
    e.preventDefault();
    if (!uForm.descricao.trim()) return showToast('Descrição obrigatória', 'error');
    setSaving(true);
    try {
      await metaService.criarUnidade({ descricao: uForm.descricao.trim(), sigla: uForm.sigla.trim() });
      showToast('Unidade criada', 'success');
      setUModal(false); setUForm({ descricao: '', sigla: '' });
      fetchAll();
    } catch { showToast('Erro ao salvar', 'error'); }
    finally { setSaving(false); }
  }

  async function excluirUnidade(id) {
    if (!window.confirm('Desativar?')) return;
    await metaService.excluirUnidade(id).then(fetchAll).catch(() => showToast('Erro', 'error'));
  }

  // Tendência handlers
  async function salvarTendencia(e) {
    e.preventDefault();
    if (!tForm.descricao.trim()) return showToast('Descrição obrigatória', 'error');
    setSaving(true);
    try {
      await metaService.criarTendencia({ descricao: tForm.descricao.trim(), tipo: tForm.tipo });
      showToast('Tendência criada', 'success');
      setTModal(false); setTForm({ descricao: '', tipo: 'CRESCENTE' });
      fetchAll();
    } catch { showToast('Erro ao salvar', 'error'); }
    finally { setSaving(false); }
  }

  async function excluirTendencia(id) {
    if (!window.confirm('Desativar?')) return;
    await metaService.excluirTendencia(id).then(fetchAll).catch(() => showToast('Erro', 'error'));
  }

  // Semáforo handlers
  async function salvarSemaforo(e) {
    e.preventDefault();
    if (!sForm.descricao.trim()) return showToast('Descrição obrigatória', 'error');
    setSaving(true);
    try {
      await metaService.criarSemaforo({
        descricao: sForm.descricao.trim(), cor: sForm.cor,
        vlr_min: parseFloat(sForm.vlr_min) || null,
        vlr_max: parseFloat(sForm.vlr_max) || null,
      });
      showToast('Semáforo criado', 'success');
      setSModal(false); setSForm({ descricao: '', cor: 'verde', vlr_min: '', vlr_max: '' });
      fetchAll();
    } catch { showToast('Erro ao salvar', 'error'); }
    finally { setSaving(false); }
  }

  async function excluirSemaforo(id) {
    if (!window.confirm('Excluir faixa?')) return;
    await metaService.excluirSemaforo(id).then(fetchAll).catch(() => showToast('Erro', 'error'));
  }

  const TABS = [
    { key: 'unidades', label: `Unidades de Medida (${unidades.length})` },
    { key: 'tendencias', label: `Tendências (${tendencias.length})` },
    { key: 'semaforos', label: `Semáforos / Ranges (${semaforos.length})` },
  ];

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Configurações de Indicadores</h1>
          <p className="ptf-subtitle">Unidades de medida, tendências e faixas de semáforo</p>
        </div>
        <button className="ptf-btn-primary" onClick={() => {
          if (tab === 'unidades') setUModal(true);
          else if (tab === 'tendencias') setTModal(true);
          else setSModal(true);
        }}>
          + Novo
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '6px 14px', borderRadius: 20,
            border: '1px solid var(--feed-border)',
            background: tab === t.key ? 'var(--color-primary)' : 'var(--feed-card)',
            color: tab === t.key ? '#fff' : 'var(--feed-muted)',
            cursor: 'pointer', fontSize: '0.82rem', fontWeight: tab === t.key ? 700 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Unidades */}
      {tab === 'unidades' && (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead><tr><th>Sigla</th><th>Descrição</th><th></th></tr></thead>
            <tbody>
              {unidades.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>Nenhuma unidade cadastrada.</td></tr>
              ) : unidades.map((u) => (
                <tr key={u.id}>
                  <td>{u.sigla && <span className="ptf-rec-badge">{u.sigla}</span>}</td>
                  <td><strong>{u.descricao}</strong></td>
                  <td><button className="ptf-btn-danger-sm" onClick={() => excluirUnidade(u.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tendências */}
      {tab === 'tendencias' && (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead><tr><th>Descrição</th><th>Tipo</th><th></th></tr></thead>
            <tbody>
              {tendencias.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>Nenhuma tendência cadastrada.</td></tr>
              ) : tendencias.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.descricao}</strong></td>
                  <td><span className="ptf-rec-badge">{t.tipo || '—'}</span></td>
                  <td><button className="ptf-btn-danger-sm" onClick={() => excluirTendencia(t.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Semáforos */}
      {tab === 'semaforos' && (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead><tr><th>Cor</th><th>Descrição</th><th>Mín.</th><th>Máx.</th><th></th></tr></thead>
            <tbody>
              {semaforos.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>Nenhum semáforo cadastrado.</td></tr>
              ) : semaforos.map((s) => {
                const cor = CORES.find((c) => c.value === s.cor);
                return (
                  <tr key={s.id}>
                    <td>
                      <span style={{
                        display: 'inline-block', width: 16, height: 16, borderRadius: '50%',
                        background: cor?.hex || '#6b7280', verticalAlign: 'middle',
                      }} />
                      {' '}{cor?.label || s.cor}
                    </td>
                    <td><strong>{s.descricao}</strong></td>
                    <td>{s.vlr_min ?? '—'}</td>
                    <td>{s.vlr_max ?? '—'}</td>
                    <td><button className="ptf-btn-danger-sm" onClick={() => excluirSemaforo(s.id)}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {uModal && (
        <div className="ptf-modal-overlay" onClick={() => setUModal(false)}>
          <div className="ptf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ptf-modal-header">
              <h3>Nova Unidade de Medida</h3>
              <button className="ptf-modal-close" onClick={() => setUModal(false)}>✕</button>
            </div>
            <form onSubmit={salvarUnidade} className="ptf-modal-body">
              <div className="ptf-form-row">
                <label>Sigla (ex: kg, h, %)
                  <input name="sigla" value={uForm.sigla} onChange={(e) => setUForm((f) => ({ ...f, sigla: e.target.value }))} maxLength={20} />
                </label>
                <label>Descrição *
                  <input name="descricao" value={uForm.descricao} onChange={(e) => setUForm((f) => ({ ...f, descricao: e.target.value }))} required />
                </label>
              </div>
              <div className="ptf-modal-actions">
                <button type="button" className="ptf-btn-secondary" onClick={() => setUModal(false)}>Cancelar</button>
                <button type="submit" className="ptf-btn-primary" disabled={saving}>Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tModal && (
        <div className="ptf-modal-overlay" onClick={() => setTModal(false)}>
          <div className="ptf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ptf-modal-header">
              <h3>Nova Tendência</h3>
              <button className="ptf-modal-close" onClick={() => setTModal(false)}>✕</button>
            </div>
            <form onSubmit={salvarTendencia} className="ptf-modal-body">
              <label>Descrição *
                <input value={tForm.descricao} onChange={(e) => setTForm((f) => ({ ...f, descricao: e.target.value }))} required />
              </label>
              <label>Tipo
                <select value={tForm.tipo} onChange={(e) => setTForm((f) => ({ ...f, tipo: e.target.value }))}>
                  {TIPOS_TENDENCIA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <div className="ptf-modal-actions">
                <button type="button" className="ptf-btn-secondary" onClick={() => setTModal(false)}>Cancelar</button>
                <button type="submit" className="ptf-btn-primary" disabled={saving}>Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sModal && (
        <div className="ptf-modal-overlay" onClick={() => setSModal(false)}>
          <div className="ptf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ptf-modal-header">
              <h3>Nova Faixa de Semáforo</h3>
              <button className="ptf-modal-close" onClick={() => setSModal(false)}>✕</button>
            </div>
            <form onSubmit={salvarSemaforo} className="ptf-modal-body">
              <label>Descrição * <input value={sForm.descricao} onChange={(e) => setSForm((f) => ({ ...f, descricao: e.target.value }))} required /></label>
              <label>Cor
                <select value={sForm.cor} onChange={(e) => setSForm((f) => ({ ...f, cor: e.target.value }))}>
                  {CORES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <div className="ptf-form-row">
                <label>Valor Mínimo <input type="number" step="any" value={sForm.vlr_min} onChange={(e) => setSForm((f) => ({ ...f, vlr_min: e.target.value }))} /></label>
                <label>Valor Máximo <input type="number" step="any" value={sForm.vlr_max} onChange={(e) => setSForm((f) => ({ ...f, vlr_max: e.target.value }))} /></label>
              </div>
              <div className="ptf-modal-actions">
                <button type="button" className="ptf-btn-secondary" onClick={() => setSModal(false)}>Cancelar</button>
                <button type="submit" className="ptf-btn-primary" disabled={saving}>Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

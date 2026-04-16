/**
 * 534 — Histórico de Metas (anos anteriores) — comparativo entre períodos.
 */
import React, { useEffect, useState } from 'react';
import { metaService } from '../../services/indicadores/metaService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

const ANO_ATUAL = new Date().getFullYear();
const ANOS = Array.from({ length: 5 }, (_, i) => ANO_ATUAL - i);

export default function MetaHistoricoPage() {
  const { showToast } = useToast();
  const [metas, setMetas] = useState([]);
  const [anoSel, setAnoSel] = useState(ANO_ATUAL - 1);
  const [loading, setLoading] = useState(false);
  const [vertical, setVertical] = useState('');

  useEffect(() => { buscar(); }, [anoSel]);

  async function buscar() {
    setLoading(true);
    try {
      const params = { per_page: 200 };
      if (vertical) params.vertical = vertical;
      const { data } = await metaService.listar(params);
      setMetas(data?.items || []);
    } catch {
      showToast('Erro ao carregar histórico', 'error');
    } finally {
      setLoading(false);
    }
  }

  const metasFiltradas = vertical
    ? metas.filter((m) => (m.vertical || '').toLowerCase().includes(vertical.toLowerCase()))
    : metas;

  function exportCSV() {
    const rows = [
      ['ID', 'Descrição', 'Sigla', 'Frequência', 'Meta', 'Mínima', 'Vertical', 'Responsável'],
      ...metasFiltradas.map((m) => [
        m.id, m.descricao, m.sigla || '', m.frequencia || '',
        m.meta_valor || '', m.meta_minima || '', m.vertical || '', m.responsavel_nome || '',
      ]),
    ];
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `historico_metas_${anoSel}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Histórico de Metas</h1>
          <p className="ptf-subtitle">Consulta de metas e indicadores de períodos anteriores</p>
        </div>
        {metasFiltradas.length > 0 && (
          <button className="ptf-btn-secondary" onClick={exportCSV}>↓ Exportar CSV</button>
        )}
      </div>

      <div className="ptf-filters-bar" style={{ marginBottom: 20 }}>
        <label>
          Ano de referência
          <select value={anoSel} onChange={(e) => setAnoSel(parseInt(e.target.value))}>
            {ANOS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label>
          Vertical
          <input value={vertical} onChange={(e) => setVertical(e.target.value)} placeholder="Todas" />
        </label>
        <button className="ptf-btn-primary" onClick={buscar} disabled={loading}>
          {loading ? 'Carregando...' : 'Buscar'}
        </button>
        {metasFiltradas.length > 0 && (
          <span className="ptf-total-badge">{metasFiltradas.length} meta{metasFiltradas.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {loading && <div className="ptf-loading">Carregando histórico...</div>}

      {!loading && (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Sigla</th>
                <th>Frequência</th>
                <th style={{ textAlign: 'right' }}>Meta</th>
                <th style={{ textAlign: 'right' }}>Mínima</th>
                <th>Vertical</th>
                <th>Responsável</th>
              </tr>
            </thead>
            <tbody>
              {metasFiltradas.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>
                  Nenhuma meta encontrada.
                </td></tr>
              ) : metasFiltradas.map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.descricao}</strong></td>
                  <td>{m.sigla && <span className="ptf-rec-badge">{m.sigla}</span>}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--feed-muted)' }}>{m.frequencia || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {m.meta_valor != null ? parseFloat(m.meta_valor).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {m.meta_minima != null ? parseFloat(m.meta_minima).toLocaleString('pt-BR') : '—'}
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{m.vertical || '—'}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--feed-muted)' }}>{m.responsavel_nome || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

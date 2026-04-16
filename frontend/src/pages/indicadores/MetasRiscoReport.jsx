/**
 * 528 — Relatório "Metas em Risco" com projeção linear vs alvo.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { metaService } from '../../services/indicadores/metaService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

export default function MetasRiscoReport() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [filters, setFilters] = useState({ threshold: 70, vertical: '' });
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);

  async function buscar() {
    setLoading(true);
    try {
      const params = { threshold: filters.threshold };
      if (filters.vertical) params.vertical = filters.vertical;
      const { data } = await metaService.relatorioRisco(params);
      setDados(data);
    } catch {
      showToast('Erro ao gerar relatório', 'error');
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    if (!dados?.metas?.length) return;
    const rows = [
      ['ID', 'Descrição', 'Vertical', 'Meta', 'Realizado', '% Realizado', 'Gap'],
      ...dados.metas.map((m) => [
        m.id, m.descricao, m.vertical || '', m.vlr_meta, m.vlr_atual,
        m.pct_realizado, m.gap,
      ]),
    ];
    const csv = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'metas_em_risco.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function getRiskColor(pct) {
    if (pct < 50) return '#ef4444';
    if (pct < 70) return '#f59e0b';
    return '#3b82f6';
  }

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Metas em Risco</h1>
          <p className="ptf-subtitle">Metas abaixo do percentual de realização esperado</p>
        </div>
        {dados?.metas?.length > 0 && (
          <button className="ptf-btn-secondary" onClick={exportCSV}>↓ Exportar CSV</button>
        )}
      </div>

      <div className="ptf-filters-bar" style={{ marginBottom: 20 }}>
        <label>
          Limite (% realizado)
          <input
            type="number"
            value={filters.threshold}
            onChange={(e) => setFilters((f) => ({ ...f, threshold: parseFloat(e.target.value) || 70 }))}
            min={0} max={100} step={5} style={{ width: 80 }}
          />
        </label>
        <label>
          Vertical
          <input
            value={filters.vertical}
            onChange={(e) => setFilters((f) => ({ ...f, vertical: e.target.value }))}
            placeholder="Todas"
          />
        </label>
        <button className="ptf-btn-primary" onClick={buscar} disabled={loading}>
          {loading ? 'Carregando...' : 'Gerar Relatório'}
        </button>
        {dados && (
          <span className="ptf-total-badge" style={{ background: '#ef444422', color: '#ef4444' }}>
            {dados.total} meta{dados.total !== 1 ? 's' : ''} em risco
          </span>
        )}
      </div>

      {!dados && !loading && (
        <div className="ptf-empty">Configure o filtro e clique em "Gerar Relatório".</div>
      )}
      {loading && <div className="ptf-loading">Gerando relatório...</div>}

      {dados && !loading && dados.total === 0 && (
        <div className="ptf-empty" style={{ color: '#22c55e' }}>
          Nenhuma meta em risco abaixo de {dados.threshold}% de realização.
        </div>
      )}

      {dados && !loading && dados.total > 0 && (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead>
              <tr>
                <th>Meta</th>
                <th>Vertical</th>
                <th style={{ textAlign: 'right' }}>Alvo</th>
                <th style={{ textAlign: 'right' }}>Realizado</th>
                <th style={{ textAlign: 'right' }}>Gap</th>
                <th style={{ textAlign: 'center' }}>% Real.</th>
                <th style={{ textAlign: 'center' }}>Progresso</th>
              </tr>
            </thead>
            <tbody>
              {dados.metas.map((m) => (
                <tr key={m.id} style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/indicadores/${m.id}`)}>
                  <td><strong>{m.descricao}</strong></td>
                  <td>
                    {m.vertical && (
                      <span className="ptf-rec-badge">{m.vertical}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                    {m.vlr_meta?.toLocaleString('pt-BR')}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                    {m.vlr_atual?.toLocaleString('pt-BR')}
                  </td>
                  <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: 700, fontSize: '0.85rem' }}>
                    -{parseFloat(m.gap || 0).toLocaleString('pt-BR')}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{
                      fontWeight: 700, fontSize: '0.85rem',
                      color: getRiskColor(parseFloat(m.pct_realizado)),
                    }}>
                      {m.pct_realizado}%
                    </span>
                  </td>
                  <td style={{ minWidth: 120 }}>
                    <div style={{
                      background: 'var(--feed-border)', borderRadius: 4, height: 8, overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${Math.min(100, parseFloat(m.pct_realizado))}%`,
                        background: getRiskColor(parseFloat(m.pct_realizado)),
                        height: '100%', borderRadius: 4, transition: 'width 0.3s',
                      }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

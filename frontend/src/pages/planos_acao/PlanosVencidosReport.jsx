import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { planoService } from '../../services/planos_acao/planoService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

const ORIGENS = [
  { value: '', label: 'Todas as origens' },
  { value: 'GAC', label: 'GAC (Plano de Ação)' },
  { value: 'RQ03', label: 'RQ03 (Não Conformidade)' },
  { value: 'RQ49', label: 'RQ49 (Oportunidade)' },
  { value: 'RQ80', label: 'RQ80 (Auditoria)' },
  { value: 'META', label: 'Meta' },
];

export default function PlanosVencidosReport() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [filters, setFilters] = useState({ dias_vencimento: 0, origem_tipo: '' });
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);

  async function buscar() {
    setLoading(true);
    try {
      const params = { dias_vencimento: filters.dias_vencimento };
      if (filters.origem_tipo) params.origem_tipo = filters.origem_tipo;
      const { data } = await planoService.relatorioVencidos(params);
      setDados(data);
    } catch {
      showToast('Erro ao gerar relatório', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleFilter(e) {
    setFilters((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  const responsaveis = dados ? Object.entries(dados.por_responsavel || {}) : [];

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Relatório — Planos Vencidos</h1>
          <p className="ptf-subtitle">Planos de ação com prazo vencido ou próximos do vencimento</p>
        </div>
      </div>

      <div className="ptf-filters-bar" style={{ marginBottom: 20 }}>
        <label>
          Incluir próximos (dias)
          <input
            type="number"
            name="dias_vencimento"
            value={filters.dias_vencimento}
            onChange={handleFilter}
            min={0}
            max={365}
            style={{ width: 80 }}
          />
        </label>
        <label>
          Origem
          <select name="origem_tipo" value={filters.origem_tipo} onChange={handleFilter}>
            {ORIGENS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <button className="ptf-btn-primary" onClick={buscar} disabled={loading}>
          {loading ? 'Carregando...' : 'Gerar Relatório'}
        </button>
        {dados && (
          <span className="ptf-total-badge" style={{ background: '#ef444422', color: '#ef4444' }}>
            {dados.total} plano{dados.total !== 1 ? 's' : ''} vencido{dados.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!dados && !loading && (
        <div className="ptf-empty">Configure os filtros e clique em "Gerar Relatório".</div>
      )}

      {loading && <div className="ptf-loading">Gerando relatório...</div>}

      {dados && !loading && dados.total === 0 && (
        <div className="ptf-empty" style={{ color: '#22c55e' }}>
          Nenhum plano vencido encontrado para os filtros selecionados.
        </div>
      )}

      {dados && !loading && dados.total > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {responsaveis.map(([responsavel, itens]) => (
            <div key={responsavel} className="ptf-table-wrap">
              <div style={{
                padding: '10px 14px',
                background: 'var(--feed-card)',
                borderBottom: '1px solid var(--feed-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontWeight: 700, color: 'var(--feed-text)' }}>{responsavel}</span>
                <span style={{
                  background: '#ef444422', color: '#ef4444',
                  padding: '2px 8px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600,
                }}>
                  {itens.length} item{itens.length !== 1 ? 's' : ''}
                </span>
              </div>
              <table className="ptf-table">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Origem</th>
                    <th>Status</th>
                    <th>Prazo</th>
                    <th>Atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((p) => (
                    <tr key={p.id} style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/planos-acao/${p.id}`)}>
                      <td><strong>{p.titulo}</strong></td>
                      <td>
                        {p.origem_tipo && (
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 600, padding: '2px 6px',
                            borderRadius: 6, background: '#3b82f622', color: '#3b82f6',
                          }}>
                            {p.origem_tipo}
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 600, padding: '2px 6px',
                          borderRadius: 6, background: '#f59e0b22', color: '#f59e0b',
                        }}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {p.dt_prazo ? new Date(p.dt_prazo + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td>
                        {p.dias_atraso > 0 ? (
                          <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.82rem' }}>
                            {p.dias_atraso}d atraso
                          </span>
                        ) : (
                          <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.82rem' }}>
                            vence em breve
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

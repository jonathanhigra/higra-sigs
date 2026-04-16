/**
 * Focco ERP — Pedidos de Venda (read-only)
 *
 * Lista PVs sincronizados do ERP Focco com busca, paginação e detalhe inline.
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { foccoService } from '../../services/projetos/foccoService';
import Icon from '../../components/Icon';
import { StatusBadge, Breadcrumbs } from '../../components/ui';
import { SkeletonSimpleTable } from '../../components/SkeletonPlanos';
import Modal from '../../components/Modal';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';
import './FoccoPV.css';

const STATUS_COLORS = {
  ABERTO: '#00A0DF',
  FATURADO: '#4caf50',
  PARCIAL: '#ff9800',
  CANCELADO: '#ef4444',
  ENCERRADO: '#6b7280',
};

const formatCurrency = (v) => {
  if (v == null) return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatDate = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return d; }
};

export default function FoccoPVList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [statusInfo, setStatusInfo] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Detalhe modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailPV, setDetailPV] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const toast = useToast();

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, per_page: 25 };
      if (searchDebounced) params.q = searchDebounced;
      const { data } = await foccoService.listarPVs(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Erro ao carregar PVs do Focco');
    } finally {
      setLoading(false);
    }
  }, [page, searchDebounced]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    foccoService.status().then(r => setStatusInfo(r.data)).catch(() => {});
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await foccoService.sync(90);
      toast.success(`Sincronização concluída: ${data.upserted} PVs atualizados`);
      fetchData();
      foccoService.status().then(r => setStatusInfo(r.data)).catch(() => {});
    } catch (err) {
      const msg = err.response?.data?.detail || 'Erro na sincronização';
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  };

  const openDetail = async (numeroPv) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailPV(null);
    try {
      const { data } = await foccoService.obterPV(numeroPv);
      setDetailPV(data);
    } catch {
      toast.error('Erro ao carregar detalhe do PV');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="page-container">
      <Breadcrumbs items={[
        { label: 'Projetos', to: '/projetos' },
        { label: 'Focco ERP — Pedidos de Venda' },
      ]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Icon name="truck" size={24} /> Pedidos de Venda (Focco ERP)
          </h1>
          {statusInfo && (
            <p className="page-subtitle">
              {statusInfo.total_pvs_cache} PVs em cache
              {statusInfo.ultima_sync && (
                <> &middot; Última sync: {formatDate(statusInfo.ultima_sync)}</>
              )}
              {!statusInfo.configurado && (
                <span className="focco-badge focco-badge--warning"> ERP não configurado</span>
              )}
            </p>
          )}
        </div>
        <div className="page-actions">
          <button
            className="btn btn-secondary"
            onClick={handleSync}
            disabled={syncing}
          >
            <Icon name="refresh-cw" size={16} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </div>

      <div className="filters-bar">
        <input
          type="text"
          className="input-search"
          placeholder="Buscar por nº PV, cliente, CNPJ ou vendedor..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {loading ? (
        <SkeletonSimpleTable rows={8} cols={6} />
      ) : items.length === 0 ? (
        <div className="empty-state">
          <Icon name="package" size={48} />
          <p>Nenhum PV encontrado{searchDebounced ? ` para "${searchDebounced}"` : ''}.</p>
          {!statusInfo?.configurado && (
            <p className="text-muted">Configure FOCCO_DB_HOST no .env para ativar a integração.</p>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nº PV</th>
                  <th>Data Pedido</th>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th className="text-right">Valor Total</th>
                  <th>Status</th>
                  <th>Entrega</th>
                </tr>
              </thead>
              <tbody>
                {items.map(pv => (
                  <tr
                    key={pv.numero_pv}
                    className="clickable-row"
                    onClick={() => openDetail(pv.numero_pv)}
                  >
                    <td><strong>{pv.numero_pv}</strong></td>
                    <td>{formatDate(pv.dt_pedido)}</td>
                    <td>
                      <div>{pv.cliente_razao || '—'}</div>
                      {pv.cliente_cnpj && (
                        <small className="text-muted">{pv.cliente_cnpj}</small>
                      )}
                    </td>
                    <td>{pv.vendedor_nome || '—'}</td>
                    <td className="text-right">{formatCurrency(pv.vlr_total)}</td>
                    <td>
                      <StatusBadge
                        status={pv.status_focco || 'ABERTO'}
                        color={STATUS_COLORS[(pv.status_focco || '').toUpperCase()] || '#6b7280'}
                      />
                    </td>
                    <td>{formatDate(pv.dt_entrega)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
              <span>Página {page} de {totalPages} ({total} registros)</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</button>
            </div>
          )}
        </>
      )}

      {/* Modal de detalhe do PV */}
      {detailOpen && (
        <Modal title={`PV ${detailPV?.numero_pv || ''}`} onClose={() => setDetailOpen(false)} wide>
          {detailLoading ? (
            <div className="loading-spinner">Carregando...</div>
          ) : detailPV ? (
            <div className="focco-pv-detail">
              <div className="focco-pv-detail__grid">
                <div className="info-pair">
                  <label>Nº PV</label>
                  <span>{detailPV.numero_pv}</span>
                </div>
                <div className="info-pair">
                  <label>Data Pedido</label>
                  <span>{formatDate(detailPV.dt_pedido)}</span>
                </div>
                <div className="info-pair">
                  <label>Data Entrega</label>
                  <span>{formatDate(detailPV.dt_entrega)}</span>
                </div>
                <div className="info-pair">
                  <label>Status</label>
                  <StatusBadge
                    status={detailPV.status_focco || 'ABERTO'}
                    color={STATUS_COLORS[(detailPV.status_focco || '').toUpperCase()] || '#6b7280'}
                  />
                </div>
                <div className="info-pair">
                  <label>Valor Total</label>
                  <span className="focco-value">{formatCurrency(detailPV.vlr_total)}</span>
                </div>
                <div className="info-pair">
                  <label>Cond. Pagamento</label>
                  <span>{detailPV.cond_pagamento || '—'}</span>
                </div>
              </div>

              <div className="focco-pv-detail__section">
                <h3>Cliente</h3>
                <p><strong>{detailPV.cliente_razao || '—'}</strong></p>
                {detailPV.cliente_cnpj && <p className="text-muted">CNPJ: {detailPV.cliente_cnpj}</p>}
                {detailPV.cliente_codigo && <p className="text-muted">Código: {detailPV.cliente_codigo}</p>}
              </div>

              <div className="focco-pv-detail__section">
                <h3>Vendedor</h3>
                <p>{detailPV.vendedor_nome || '—'}</p>
                {detailPV.cod_representante && <p className="text-muted">Representante: {detailPV.cod_representante}</p>}
              </div>

              {detailPV.observacao && (
                <div className="focco-pv-detail__section">
                  <h3>Observações</h3>
                  <p className="focco-obs">{detailPV.observacao}</p>
                </div>
              )}

              {detailPV.itens && detailPV.itens.length > 0 && (
                <div className="focco-pv-detail__section">
                  <h3>Itens ({detailPV.itens.length})</h3>
                  <table className="data-table data-table--compact">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Produto</th>
                        <th>Descrição</th>
                        <th className="text-right">Qtd</th>
                        <th className="text-right">Vlr Unit.</th>
                        <th className="text-right">Total</th>
                        <th>Entrega</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailPV.itens.map((it, idx) => (
                        <tr key={idx}>
                          <td>{it.item_seq || idx + 1}</td>
                          <td><code>{it.cod_produto}</code></td>
                          <td>{it.produto_descricao || '—'}</td>
                          <td className="text-right">{it.quantidade} {it.unidade || ''}</td>
                          <td className="text-right">{formatCurrency(it.vlr_unitario)}</td>
                          <td className="text-right">{formatCurrency(it.vlr_total_item)}</td>
                          <td>{formatDate(it.dt_entrega_item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detailPV.projetos_vinculados && detailPV.projetos_vinculados.length > 0 && (
                <div className="focco-pv-detail__section">
                  <h3>Projetos Vinculados</h3>
                  <ul className="focco-linked-projects">
                    {detailPV.projetos_vinculados.map(p => (
                      <li key={p.id}>
                        <a href={`/projetos/${p.id}`}>{p.titulo}</a>
                        {p.codigo && <span className="text-muted"> ({p.codigo})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </Modal>
      )}
    </div>
  );
}

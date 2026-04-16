/**
 * 692 — Centro de Notificações (lista + filtros + marcar como lido).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

const MODULO_COLORS = {
  TAREFA: '#3b82f6',
  REUNIAO: '#8b5cf6',
  QUALIDADE: '#ef4444',
  PROJETOS: '#22c55e',
  INDICADORES: '#f59e0b',
  ASSISTENCIA: '#f97316',
};

export default function CentroNotificacoes() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [notifs, setNotifs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [somenteNaoLidas, setSomenteNaoLidas] = useState(false);
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  const fetchNotifs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/home/notificacoes', {
        params: { page, per_page: PER_PAGE, somente_nao_lidas: somenteNaoLidas },
      });
      setNotifs(data?.items || []);
      setTotal(data?.total || 0);
    } catch {
      showToast('Erro ao carregar notificações', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, somenteNaoLidas, showToast]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  async function marcarLida(id) {
    await api.patch(`/api/home/notificacoes/${id}/ler`).catch(() => {});
    fetchNotifs();
  }

  async function marcarTodas() {
    await api.patch('/api/home/notificacoes/ler-todas').catch(() => {});
    showToast('Todas marcadas como lidas', 'success');
    fetchNotifs();
  }

  const naoLidas = notifs.filter((n) => n.lida === 'N').length;

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Centro de Notificações</h1>
          <p className="ptf-subtitle">
            {total} notificação{total !== 1 ? 'ões' : ''}
            {naoLidas > 0 && ` • ${naoLidas} não lida${naoLidas !== 1 ? 's' : ''}`}
          </p>
        </div>
        {naoLidas > 0 && (
          <button className="ptf-btn-secondary" onClick={marcarTodas}>
            ✓ Marcar todas como lidas
          </button>
        )}
      </div>

      <div className="ptf-filters-bar" style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={somenteNaoLidas}
            onChange={(e) => { setSomenteNaoLidas(e.target.checked); setPage(1); }} />
          Somente não lidas
        </label>
      </div>

      {loading && <div className="ptf-loading">Carregando...</div>}

      {!loading && notifs.length === 0 && (
        <div className="ptf-empty">
          {somenteNaoLidas ? 'Nenhuma notificação não lida.' : 'Nenhuma notificação encontrada.'}
        </div>
      )}

      {!loading && notifs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifs.map((n) => (
            <div key={n.id} style={{
              display: 'flex', gap: 12, padding: 14,
              background: n.lida === 'N' ? 'var(--feed-card)' : 'var(--feed-bg)',
              border: `1px solid ${n.lida === 'N' ? 'var(--color-primary)44' : 'var(--feed-border)'}`,
              borderRadius: 10, alignItems: 'flex-start', cursor: n.link ? 'pointer' : 'default',
            }}
              onClick={() => { if (n.link) { marcarLida(n.id); navigate(n.link); } }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                background: n.lida === 'N' ? 'var(--color-primary)' : 'transparent',
                border: `2px solid ${n.lida === 'N' ? 'var(--color-primary)' : 'var(--feed-border)'}`,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <strong style={{
                    fontSize: '0.88rem', color: 'var(--feed-text)',
                    fontWeight: n.lida === 'N' ? 700 : 400,
                  }}>{n.titulo}</strong>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                    {n.modulo && (
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                        background: `${MODULO_COLORS[n.modulo] || '#6b7280'}22`,
                        color: MODULO_COLORS[n.modulo] || '#6b7280',
                      }}>{n.modulo}</span>
                    )}
                    {n.lida === 'N' && (
                      <button onClick={(e) => { e.stopPropagation(); marcarLida(n.id); }} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '0.7rem', color: 'var(--feed-muted)', padding: '2px 4px',
                      }} title="Marcar como lida">✓</button>
                    )}
                  </div>
                </div>
                {n.mensagem && (
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--feed-muted)', lineHeight: 1.4 }}>
                    {n.mensagem}
                  </p>
                )}
                <div style={{ fontSize: '0.72rem', color: 'var(--feed-muted)', marginTop: 4 }}>
                  {n.created_at ? new Date(n.created_at).toLocaleString('pt-BR') : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > PER_PAGE && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="ptf-btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            ← Anterior
          </button>
          <span style={{ color: 'var(--feed-muted)', fontSize: '0.82rem', padding: '6px 0' }}>
            Página {page} de {Math.ceil(total / PER_PAGE)}
          </span>
          <button className="ptf-btn-secondary" onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / PER_PAGE)}>
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
}

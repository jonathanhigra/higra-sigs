/**
 * APEX pg 21 — Ranking de Usuários
 * Tabela com posição, avatar, nome, XP total, total de ações
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { gamificacaoService } from '../../services/lovService';
import { Spinner, EmptyState } from '../../components/ui';
import '../tarefas/TarefasList.css';

export default function Ranking() {
  const [ranking, setRanking] = useState([]);
  const [meuXp, setMeuXp] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [rankRes, xpRes] = await Promise.all([
          gamificacaoService.ranking(),
          gamificacaoService.meuXp(),
        ]);
        setRanking(rankRes.data.items || []);
        setMeuXp(xpRes.data);
      } catch { toast.error('Erro ao carregar ranking'); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="tarefas-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}><Spinner size="lg" /></div>;

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Ranking de Usuários</h1>
      </div>

      {/* Meu XP */}
      {meuXp && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 20, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Meu XP Total</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>{meuXp.total_xp.toLocaleString('pt-BR')} XP</div>
          </div>
          {meuXp.historico && meuXp.historico.length > 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Última ação: {meuXp.historico[0].tipo} (+{meuXp.historico[0].pontos} XP)
            </div>
          )}
        </div>
      )}

      {/* Tabela ranking */}
      {ranking.length === 0 ? <EmptyState variant="empty" title="Nenhuma pontuação registrada" description="As pontuações aparecem aqui quando usuários completam tarefas e ações." /> : (
        <table className="data-table">
          <thead><tr><th style={{ width: 50 }}>#</th><th>Usuário</th><th>XP Total</th><th>Ações</th></tr></thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', color: i < 3 ? ['#FFD700', '#C0C0C0', '#CD7F32'][i] : 'var(--text-muted)' }}>
                  {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                </td>
                <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
                    {(r.name || '?')[0].toUpperCase()}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.email}</div>
                  </div>
                </td>
                <td style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '1.1rem' }}>{r.total_xp.toLocaleString('pt-BR')}</td>
                <td>{r.total_acoes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

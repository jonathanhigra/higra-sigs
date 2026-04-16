import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { homeService } from '../../services/home/homeService';
import { gamificacaoService } from '../../services/lovService';
import Icon from '../../components/Icon';
import { StatCard } from '../../components/ui';
import './HomeDashboard.css';

const MODULOS = [
  { key: 'GES',  label: 'Indicadores', to: '/indicadores',     icon: <><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></> },
  { key: 'PRJT', label: 'Projetos',    to: '/projetos',        icon: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></> },
  { key: 'RNOE', label: 'Reuniões',    to: '/reunioes',        icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></> },
  { key: 'RNCO', label: 'Não Conform.',to: '/qualidade/rq03',  icon: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></> },
  { key: 'CHKL', label: 'Produção',    to: '/fabricacao',      icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06" /></> },
  { key: 'LABS', label: 'Laboratório', to: '/laboratorio',     icon: <><path d="M9 3h6v2H9z" /><path d="M10 5v6.5L6 20h12l-4-8.5V5" /></> },
];

export default function HomeDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [top5, setTop5] = useState([]);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        const { data: d } = await homeService.dashboard();
        setData(d);
      } catch {
        toast.error('Erro ao carregar dashboard');
      } finally {
        setLoading(false);
      }
      try {
        const r = await gamificacaoService.ranking({ per_page: 5 });
        setTop5(r.data.items || []);
      } catch { /* ranking é opcional */ }
    })();
  }, []);

  if (loading) return <div className="home-dashboard"><div className="home-empty">Carregando...</div></div>;
  if (!data) return <div className="home-dashboard"><div className="home-empty">Erro ao carregar</div></div>;

  const { contadores = {}, tarefas_pendentes = [], permissoes = {},
          projetos = {}, rq03 = {}, reunioes = {} } = data;
  const userName = localStorage.getItem('user_name');

  return (
    <div className="home-dashboard">
      <h1>{userName ? `Bem-vindo, ${userName}` : 'Painel SIGS'}</h1>

      <div className="home-cards">
        <StatCard label="Tarefas Abertas" value={contadores.abertas || 0} onClick={() => navigate('/tarefas')} />
        <StatCard label="Tarefas Atrasadas" value={contadores.atrasadas || 0} color="var(--status-atrasada, #ef4444)" onClick={() => navigate('/tarefas')} />
        <StatCard label="Projetos Ativos" value={projetos.ativos || 0} color="var(--color-info, #3b82f6)" onClick={() => navigate('/projetos')} />
        <StatCard label="RNCs Abertas" value={rq03.abertas || 0} color="var(--color-warning, #ff9800)" onClick={() => navigate('/qualidade/rq03')} />
      </div>

      {(reunioes.proximas || 0) > 0 && (
        <div className="home-reunioes-badge" style={{ cursor: 'pointer' }} onClick={() => navigate('/reunioes')}>
          <Icon><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Icon>
          <span>{reunioes.proximas} {reunioes.proximas === 1 ? 'reunião' : 'reuniões'} nos próximos 7 dias</span>
        </div>
      )}

      <div className="home-section">
        <h2>Minhas tarefas pendentes</h2>
        {tarefas_pendentes.length === 0 ? (
          <div className="home-empty">Nenhuma tarefa pendente</div>
        ) : (
          <div className="home-tarefas-list">
            {tarefas_pendentes.map(t => (
              <div key={t.id} className="home-tarefa-item" onClick={() => navigate(`/tarefas/${t.id}`)}>
                <div className="home-tarefa-info">
                  <div className="titulo">{t.titulo}</div>
                  <div className="meta">
                    {t.dt_previsao && `Prazo: ${new Date(t.dt_previsao).toLocaleDateString('pt-BR')}`}
                    {t.percentual > 0 && ` · ${t.percentual}%`}
                  </div>
                </div>
                {t.prioridade && (
                  <span className={`prioridade-badge ${(t.prioridade || '').toLowerCase()}`}>
                    {t.prioridade}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {top5.length > 0 && (
        <div className="home-section">
          <h2>Top 5 — Ranking de Desempenho</h2>
          <div className="home-top5-list">
            {top5.map((r, i) => (
              <div key={r.id} className="home-top5-item" onClick={() => navigate('/indicadores/ranking')}>
                <span className="home-top5-pos" style={{ color: i < 3 ? ['#FFD700','#C0C0C0','#CD7F32'][i] : 'var(--text-muted)' }}>
                  {i < 3 ? ['🥇','🥈','🥉'][i] : `${i+1}º`}
                </span>
                <span className="home-top5-avatar">{(r.name || '?')[0].toUpperCase()}</span>
                <span className="home-top5-name">{r.name || '—'}</span>
                <span className="home-top5-xp">{(r.total_xp || 0).toLocaleString('pt-BR')} XP</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="home-section">
        <h2>Acesso rápido</h2>
        <div className="home-modulos">
          <Link to="/tarefas" className="home-modulo-card">
            <span className="modulo-icon"><Icon><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Icon></span>
            <span className="modulo-label">Tarefas</span>
          </Link>
          {MODULOS.filter(m => permissoes[m.key]).map(m => (
            <Link key={m.key} to={m.to} className="home-modulo-card">
              <span className="modulo-icon"><Icon>{m.icon}</Icon></span>
              <span className="modulo-label">{m.label}</span>
            </Link>
          ))}
          {MODULOS.filter(m => permissoes[m.key]).length === 0 && (
            <span className="home-empty" style={{ fontSize: '0.82rem', padding: '8px 0' }}>Nenhum módulo disponível para seu perfil</span>
          )}
        </div>
      </div>
    </div>
  );
}

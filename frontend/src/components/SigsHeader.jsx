/**
 * SIGS Header — Banner estilo APEX pg Inicial
 * Mostra: avatar + nome + empresa/filial, atalhos rápidos, stats, tabs tarefas
 * Inserido no topo do Feed para fusão Painel SIGS + Página Inicial
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import { homeService } from '../services/home/homeService';
import Icon from './Icon';
import './SigsHeader.css';

const ATALHOS = [
  { to: '/planos-acao', label: 'Plano de Acao', icon: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />, perm: 'GACO' },
  { to: '/qualidade/rq49', label: 'NO', icon: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>, perm: 'CMNA' },
  { to: '/tarefas', label: 'Tarefa', icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></> },
  { to: '/comunicacao', label: 'Evento', icon: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>, perm: 'EVT' },
  { to: '/indicadores/ranking', label: 'Ranking', icon: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 22V8a2 2 0 1 1 4 0v14" /></> },
  { to: '/projetos', label: 'Projeto', icon: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>, perm: 'PRJT' },
];

export default function SigsHeader({ onTabChange }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('feed');
  useEffect(() => { if (onTabChange) onTabChange(tab); }, [tab, onTabChange]);
  const navigate = useNavigate();
  const hasPermission = useAuthStore(s => s.hasPermission);
  const filial = useAuthStore(s => s.filial);
  const userName = localStorage.getItem('user_name') || 'Usuario';
  const photoSrc = null; // TODO: from authStore if needed

  useEffect(() => {
    homeService.dashboard().then(({ data: d }) => setData(d)).catch(() => {});
  }, []);

  const contadores = data?.contadores || {};
  const kanban = data?.kanban || [];
  const projetos = data?.projetos || {};
  const rq03 = data?.rq03 || {};
  const reunioes = data?.reunioes || {};

  return (
    <div className="sigs-header">
      {/* Banner */}
      <div className="sigs-banner">
        <div className="sigs-banner-overlay">
          <div className="sigs-banner-user">
            <div className="sigs-user-avatar">
              {photoSrc ? <img src={photoSrc} alt="" /> : <span>{userName[0]?.toUpperCase()}</span>}
            </div>
            <div className="sigs-user-info">
              <h2>{userName}</h2>
              <span>{filial?.empresaNome || 'Grupo Higra'} &gt; {filial?.nome || 'Diretoria'}</span>
            </div>
          </div>
          <div className="sigs-atalhos">
            {ATALHOS.filter(a => !a.perm || hasPermission(a.perm)).map(a => (
              <Link key={a.to} to={a.to} className="sigs-atalho">
                <div className="sigs-atalho-icon"><Icon>{a.icon}</Icon></div>
                <span>{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Stats cards */}
      {data && (
        <div className="sigs-stats">
          <div className="sigs-stat" onClick={() => navigate('/tarefas')}>
            <div className="sigs-stat-value">{contadores.abertas || 0}</div>
            <div className="sigs-stat-label">Tarefas Abertas</div>
          </div>
          <div className="sigs-stat atrasadas" onClick={() => navigate('/tarefas')}>
            <div className="sigs-stat-value">{contadores.atrasadas || 0}</div>
            <div className="sigs-stat-label">Atrasadas</div>
          </div>
          <div className="sigs-stat projetos" onClick={() => navigate('/projetos')}>
            <div className="sigs-stat-value">{projetos.ativos || 0}</div>
            <div className="sigs-stat-label">Projetos Ativos</div>
          </div>
          <div className="sigs-stat rnc" onClick={() => navigate('/qualidade/rq03')}>
            <div className="sigs-stat-value">{rq03.abertas || 0}</div>
            <div className="sigs-stat-label">RNCs Abertas</div>
          </div>
          {(reunioes.proximas || 0) > 0 && (
            <div className="sigs-stat reunioes" onClick={() => navigate('/reunioes')}>
              <div className="sigs-stat-value">{reunioes.proximas}</div>
              <div className="sigs-stat-label">Reunioes (7d)</div>
            </div>
          )}
        </div>
      )}

      {/* Tabs: Tarefas / Feed */}
      <div className="sigs-tabs">
        <button className={tab === 'tarefas' ? 'active' : ''} onClick={() => setTab('tarefas')}>
          Tarefas {contadores.abertas > 0 && <span className="sigs-tab-badge">{contadores.abertas}</span>}
        </button>
        <button className={tab === 'feed' ? 'active' : ''} onClick={() => setTab('feed')}>
          Feed
        </button>
      </div>

      {/* Tab content: Tarefas Kanban */}
      {tab === 'tarefas' && (
        <div className="sigs-kanban">
          {kanban.length === 0 ? (
            <div className="sigs-tarefas-empty">
              <p>Carregando tarefas...</p>
            </div>
          ) : (
            <div className="sigs-kanban-board">
              {kanban.map(col => (
                <div key={col.key} className="sigs-kanban-col">
                  <div className="sigs-kanban-col-header" style={{ borderTopColor: col.color }}>
                    <span className="sigs-kanban-col-title">{col.label}</span>
                    <span className="sigs-kanban-col-count" style={{ background: col.color }}>{col.count}</span>
                  </div>
                  <div className="sigs-kanban-col-body">
                    {col.items.length === 0 ? (
                      <div className="sigs-kanban-empty">Nenhuma tarefa</div>
                    ) : (
                      col.items.map(t => {
                        const isAtrasada = t.dt_previsao && new Date(t.dt_previsao) < new Date() && col.key !== 'CONCLUIDA';
                        return (
                          <div key={t.id} className={`sigs-kanban-card ${isAtrasada ? 'atrasada' : ''}`} onClick={() => navigate(`/tarefas/${t.id}`)}>
                            <div className="sigs-kanban-card-titulo">{t.titulo}</div>
                            <div className="sigs-kanban-card-meta">
                              {t.dt_previsao && (
                                <span className={isAtrasada ? 'overdue' : ''}>
                                  {new Date(t.dt_previsao).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                              {t.responsavel_nome && <span>{t.responsavel_nome.split(' ')[0]}</span>}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="sigs-tarefas-footer">
            <button onClick={() => navigate('/tarefas')}>Ver todas as tarefas</button>
          </div>
        </div>
      )}
    </div>
  );
}

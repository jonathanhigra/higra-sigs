import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import SettingsModal from './SettingsModal';
import Icon from './Icon';
import api from '../lib/api';
import useAuthStore from '../stores/authStore';

const Sidebar = ({ isCollapsed, setIsCollapsed, theme, onToggleTheme, highContrast, onToggleContrast, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [photoSrc, setPhotoSrc] = useState(null);
  const [userName, setUserName] = useState('');
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadDMs, setUnreadDMs] = useState(0);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [rq03Pendentes, setRq03Pendentes] = useState(0);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [openSubs, setOpenSubs] = useState({});
  const filial = useAuthStore((s) => s.filial);
  const hiddenModules = useAuthStore((s) => s.hiddenModules);
  const menuRef = useRef(null);
  const lastFeedVisitRef = useRef(localStorage.getItem('lastFeedVisit') || new Date().toISOString());
  const sigsLogoSrc = '/assets/logo_sigs_dark.png';
  const sigsLogoFilter = theme === 'dark' ? 'none' : 'invert(1)';

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const { data } = await api.get('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!mounted) return;

        if (data?.photo) {
          const mime = data.photo_mime || 'image/jpeg';
          setPhotoSrc(`data:${mime};base64,${data.photo}`);
        } else {
          setPhotoSrc(null);
        }
        const nome = data?.name || 'Usuario';
        setUserName(nome);
        localStorage.setItem('user_name', nome);
        setIsAdminUser(!!data?.is_admin);
        // Carregar dados SIGS (tipo de usuário + permissões + filial)
        const filialData = data?.filial_id ? {
          id: data.filial_id,
          nome: data.filial_nome,
          sigla: data.filial_sigla,
          color: data.filial_color,
          colorText: data.filial_color_text,
          empresaNome: data.empresa_nome,
        } : null;
        useAuthStore.getState().setSigsData(data?.tipo_usuario, data?.permissoes, filialData, data?.scope);
      } catch (err) {
        console.error('Erro ao carregar perfil:', err);
      }
    })();
    return () => { mounted = false };
  }, []);

  // Poll unread notification + DM count every 30s
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const fetchUnread = () => {
      api.get('/social/notifications/unread-count').then(({ data }) => {
        setUnreadNotifs(data.count || 0);
      }).catch(() => {});
      api.get('/social/dm/unread-count').then(({ data }) => {
        setUnreadDMs(data.count || 0);
      }).catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  // Poll RQ03 abertas count every 60s
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const fetchRq03 = () => {
      api.get('/api/qualidade/rq03/resumo').then(({ data }) => {
        setRq03Pendentes(data.abertas || 0);
      }).catch(() => {});
    };
    fetchRq03();
    const interval = setInterval(fetchRq03, 60000);
    return () => clearInterval(interval);
  }, []);

  // Notificação 15min antes de reunião começar
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const STORAGE_KEY = 'sigs_notified_reunioes';
    const getNotified = () => {
      try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'); }
      catch { return []; }
    };
    const markNotified = (id) => {
      const list = getNotified();
      if (!list.includes(id)) sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...list, id]));
    };

    const checkReunioes = () => {
      const today = new Date().toISOString().split('T')[0];
      api.get('/api/reunioes/agendas', {
        params: { dt_inicio: today, dt_fim: today, per_page: 50 },
      }).then(({ data }) => {
        const now = new Date();
        const notified = getNotified();
        (data.items || []).forEach(r => {
          const st = (r._status || r.status || '').toUpperCase();
          if (st !== 'AGENDADA') return;
          if (notified.includes(r.id)) return;
          const hrIni = r._hr_inicio || r.hr_inicio;
          if (!hrIni) return;
          const dt = r._dt_agenda || r.dt_agenda || today;
          const startStr = `${typeof dt === 'string' ? dt.substring(0, 10) : today}T${String(hrIni).substring(0, 5)}`;
          const start = new Date(startStr);
          if (isNaN(start)) return;
          const diffMin = (start - now) / 60000;
          if (diffMin >= 0 && diffMin <= 15) {
            markNotified(r.id);
            const titulo = r._titulo || r.titulo || r.descricao || 'Reunião';
            const body = `Começa às ${String(hrIni).substring(0, 5)}${r.local ? ` · ${r.local}` : ''}`;
            if ('Notification' in window && Notification.permission === 'granted') {
              try { new Notification(`Reunião em ${Math.round(diffMin)} min`, { body, icon: '/assets/logo_sigs_dark.png' }); }
              catch { /* safari blocks */ }
            }
          }
        });
      }).catch(() => {});
    };

    checkReunioes();
    const interval = setInterval(checkReunioes, 60000);
    return () => clearInterval(interval);
  }, []);

  // Poll new posts count every 30s
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const checkNewPosts = () => {
      api.get('/social/feed/new-count', {
        params: { since: lastFeedVisitRef.current, mode: 'following' },
      }).then(({ data }) => {
        setHasNewPosts((data.count || 0) > 0);
      }).catch(() => {});
    };
    checkNewPosts();
    const interval = setInterval(checkNewPosts, 30000);
    return () => clearInterval(interval);
  }, []);

  // When user visits /feed, mark as visited and clear new posts dot
  useEffect(() => {
    if (location.pathname === '/feed' || location.pathname.startsWith('/feed/')) {
      const now = new Date().toISOString();
      lastFeedVisitRef.current = now;
      localStorage.setItem('lastFeedVisit', now);
      setHasNewPosts(false);
    }
  }, [location.pathname]);

  // When user visits /notifications or /messages, clear respective badges
  useEffect(() => {
    if (location.pathname === '/notifications') {
      setUnreadNotifs(0);
    }
    if (location.pathname.startsWith('/messages')) {
      setUnreadDMs(0);
    }
  }, [location.pathname]);

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  const handleLogout = () => {
    localStorage.removeItem('token');
    if (onLogout) onLogout();
    window.location.href = '/login';
  };

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`} role="navigation" aria-label="Menu principal">
      <div className="sidebar-header">
        <Link
          to="/feed"
          className="sidebar-logo-link"
          onClick={(e) => {
            if (location.pathname === '/feed') {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
              window.dispatchEvent(new CustomEvent('nav-reset', { detail: '/feed' }));
            }
          }}
        >
          {isCollapsed ? (
            <img
              src={sigsLogoSrc}
              alt="SIGS"
              style={{ width: '56px', padding: '5px', filter: sigsLogoFilter }}
            />
          ) : (
            <img
              src={sigsLogoSrc}
              alt="Portal SIGS"
              style={{ width: '80%', maxWidth: '200px', padding: '5px', filter: sigsLogoFilter }}
            />
          )}
        </Link>
      </div>

      <div className="sidebar-content">
        {[
          { to: '/feed', label: 'Pagina Inicial', icon: <path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5z" />, dot: hasNewPosts },
          { to: '/messages', label: 'Mensagens', icon: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>, badge: unreadDMs, moduleKey: 'mensagens' },
          { to: '/notifications', label: 'Notificacoes', icon: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>, badge: unreadNotifs, moduleKey: 'notificacoes' },
          { to: '/chat?new=1', label: 'Arquimedes', icon: <><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /><path d="M20 4l.8 2.4L23 8l-2.2.8L20 11.2l-.8-2.4L17 8l2.2-.8z" /></>, moduleKey: 'arquimedes' },
          // --- SIGS ---
          { to: '/tarefas', label: 'Tarefas', icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>, moduleKey: 'tarefas', sub: [
            { to: '/tarefas/apontamentos', label: 'Apontamentos Avulsos' },
            { to: '/tarefas/relatorio', label: 'Relatório de Horas' },
          ]},
          // --- Modulos SIGS (com submenus) ---
          { to: '/indicadores', label: 'Indicadores', icon: <><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></>, perm: 'GES', moduleKey: 'indicadores', sub: [
            { to: '/indicadores/ranking', label: 'Ranking' },
            { to: '/indicadores/risco', label: 'Metas em Risco' },
            { to: '/indicadores/historico', label: 'Histórico' },
            { to: '/indicadores/ano-fiscal', label: 'Anos Fiscais' },
            { to: '/indicadores/config', label: 'Configurações' },
          ]},
          { to: '/projetos', label: 'Projetos', icon: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>, perm: 'PRJT', moduleKey: 'projetos', sub: [
            { to: '/projetos/categorias', label: 'Categorias' },
            { to: '/projetos/tarefas-fixas', label: 'Tarefas Fixas' },
            { to: '/projetos/focco', label: 'Focco ERP (PVs)' },
          ]},
          { to: '/planos-acao', label: 'Planos de Ação', icon: <><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></>, perm: 'GACO', moduleKey: 'planos_acao', sub: [
            { to: '/planos-acao/vencidos', label: 'Planos Vencidos' },
          ]},
          { to: '/reunioes', label: 'Reunião', icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>, perm: 'RNOE', moduleKey: 'reunioes', sub: [
            { to: '/reunioes/tipos', label: 'Tipos de Reunião' },
          ]},
          { to: '/documentos', label: 'Documentos', icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>, perm: 'DCMT', moduleKey: 'documentos', sub: [
            { to: '/documentos/categorias', label: 'Categorias' },
            { to: '/biblioteca', label: 'Biblioteca' },
          ]},
          { to: '/qualidade/rq49', label: 'Notas de Oportunidade', icon: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>, perm: 'CMNA', moduleKey: 'rq49' },
          { to: '/qualidade/rq03', label: 'Não Conformidades', icon: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>, perm: 'RNCO', moduleKey: 'rq03', badge: rq03Pendentes },
          { to: '/comunicacao', label: 'Comunicação', icon: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>, perm: 'EVT', moduleKey: 'comunicacao', sub: [
            { to: '/comunicacao', label: 'Eventos e Comunicados' },
            { to: '/comunicacao/meus-eventos', label: 'Meus Eventos' },
            { to: '/comunicacao/categorias', label: 'Categorias' },
          ]},
          { to: '/laboratorio', label: 'Laboratório', icon: <><path d="M9 3h6v2H9z" /><path d="M10 5v6.5L6 20h12l-4-8.5V5" /></>, perm: 'LABS', moduleKey: 'laboratorio', sub: [
            { to: '/laboratorio', label: 'Agenda de Testes' },
            { to: '/laboratorio/dashboard', label: 'Dashboard' },
            { to: '/laboratorio/tipos-teste', label: 'Tipos de Teste' },
            { to: '/laboratorio/bancadas', label: 'Bancadas' },
          ]},
          { to: '/fabricacao', label: 'Producao', icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15 1.65 1.65 0 0 0 2.09 14H2a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 3.6 8.92a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.67 1.65 1.65 0 0 0 9 3.16V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1.08H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>, perm: 'CHKL', moduleKey: 'fabricacao', sub: [
            { to: '/fabricacao', label: 'Checklist Digital' },
            { to: '/fabricacao/instrumentos', label: 'Instrumentos' },
          ]},
          { to: '/qualidade', label: 'Gestao da Qualidade', icon: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>, perm: 'QLDD', moduleKey: 'qualidade', sub: [
            { to: '/qualidade', label: 'Instrumentos de Medicao' },
          ]},
          { to: '/motores', label: 'Folha de Dados', icon: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></>, perm: 'CHKL', moduleKey: 'motores', sub: [
            { to: '/motores', label: 'Modelos de Motor' },
          ]},
          { to: '/admin/permissoes', label: 'Administração', icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>, perm: 'ADM', moduleKey: 'admin', sub: [
            { to: '/admin/permissoes', label: 'Permissões' },
            { to: '/admin/usuarios', label: 'Usuários SIGS' },
            { to: '/cadastros', label: 'Empresas/Filiais' },
            { to: '/config/dominios', label: 'Domínios' },
            { to: '/admin/health', label: 'Health Check' },
          ]},
        ].filter(({ perm, moduleKey }) => {
          if (perm && !useAuthStore.getState().hasPermission(perm)) return false;
          if (moduleKey && hiddenModules.includes(moduleKey)) return false;
          return true;
        })
        .map(({ to, label, icon, dot, badge, sub }) => {
          const isActive = location.pathname === to.split('?')[0] || location.pathname.startsWith(to.split('?')[0] + '/');
          const hasSub = sub && sub.length > 0 && !isCollapsed;
          const isSubOpen = openSubs[to];

          return (
            <div key={to}>
              <div
                className={`menu-item ${isActive ? 'active' : ''}`}
                title={isCollapsed ? label : undefined}
                onClick={(e) => {
                  if (hasSub) {
                    e.preventDefault();
                    setOpenSubs(prev => ({ ...prev, [to]: !prev[to] }));
                  } else {
                    navigate(to);
                  }
                }}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <span className="menu-icon" style={{ position: 'relative' }}>
                  <Icon>{icon}</Icon>
                  {dot && <span className="sidebar-dot" />}
                  {badge > 0 && <span className="sidebar-badge">{badge > 99 ? '99+' : badge}</span>}
                </span>
                {!isCollapsed && <span className="nav-label" style={{ flex: 1 }}>{label}</span>}
                {hasSub && (
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginLeft: 'auto', transition: 'transform 0.2s', transform: isSubOpen ? 'rotate(180deg)' : '' }}>&#9660;</span>
                )}
              </div>
              {hasSub && isSubOpen && (
                <div style={{ paddingLeft: 32 }}>
                  {sub.map(s => (
                    <Link key={s.to} to={s.to} className="menu-item menu-sub-item"
                      style={{ fontSize: '0.78rem', padding: '5px 8px', opacity: 0.85 }}>
                      <span className="nav-label">{s.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        className="theme-toggle"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
      >
        <span className="menu-icon">
          {theme === 'dark' ? (
            <Icon><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></Icon>
          ) : (
            <Icon><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></Icon>
          )}
        </span>
        {!isCollapsed && <span className="nav-label">{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>}
      </button>
      {onToggleContrast && (
        <button
          className="theme-toggle"
          onClick={onToggleContrast}
          title={highContrast ? 'Desativar alto contraste' : 'Ativar alto contraste'}
          aria-label={highContrast ? 'Desativar modo alto contraste' : 'Ativar modo alto contraste'}
          aria-pressed={highContrast}
        >
          <span className="menu-icon">
            <Icon><circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor" /></Icon>
          </span>
          {!isCollapsed && <span className="nav-label">{highContrast ? 'Contraste Normal' : 'Alto Contraste'}</span>}
        </button>
      )}

      <div className="sidebar-footer">
        <div className="profile-wrapper" ref={menuRef} style={{ display: "flex", alignItems: "center" }}>
          {photoSrc ? (
            <img
              className="sidebar-avatar"
              src={photoSrc}
              alt="Perfil"
              loading="lazy"
              style={{ width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer' }}
              onClick={() => setMenuOpen((v) => !v)}
            />
          ) : (
            <div
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#007bff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#fff',
                fontWeight: '600',
                fontSize: '16px',
              }}
            >
              {userName?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
          {!isCollapsed && (
            <div onClick={() => setMenuOpen((v) => !v)} style={{ display: "flex", flexDirection: "column", marginLeft: 8, minWidth: 0, cursor: "pointer" }}>
              <span style={{ fontSize: userName && userName.length > 15 ? "0.65rem" : "0.8rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{userName || "Usuário"}</span>
              {filial?.sigla && (
                <span style={{
                  fontSize: "0.6rem",
                  fontWeight: 600,
                  color: filial.colorText || "#fff",
                  backgroundColor: filial.color || "#666",
                  padding: "1px 6px",
                  borderRadius: "3px",
                  marginTop: 2,
                  display: "inline-block",
                  width: "fit-content",
                }}>{filial.sigla}</span>
              )}
            </div>
          )}
          {menuOpen && (
            <div className={`profile-menu ${isCollapsed ? 'collapsed' : ''}`}>
              <button className="menu-item-btn" onClick={() => { setMenuOpen(false); navigate('/profile'); }}>
                <svg
                  className="profile-menu-icon"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>Perfil</span>
              </button>
              <button className="menu-item-btn" onClick={() => setSettingsOpen(true)}>
                <svg
                  className="profile-menu-icon"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                <span>Configurações</span>
              </button>
              {isAdminUser && (
                <button className="menu-item-btn" onClick={() => { setMenuOpen(false); navigate('/admin/invites'); }}>
                  <svg
                    className="profile-menu-icon"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z" />
                  </svg>
                  <span>Painel Admin</span>
                </button>
              )}
              <button className="menu-item-btn" onClick={handleLogout}>
                <svg
                  className="profile-menu-icon"
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>Sair</span>
              </button>
            </div>
          )}
        </div>
        <button onClick={toggleSidebar} aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {isCollapsed
              ? <polyline points="9 18 15 12 9 6" />
              : <polyline points="15 18 9 12 15 6" />
            }
          </svg>
        </button>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

export default Sidebar;

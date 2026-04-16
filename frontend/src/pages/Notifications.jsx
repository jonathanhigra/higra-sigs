import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import './Notifications.css';
import './Feed.css';
import Icon from '../components/Icon';
import { parseDate, formatTime } from '../lib/dateUtils';
import { buildAvatarSrc } from '../lib/avatarUtils';

const FILTERS = [
  { key: null, label: 'Todas' },
  { key: 'sigs', label: 'SIGS' },
  { key: 'like', label: 'Curtidas' },
  { key: 'comment', label: 'Comentarios' },
  { key: 'follow', label: 'Seguidores' },
  { key: 'mention', label: 'Mencoes' },
];

const READ_FILTERS = [
  { key: null, label: 'Todas' },
  { key: 'unread', label: 'Não lidas' },
  { key: 'read', label: 'Lidas' },
];

const SIGS_ICONS = {
  tarefa_atribuida: { icon: 'check', color: '#3b82f6', label: 'Tarefa' },
  tarefa_entregue: { icon: 'check', color: '#22c55e', label: 'Tarefa' },
  tarefa_vencendo: { icon: 'clock', color: '#f59e0b', label: 'Tarefa' },
  projeto_participante: { icon: 'book', color: '#8b5cf6', label: 'Projeto' },
  plano_atribuido: { icon: 'zap', color: '#f59e0b', label: 'Plano' },
  plano_implementado: { icon: 'check', color: '#22c55e', label: 'Plano' },
  plano_vencido: { icon: 'alert', color: '#ef4444', label: 'Plano' },
  rnc_aberta: { icon: 'alert', color: '#ef4444', label: 'RNC' },
  rnc_atribuida: { icon: 'alert', color: '#ef4444', label: 'RNC' },
  no_aberta: { icon: 'info', color: '#f59e0b', label: 'NO' },
  reuniao_agendada: { icon: 'users', color: '#3b82f6', label: 'Reuniao' },
  reuniao_lembrete: { icon: 'clock', color: '#8b5cf6', label: 'Reuniao' },
  doc_compartilhado: { icon: 'file', color: '#3b82f6', label: 'Documento' },
  doc_revisao: { icon: 'file', color: '#22c55e', label: 'Documento' },
  comunicado_novo: { icon: 'megaphone', color: '#f59e0b', label: 'Comunicado' },
  lab_agendado: { icon: 'flask', color: '#3b82f6', label: 'Laboratorio' },
};

const getNotificationText = (item) => {
  if (item.type === 'sigs') return item.metadata?.message || 'Notificacao do sistema';
  if (item.type === 'system') return item.metadata?.message || 'Notificacao do sistema';
  if (item.type === 'like') return 'curtiu seu post';
  if (item.type === 'comment') return 'comentou no seu post';
  if (item.type === 'follow') return 'comecou a seguir voce';
  if (item.type === 'article') return 'publicou um novo artigo';
  if (item.type === 'repost') return 'repostou seu post';
  if (item.type === 'quote') return 'citou seu post';
  if (item.type === 'mention') return 'mencionou voce em um post';
  if (item.type === 'invite_accepted') return 'aceitou seu convite e entrou no SIGS';
  if (item.type === 'invite_earned') return 'Voce ganhou +1 convite por atividade!';
  return 'interagiu com voce';
};

const getNotificationIcon = (type, item) => {
  if (type === 'sigs') {
    const sigsType = item?.metadata?.sigs_type;
    const cfg = SIGS_ICONS[sigsType] || { color: '#006ed0', label: 'SIGS' };
    return <span style={{ width: 16, height: 16, borderRadius: '50%', background: cfg.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', color: '#fff', fontWeight: 700 }}>{(cfg.label || 'S')[0]}</span>;
  }
  if (type === 'like') return <Icon width="16" height="16"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" stroke="none" /></Icon>;
  if (type === 'comment') return <Icon width="16" height="16"><path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-10.5 7-10.5-7z" fill="none" /><path d="M22.5 6.91V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.16l10.5 7 10.5-7z" fill="none" /></Icon>;
  if (type === 'follow') return <Icon width="16" height="16"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6" /><path d="M22 11h-6" /></Icon>;
  if (type === 'repost') return <Icon width="16" height="16"><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></Icon>;
  if (type === 'quote') return <Icon width="16" height="16"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h3c0 4-2 5-5 5v1z" /><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2.02-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h3c0 4-2 5-5 5v1z" /></Icon>;
  if (type === 'mention') return <Icon width="16" height="16"><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></Icon>;
  if (type === 'invite_accepted') return <Icon width="16" height="16"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></Icon>;
  if (type === 'invite_earned') return <Icon width="16" height="16"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></Icon>;
  if (type === 'system') return <Icon width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Icon>;
  return <Icon width="16" height="16"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></Icon>;
};

const getTimeSection = (dateStr) => {
  const now = new Date();
  const date = parseDate(dateStr);
  if (!date || Number.isNaN(date.getTime())) return 'Anteriores';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (date >= today) return 'Hoje';
  if (date >= weekAgo) return 'Esta semana';
  return 'Anteriores';
};

const PAGE_SIZE = 20;
const SWIPE_THRESHOLD = 80;

const Notifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState(null);
  const [readFilter, setReadFilter] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [newIds, setNewIds] = useState(new Set());
  const sentinelRef = useRef(null);
  const swipeRef = useRef({});
  const filterBarRef = useRef(null);

  // Sidebar state
  const [trends, setTrends] = useState([]);
  const [trendsExpanded, setTrendsExpanded] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // New features state
  const [unreadCounts, setUnreadCounts] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [removingIds, setRemovingIds] = useState(new Set());
  const [newBannerCount, setNewBannerCount] = useState(0);

  const fetchNotifications = useCallback(async (offset = 0, filter = typeFilter, append = false) => {
    try {
      if (!append) setLoading(true);
      const params = { limit: PAGE_SIZE, offset, grouped: true };
      if (filter) params.type = filter;
      if (readFilter) params.status = readFilter;
      const { data } = await api.get('/social/notifications', { params });
      const items = data.notifications || [];
      if (append) {
        setNotifications((prev) => [...prev, ...items]);
      } else {
        setNotifications(items);
      }
      setHasMore(items.length >= PAGE_SIZE);
    } catch {
      console.warn('Erro ao carregar notificacoes');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [typeFilter, readFilter]);

  const fetchUnreadCounts = useCallback(async () => {
    try {
      const { data } = await api.get('/social/notifications/unread-counts');
      setUnreadCounts(data.counts || {});
    } catch (err) {
      console.warn('Erro ao carregar contagens de notificacoes:', err);
    }
  }, []);

  useEffect(() => {
    setHasMore(true);
    fetchNotifications(0, typeFilter, false);
  }, [typeFilter, readFilter]);

  useEffect(() => {
    api.get('/social/notifications/preferences')
      .then(({ data }) => setNotifPrefs(data.preferences))
      .catch((err) => console.warn('Erro ao carregar preferencias de notificacao:', err));
    api.get('/social/trends', { params: { limit: 10 } })
      .then(({ data }) => setTrends(data.trends || []))
      .catch((err) => console.warn('Erro ao carregar tendencias de notificacoes:', err));
    api.get('/social/suggestions')
      .then(({ data }) => setSuggestions(data.suggestions || data || []))
      .catch((err) => console.warn('Erro ao carregar sugestoes de notificacoes:', err));
    fetchUnreadCounts();
  }, []);

  // Check filter bar overflow for fade hint
  useEffect(() => {
    const el = filterBarRef.current;
    if (!el) return;
    const check = () => {
      el.classList.toggle('has-overflow', el.scrollWidth > el.clientWidth);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-refresh trends
  useEffect(() => {
    const interval = setInterval(() => {
      api.get('/social/trends', { params: { limit: 10 } })
        .then(({ data }) => setTrends(data.trends || []))
        .catch((err) => console.warn('Erro ao atualizar tendencias de notificacoes:', err));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          setLoadingMore(true);
          fetchNotifications(notifications.length, typeFilter, true);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [notifications.length, hasMore, loadingMore, loading, typeFilter]);

  // WebSocket: refresh on new notification
  const prevIdsRef = useRef(new Set());
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;
  useWebSocket(useCallback((event) => {
    if (event.type === 'refresh_notifications') {
      prevIdsRef.current = new Set(notificationsRef.current.map((n) => n.id));
      setNewBannerCount((c) => c + 1);
      fetchUnreadCounts();
    }
  }, [fetchUnreadCounts]));

  // After fetch, detect new IDs for animation
  useEffect(() => {
    if (prevIdsRef.current.size === 0) return;
    const incoming = new Set();
    notifications.forEach((n) => {
      if (!prevIdsRef.current.has(n.id)) incoming.add(n.id);
    });
    if (incoming.size > 0) {
      setNewIds(incoming);
      const timer = setTimeout(() => setNewIds(new Set()), 2000);
      return () => clearTimeout(timer);
    }
  }, [notifications]);

  const animateRemove = (id, callback) => {
    setRemovingIds((prev) => new Set([...prev, id]));
    setTimeout(() => {
      callback();
      setRemovingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }, 300);
  };

  const markAsRead = async (item) => {
    if (item.read_at) return;
    try {
      await api.post(`/social/notifications/${item.id}/read`);
      setNotifications((prev) =>
        prev.map((n) => n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)
      );
      fetchUnreadCounts();
    } catch (err) {
      console.warn('Erro ao marcar notificacao como lida:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/social/notifications/read-all');
      setNotifications((prev) =>
        prev.map((n) => n.read_at ? n : { ...n, read_at: new Date().toISOString() })
      );
      setUnreadCounts({});
    } catch (err) {
      console.warn('Erro ao marcar todas as notificacoes como lidas:', err);
    }
  };

  const deleteNotification = async (e, id) => {
    e.stopPropagation();
    animateRemove(id, async () => {
      try {
        await api.delete(`/social/notifications/${id}`);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        fetchUnreadCounts();
      } catch (err) {
        console.warn('Erro ao excluir notificacao:', err);
      }
    });
  };

  // Batch actions
  const toggleSelect = (e, id) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const batchMarkRead = async () => {
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map((id) => api.post(`/social/notifications/${id}/read`)));
      setNotifications((prev) =>
        prev.map((n) => ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n)
      );
      setSelectedIds(new Set());
      setSelectMode(false);
      fetchUnreadCounts();
    } catch (err) {
      console.warn('Erro ao marcar lote de notificacoes como lido:', err);
    }
  };

  const batchDelete = async () => {
    const ids = [...selectedIds];
    ids.forEach((id) => setRemovingIds((prev) => new Set([...prev, id])));
    setTimeout(async () => {
      try {
        await Promise.all(ids.map((id) => api.delete(`/social/notifications/${id}`)));
        setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
        setSelectedIds(new Set());
        setSelectMode(false);
        fetchUnreadCounts();
      } catch (err) {
        console.warn('Erro ao excluir lote de notificacoes:', err);
      }
      setRemovingIds(new Set());
    }, 300);
  };

  const handleFollowBack = async (e, userId) => {
    e.stopPropagation();
    try {
      await api.post(`/social/users/${userId}/follow`);
      setNotifications((prev) =>
        prev.map((n) => n.actor_id === userId ? { ...n, actor_following: true } : n)
      );
    } catch (err) {
      console.warn('Erro ao seguir usuario a partir de notificacao:', err);
    }
  };

  const getTarget = (item) => {
    if (item.type === 'sigs' && item.metadata?.link) return item.metadata.link;
    if (item.type === 'system' && item.metadata?.link) return item.metadata.link;
    if (item.type === 'follow') return `/profile/${item.actor_id}`;
    if (item.post_id) return `/feed/${item.post_id}`;
    return null;
  };

  const handleFollow = async (userId) => {
    try {
      await api.post(`/social/users/${userId}/follow`);
      setSuggestions((prev) =>
        prev.map((s) => s.id === userId ? { ...s, following: !s.following } : s)
      );
    } catch (err) {
      console.warn('Erro ao seguir sugestao em notificacoes:', err);
    }
  };

  const runSearch = async (term) => {
    if (!term.trim()) return;
    setSearching(true);
    try {
      const { data } = await api.get('/social/posts/search', { params: { q: term.trim() } });
      setSearchResults(data.posts || data || []);
    } catch (err) {
      console.warn('Erro ao pesquisar posts nas notificacoes:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) runSearch(searchTerm);
  };

  // Swipe handlers (mobile only)
  const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

  const onTouchStart = (e, itemId) => {
    if (!isTouchDevice) return;
    swipeRef.current[itemId] = {
      startX: e.touches[0].clientX,
      currentX: 0,
      swiping: false,
    };
  };

  const onTouchMove = (e, itemId) => {
    if (!isTouchDevice || !swipeRef.current[itemId]) return;
    const deltaX = e.touches[0].clientX - swipeRef.current[itemId].startX;
    if (deltaX > 10) {
      swipeRef.current[itemId].swiping = true;
      swipeRef.current[itemId].currentX = Math.min(deltaX, 120);
      const el = e.currentTarget;
      if (el) {
        el.style.transform = `translateX(${swipeRef.current[itemId].currentX}px)`;
        el.style.transition = 'none';
      }
    }
  };

  const onTouchEnd = (e, item) => {
    if (!isTouchDevice || !swipeRef.current[item.id]) return;
    const sw = swipeRef.current[item.id];
    const el = e.currentTarget;
    if (el) {
      el.style.transition = 'transform 0.3s ease';
      el.style.transform = 'translateX(0)';
    }
    if (sw.currentX >= SWIPE_THRESHOLD) {
      markAsRead(item);
    }
    delete swipeRef.current[item.id];
  };

  // Group notifications by time section
  const sections = useMemo(() => {
    const groups = { 'Hoje': [], 'Esta semana': [], 'Anteriores': [] };
    notifications.forEach((item) => {
      const section = getTimeSection(item.created_at);
      groups[section].push(item);
    });
    return Object.entries(groups).filter(([, items]) => items.length > 0);
  }, [notifications]);

  // Build grouped notification text
  const getGroupedText = (item) => {
    if (item.grouped && item.actors && item.actor_count > 1) {
      const names = item.actors.slice(0, 2).map((a) => a.name || 'Usuário');
      const remaining = item.actor_count - names.length;
      let nameStr = names.join(', ');
      if (remaining > 0) {
        nameStr += ` e ${remaining} outro${remaining > 1 ? 's' : ''}`;
      }
      return (
        <span>
          <strong>{nameStr}</strong>{' '}
          {getNotificationText(item)}
        </span>
      );
    }
    if (item.type === 'system') {
      return <span>{getNotificationText(item)}</span>;
    }
    return (
      <span>
        <strong>{item.actor_name || 'Usuario'}</strong>{' '}
        {getNotificationText(item)}
      </span>
    );
  };

  // Render avatar(s)
  const renderAvatar = (item) => {
    if (item.type === 'system') {
      return (
        <div className="notif-item-avatar notif-system-avatar">
          <Icon width="20" height="20"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Icon>
        </div>
      );
    }
    if (item.grouped && item.actors && item.actor_count > 1) {
      const displayActors = item.actors.slice(0, 3);
      return (
        <div className="notif-avatar-stack">
          {displayActors.map((actor, idx) => {
            const src = buildAvatarSrc(null, null, actor.id);
            return (
              <div key={actor.id || idx} className="notif-avatar-stack-item" style={{ zIndex: displayActors.length - idx }}>
                {src ? (
                  <img src={src} alt={actor.name || 'Perfil'} />
                ) : (
                  <span>{(actor.name || 'U')[0]?.toUpperCase()}</span>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    const avatarSrc = buildAvatarSrc(null, null, item.actor_id);
    return (
      <div className="notif-item-avatar">
        {avatarSrc ? (
          <img src={avatarSrc} alt={item.actor_name || 'Perfil'} />
        ) : (
          <span>{(item.actor_name || 'U')[0]?.toUpperCase()}</span>
        )}
      </div>
    );
  };

  const renderNotificationItem = (item, staggerIdx = 0) => {
    const target = getTarget(item);
    const isNew = newIds.has(item.id);
    const isRemoving = removingIds.has(item.id);
    const isSelected = selectedIds.has(item.id);
    const itemClasses = [
      'notif-item',
      !item.read_at ? 'unread' : '',
      isNew ? 'notif-item-enter notif-item-pulse' : 'notif-item-stagger',
      isRemoving ? 'notif-item-exit' : '',
      isSelected ? 'notif-item-selected' : '',
    ].filter(Boolean).join(' ');
    const staggerStyle = !isNew && !isRemoving ? { animationDelay: `${staggerIdx * 0.04}s` } : undefined;

    return (
      <div
        key={item.id}
        className="notif-swipe-wrapper"
      >
        {isTouchDevice && (
          <div className="notif-swipe-bg">
            <Icon width="20" height="20"><polyline points="20 6 9 17 4 12" /></Icon>
          </div>
        )}
        <div
          className={itemClasses}
          onClick={() => {
            if (selectMode) {
              toggleSelect({ stopPropagation: () => {} }, item.id);
              return;
            }
            markAsRead(item);
            if (target) navigate(target);
          }}
          onTouchStart={(e) => onTouchStart(e, item.id)}
          onTouchMove={(e) => onTouchMove(e, item.id)}
          onTouchEnd={(e) => onTouchEnd(e, item)}
          style={{ cursor: selectMode ? 'pointer' : target ? 'pointer' : 'default', ...staggerStyle }}
        >
          {selectMode && (
            <label className="notif-checkbox" onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={isSelected} onChange={(e) => toggleSelect(e, item.id)} />
            </label>
          )}
          <div className="notif-item-icon" data-type={item.type}>
            {getNotificationIcon(item.type, item)}
          </div>
          {renderAvatar(item)}
          <div className="notif-item-body">
            <div className="notif-item-text">
              {getGroupedText(item)}
            </div>
            {item.post_preview && (
              <div className="notif-item-preview">{item.post_preview}</div>
            )}
            <div className="notif-item-meta">
              {item.type === 'system' ? (
                <span>{formatTime(item.created_at)}</span>
              ) : item.grouped && item.actor_count > 1 ? (
                <span>{formatTime(item.created_at)}</span>
              ) : (
                <span>@{item.actor_username || 'usuario'} · {formatTime(item.created_at)}</span>
              )}
            </div>
            {item.type === 'follow' && !item.actor_following && (
              <button className="notif-follow-back" onClick={(e) => handleFollowBack(e, item.actor_id)}>
                Seguir de volta
              </button>
            )}
            {item.type === 'follow' && item.actor_following && (
              <span className="notif-followed-label">Seguindo</span>
            )}
          </div>
          {!item.read_at && !selectMode && <span className="notif-item-dot" />}
          {!selectMode && (
            <button
              className="notif-item-delete"
              title="Excluir notificação"
              aria-label="Excluir notificação"
              onClick={(e) => deleteNotification(e, item.id)}
            >
              <Icon width="15" height="15"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></Icon>
            </button>
          )}
        </div>
      </div>
    );
  };

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  // Skeleton loader
  const renderSkeleton = () => (
    <div className="notif-skeleton-list">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="notif-skeleton-item">
          <div className="notif-skeleton-icon" />
          <div className="notif-skeleton-avatar" />
          <div className="notif-skeleton-body">
            <div className="notif-skeleton-line" style={{ width: `${60 + Math.random() * 30}%` }} />
            <div className="notif-skeleton-line short" style={{ width: `${30 + Math.random() * 20}%` }} />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="notif-page">
      <div className="notif-grid">
        <div className="notif-container">
          <div className="notif-header">
            <h2>Notificações</h2>
            <div className="notif-read-filters">
              {READ_FILTERS.map(({ key, label }) => (
                <button
                  key={label}
                  className={`notif-read-filter-btn ${readFilter === key ? 'active' : ''}`}
                  onClick={() => setReadFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="notif-header-actions">
              {selectMode ? (
                <>
                  <span className="notif-select-count">{selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}</span>
                  {selectedIds.size > 0 && (
                    <>
                      <button className="notif-batch-btn" onClick={batchMarkRead} title="Marcar como lidas">
                        <Icon width="16" height="16"><polyline points="20 6 9 17 4 12" /></Icon>
                      </button>
                      <button className="notif-batch-btn danger" onClick={batchDelete} title="Excluir selecionadas">
                        <Icon width="16" height="16"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Icon>
                      </button>
                    </>
                  )}
                  <button className="notif-mark-all" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}>Cancelar</button>
                </>
              ) : (
                <>
                  {totalUnread > 0 && (
                    <button className="notif-mark-all" onClick={markAllAsRead}>
                      Marcar todas como lidas
                    </button>
                  )}
                  <button className="notif-icon-btn" onClick={() => setSelectMode(true)} title="Selecionar">
                    <Icon width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="3" ry="3" /><polyline points="9 11 12 14 22 4" /></Icon>
                  </button>
                  <button
                    className="notif-icon-btn"
                    onClick={() => setPrefsOpen((v) => !v)}
                    title="Preferências"
                    aria-label="Preferências de notificações"
                  >
                    <Icon width="18" height="18"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></Icon>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* New notifications banner */}
          {newBannerCount > 0 && (
            <button className="notif-new-banner" onClick={() => {
              setNewBannerCount(0);
              fetchNotifications(0, typeFilter, false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}>
              <Icon width="14" height="14"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></Icon>
              {newBannerCount} nova{newBannerCount > 1 ? 's' : ''} notificaç{newBannerCount > 1 ? 'ões' : 'ão'}
            </button>
          )}

          {prefsOpen && notifPrefs && (
            <div className="notif-prefs">
              {[
                { key: 'like_enabled', label: 'Curtidas' },
                { key: 'comment_enabled', label: 'Comentários' },
                { key: 'follow_enabled', label: 'Seguidores' },
                { key: 'article_enabled', label: 'Artigos' },
                { key: 'repost_enabled', label: 'Reposts' },
                { key: 'quote_enabled', label: 'Citações' },
              ].map(({ key, label }) => (
                <label key={key} className="notif-pref-item">
                  <span>{label}</span>
                  <div className={`notif-toggle ${notifPrefs[key] ? 'active' : ''}`} onClick={(e) => {
                    e.preventDefault();
                    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
                    setNotifPrefs(next);
                    api.put('/social/notifications/preferences', next).catch(() => {});
                  }}>
                    <div className="notif-toggle-knob" />
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Unified filter bar */}
          <div className="notif-filter-bar" ref={filterBarRef}>
            <div className="notif-filters">
              {FILTERS.map(({ key, label }) => {
                const count = key ? (unreadCounts[key] || 0) : 0;
                return (
                  <button
                    key={label}
                    className={`notif-filter-btn ${typeFilter === key ? 'active' : ''}`}
                    onClick={() => setTypeFilter(key)}
                  >
                    {label}
                    {count > 0 && <span className="notif-filter-badge">{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="notif-list">
            {loading && notifications.length === 0 && renderSkeleton()}
            {!loading && notifications.length === 0 && (
              <div className="notif-empty-state">
                <svg width="72" height="72" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 4C20.13 4 17 7.13 17 11c0 1.04.21 2.03.59 2.95C14.18 16.05 12 19.23 12 23v7l-4 4v2h32v-2l-4-4v-7c0-3.77-2.18-6.95-5.59-9.05.38-.92.59-1.91.59-2.95 0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20.5 38a3.5 3.5 0 0 0 7 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M35 8l2 2M37 14h2M33 4l1.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
                  <circle cx="36" cy="9" r="1" fill="currentColor" opacity="0.3" />
                </svg>
                <h3>Nenhuma notificação</h3>
                <p>
                  {typeFilter
                    ? `Você não tem notificações do tipo "${FILTERS.find(f => f.key === typeFilter)?.label}".`
                    : readFilter === 'unread'
                    ? 'Você está em dia! Nenhuma notificação não lida.'
                    : readFilter === 'read'
                    ? 'Nenhuma notificação lida ainda.'
                    : 'Quando alguém interagir com você, aparecerá aqui.'}
                </p>
              </div>
            )}
            {sections.map(([sectionName, items]) => (
              <React.Fragment key={sectionName}>
                <div className="notif-section-header">{sectionName}</div>
                {items.map((item, idx) => renderNotificationItem(item, idx))}
              </React.Fragment>
            ))}
            <div ref={sentinelRef} style={{ height: 1 }} />
            {loadingMore && (
              <div className="notif-loading-more">
                <div className="notif-spinner" />
                <span>Carregando</span>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar direita — mesmo conteúdo do Feed */}
        <aside className="feed-column feed-right">
          <div className="feed-search">
            <form className="feed-search-bar" onSubmit={handleSearchSubmit}>
              <Icon>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </Icon>
              <input
                type="search"
                placeholder="Buscar"
                aria-label="Buscar"
                value={searchTerm}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSearchOpen(true);
                  if (!e.target.value.trim()) {
                    setSearchResults([]);
                  }
                }}
              />
            </form>
            {searchOpen && searchResults.length > 0 && (
              <div className="feed-search-panel">
                <div className="feed-search-section">
                  <div className="feed-search-header">
                    <span>Resultados</span>
                  </div>
                  <div className="feed-search-list">
                    {searching && <div className="feed-empty">Buscando...</div>}
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="feed-search-result"
                        role="button"
                        tabIndex={0}
                        onClick={() => { setSearchOpen(false); navigate(`/feed/${result.id}`); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { setSearchOpen(false); navigate(`/feed/${result.id}`); } }}
                      >
                        <div className="feed-search-meta">
                          <strong>{result.name || 'Usuario'}</strong>
                          <span>@{result.username || 'usuario'}</span>
                          <span className="tw-dot">.</span>
                          <span>{formatTime(result.created_at)}</span>
                        </div>
                        <p>{result.content?.slice(0, 120)}{result.content?.length > 120 ? '...' : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="feed-card">
            <div className="feed-card-header">
              <h3>O que esta acontecendo</h3>
              <button className="feed-icon-btn subtle" aria-label="Mais tendencias" onClick={() => setTrendsExpanded(!trendsExpanded)}>
                <Icon>
                  <circle cx="5" cy="12" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="19" cy="12" r="1.5" />
                </Icon>
              </button>
            </div>
            <div className="feed-trends">
              {(trendsExpanded ? trends : trends.slice(0, 5)).map((trend, index) => (
                <div
                  key={`${trend.title}-${index}`}
                  className="feed-trend"
                  onClick={() => navigate(`/explore/${encodeURIComponent(trend.title)}`)}
                >
                  <span>{trend.category}</span>
                  <strong>{trend.title}</strong>
                  <div className="feed-trend-footer">
                    {trend.count > 0 && (
                      <span className="feed-trend-count">{trend.count} posts</span>
                    )}
                    <button
                      className="feed-trend-explore"
                      type="button"
                      title="Ver no Explorar"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/explore/${encodeURIComponent(trend.title)}`);
                      }}
                    >
                      <Icon width="14" height="14">
                        <circle cx="11" cy="11" r="7" />
                        <path d="M21 21l-4.3-4.3" />
                      </Icon>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {trends.length > 0 && (
              <div className="feed-trend-actions">
                {trends.length > 5 && (
                  <button className="feed-link-btn" type="button" onClick={() => setTrendsExpanded(!trendsExpanded)}>
                    {trendsExpanded ? 'Mostrar menos' : 'Mostrar mais'}
                  </button>
                )}
                <button className="feed-link-btn" type="button" onClick={() => navigate('/explore')}>
                  Ver todas
                </button>
              </div>
            )}
          </div>

          {suggestions.length > 0 && (
          <div className="feed-card">
            <h3>Quem seguir</h3>
            <div className="feed-follow-list">
              {suggestions.slice(0, 3).map((user) => {
                const avatarSrc = buildAvatarSrc(user.photo, user.photo_mime, user.id);
                return (
                  <div key={user.id} className="feed-follow-item">
                    <div
                      className="feed-follow-avatar-wrap"
                      onClick={() => navigate(`/profile/${user.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      {avatarSrc ? (
                        <img src={avatarSrc} alt={user.name || 'Perfil'} />
                      ) : (
                        <div className="feed-follow-avatar">
                          {(user.name || 'U')[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div
                      className="feed-follow-info"
                      onClick={() => navigate(`/profile/${user.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <strong>{user.name || 'Usuário'}</strong>
                      <span>@{user.username}</span>
                    </div>
                    <button
                      className="feed-follow-btn"
                      type="button"
                      onClick={() => handleFollow(user.id)}
                    >
                      {user.following ? 'Seguindo' : 'Seguir'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default Notifications;

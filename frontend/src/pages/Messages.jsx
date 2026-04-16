import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import ConfirmModal from '../components/ConfirmModal';
import './Messages.css';
import Icon from '../components/Icon';
import { parseDate, formatTime, formatDateLabel, getDateKey } from '../lib/dateUtils';
import { buildAvatarSrc } from '../lib/avatarUtils';

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

const renderMessageContent = (text) => {
  if (!text) return null;
  const parts = [];
  let lastIdx = 0;
  let match;
  const regex = new RegExp(URL_REGEX.source, 'gi');
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const url = match[0];
    parts.push(
      <a key={match.index} href={url} target="_blank" rel="noopener noreferrer" className="dm-link">{url.length > 60 ? url.slice(0, 60) + '...' : url}</a>
    );
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  if (parts.length === 1 && typeof parts[0] === 'string') return <div>{text}</div>;
  // Extract first URL for a link card
  const firstUrl = text.match(URL_REGEX)?.[0];
  let domain;
  try { domain = firstUrl ? new URL(firstUrl).hostname.replace('www.', '') : null; } catch { domain = null; }
  return (
    <>
      <div>{parts}</div>
      {firstUrl && domain && (
        <a href={firstUrl} target="_blank" rel="noopener noreferrer" className="dm-link-card">
          <span className="dm-link-card-domain">{domain}</span>
          <span className="dm-link-card-url">{firstUrl.length > 50 ? firstUrl.slice(0, 50) + '...' : firstUrl}</span>
        </a>
      )}
    </>
  );
};

const EMOJI_LIST = [
  '😀','😂','😍','🥰','😎','🤔','😢','😡','👍','👎',
  '❤️','🔥','🎉','✨','💯','🙏','👏','🤝','💪','🫡',
  '😊','😅','🤣','😭','🥺','😤','🤯','🫠','💀','👀',
  '🚀','⭐','💡','📌','✅','❌','⚠️','💬','📷','🎵',
];

const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  } catch (err) {
    console.warn('Nao foi possivel tocar som de notificacao:', err);
  }
};

const Messages = () => {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const activeConvId = conversationId ? Number(conversationId) : null;

  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [onlineMap, setOnlineMap] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaPreview, setMediaPreview] = useState(null); // { dataUrl, file }
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // { id, content, sender_name }
  const [showNewConv, setShowNewConv] = useState(false);
  const [newConvQuery, setNewConvQuery] = useState('');
  const [newConvResults, setNewConvResults] = useState([]);
  const [confirmModal, setConfirmModal] = useState({ open: false, message: '', onConfirm: null });
  const [msgSearch, setMsgSearch] = useState('');
  const [msgSearchOpen, setMsgSearchOpen] = useState(false);
  const [msgSearchIdx, setMsgSearchIdx] = useState(0);
  const [reactPickerFor, setReactPickerFor] = useState(null);
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null); // { id, content }
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const shouldScrollRef = useRef(true);
  const loadConvTimerRef = useRef(null);

  const MSG_PAGE_SIZE = 50;
  const activeConvIdRef = useRef(activeConvId);
  activeConvIdRef.current = activeConvId;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  // Load current user
  useEffect(() => {
    api.get('/auth/me').then(({ data }) => setCurrentUser(data)).catch(() => {});
  }, []);

  // Load conversations (debounced to avoid burst of requests from rapid WS events)
  const _fetchConversations = useCallback(() => {
    api.get('/social/dm/conversations')
      .then(({ data }) => setConversations(data.conversations || []))
      .catch(() => {});
  }, []);
  const loadConversations = useCallback(() => {
    if (loadConvTimerRef.current) clearTimeout(loadConvTimerRef.current);
    loadConvTimerRef.current = setTimeout(_fetchConversations, 300);
  }, [_fetchConversations]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Fetch online status for conversation partners (poll every 30s)
  useEffect(() => {
    if (conversations.length === 0) return;
    const ids = conversations.map((c) => c.other_user_id).filter(Boolean);
    if (ids.length === 0) return;
    const fetchOnline = () => {
      api.get('/social/dm/online-status', { params: { user_ids: ids.join(',') } })
        .then(({ data }) => setOnlineMap(data.online || {}))
        .catch(() => {});
    };
    fetchOnline();
    const interval = setInterval(fetchOnline, 30000);
    return () => clearInterval(interval);
  }, [conversations]);

  // Load messages for active conversation
  const loadMessages = useCallback(() => {
    if (!activeConvId) return;
    setLoadingMessages(true);
    api.get(`/social/dm/conversations/${activeConvId}/messages`, {
      params: { limit: MSG_PAGE_SIZE },
    })
      .then(({ data }) => {
        const items = data.messages || [];
        setMessages(items);
        setHasMoreMessages(items.length >= MSG_PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  }, [activeConvId]);

  useEffect(() => {
    if (activeConvId) {
      setHasMoreMessages(true);
      setOtherTyping(false);
      loadMessages();
      // Mark messages as read
      api.post(`/social/dm/conversations/${activeConvId}/read`).catch(() => {});
    } else {
      setMessages([]);
      setHasMoreMessages(true);
      setOtherTyping(false);
    }
    // Focus textarea when conversation opens
    if (activeConvId) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
    return () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
  }, [activeConvId, loadMessages]);

  // Find the active conversation data
  const activeConv = conversations.find((c) => c.id === activeConvId);
  const filteredConversations = searchQuery.trim()
    ? conversations.filter((c) =>
        (c.other_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.other_username || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  // WebSocket: receive messages and typing indicators in real time
  const handleWsEvent = useCallback((event) => {
    if (event.type === 'dm_message') {
      const msg = event.data;
      // Play sound for incoming messages from others
      if (currentUserRef.current && msg.sender_id !== currentUserRef.current.id) {
        playNotificationSound();
      }
      if (msg.conversation_id === activeConvIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setOtherTyping(false);
        // Auto-mark as read since conversation is open
        if (currentUserRef.current && msg.sender_id !== currentUserRef.current.id) {
          api.post(`/social/dm/conversations/${msg.conversation_id}/read`).catch(() => {});
        }
      }
      loadConversations();
    } else if (event.type === 'dm_delete') {
      const d = event.data;
      if (d.conversation_id === activeConvIdRef.current) {
        setMessages((prev) => prev.map((m) =>
          m.id === d.message_id ? { ...m, content: null, media_url: null, deleted: true } : m
        ));
      }
      loadConversations();
    } else if (event.type === 'dm_read') {
      const d = event.data;
      if (d.conversation_id === activeConvIdRef.current) {
        // Mark all own messages as read
        setMessages((prev) => prev.map((m) =>
          m.sender_id !== d.read_by && !m.read_at
            ? { ...m, read_at: new Date().toISOString() }
            : m
        ));
      }
    } else if (event.type === 'dm_reaction') {
      const d = event.data;
      if (d.conversation_id === activeConvIdRef.current) {
        setMessages((prev) => prev.map((m) =>
          m.id === d.message_id ? { ...m, reactions: d.reactions } : m
        ));
      }
    } else if (event.type === 'dm_edit') {
      const d = event.data;
      if (d.conversation_id === activeConvIdRef.current) {
        setMessages((prev) => prev.map((m) =>
          m.id === d.message_id ? { ...m, content: d.content, edited_at: new Date().toISOString() } : m
        ));
      }
      loadConversations();
    } else if (event.type === 'dm_typing') {
      const d = event.data;
      if (d.conversation_id === activeConvIdRef.current) {
        setOtherTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 30000);
      }
    }
  }, [loadConversations]);

  const { send: wsSend, connected: wsConnected } = useWebSocket(handleWsEvent);

  // Send typing indicator (throttled: max once per 2s)
  const sendTypingIndicator = useCallback(() => {
    if (!activeConv) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    const otherUserId = activeConv.other_user_id;
    if (otherUserId) {
      wsSend({ type: 'dm_typing', data: { to_user_id: otherUserId, conversation_id: activeConvId } });
    }
  }, [activeConv, activeConvId, wsSend]);

  const loadOlderMessages = async () => {
    if (loadingMoreMessages || !hasMoreMessages || !activeConvId) return;
    setLoadingMoreMessages(true);
    const listEl = messagesListRef.current;
    const prevScrollHeight = listEl ? listEl.scrollHeight : 0;
    try {
      const { data } = await api.get(`/social/dm/conversations/${activeConvId}/messages`, {
        params: { limit: MSG_PAGE_SIZE, offset: messages.length },
      });
      const items = data.messages || [];
      if (items.length < MSG_PAGE_SIZE) setHasMoreMessages(false);
      if (items.length > 0) {
        shouldScrollRef.current = false;
        setMessages((prev) => [...items, ...prev]);
        // Preserve scroll position after prepending older messages
        requestAnimationFrame(() => {
          if (listEl) {
            listEl.scrollTop = listEl.scrollHeight - prevScrollHeight;
          }
        });
      } else {
        setHasMoreMessages(false);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMoreMessages(false);
    }
  };

  // Auto-scroll to latest message (skip when loading older messages)
  useEffect(() => {
    if (shouldScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    shouldScrollRef.current = true;
  }, [messages]);

  // Close pickers on outside click or Escape key
  useEffect(() => {
    const handler = (e) => {
      if (showEmojiPicker && !e.target.closest('.dm-emoji-wrap')) {
        setShowEmojiPicker(false);
      }
      if (reactPickerFor !== null && !e.target.closest('.dm-react-wrap')) {
        setReactPickerFor(null);
      }
      if (menuOpenFor !== null && !e.target.closest('.dm-msg-menu-wrap')) {
        setMenuOpenFor(null);
      }
    };
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        if (lightboxSrc) setLightboxSrc(null);
        if (showEmojiPicker) setShowEmojiPicker(false);
        if (reactPickerFor !== null) setReactPickerFor(null);
        if (menuOpenFor !== null) setMenuOpenFor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [showEmojiPicker, reactPickerFor, menuOpenFor]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setSendError('Apenas imagens são permitidas.');
      setTimeout(() => setSendError(null), 4000);
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSendError('Imagem deve ter no máximo 5 MB.');
      setTimeout(() => setSendError(null), 4000);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setMediaPreview({ dataUrl: reader.result, file });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSend = async () => {
    if ((!inputText.trim() && !mediaPreview) || !activeConvId || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const payload = { content: inputText.trim() };
      if (mediaPreview) {
        payload.media_url = mediaPreview.dataUrl;
      }
      if (replyTo) {
        payload.reply_to_id = replyTo.id;
      }
      const { data } = await api.post(`/social/dm/conversations/${activeConvId}/messages`, payload);
      // Add sent message to chat immediately
      const sentMsg = data?.message || data;
      if (sentMsg && sentMsg.id) {
        setMessages((prev) => prev.some((m) => m.id === sentMsg.id) ? prev : [...prev, sentMsg]);
      }
      setInputText('');
      setMediaPreview(null);
      setReplyTo(null);
      // Reset textarea height and border-radius
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.borderRadius = '20px';
      }
      // Update conversation list immediately (bypass debounce)
      _fetchConversations();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setSendError(detail || 'Erro ao enviar mensagem. Tente novamente.');
      setTimeout(() => setSendError(null), 5000);
    } finally {
      setSending(false);
    }
  };

  const QUICK_REACTIONS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];

  const handleReact = async (msgId, emoji) => {
    setReactPickerFor(null);
    try {
      await api.post(`/social/dm/messages/${msgId}/react`, { emoji });
    } catch (err) {
      console.warn('Erro ao reagir a mensagem direta:', err);
    }
  };

  const handleDeleteMsg = (msgId) => {
    setConfirmModal({
      open: true,
      message: 'Excluir esta mensagem?',
      onConfirm: async () => {
        setConfirmModal({ open: false, message: '', onConfirm: null });
        try { await api.delete(`/social/dm/messages/${msgId}`); }
        catch (err) { console.warn('Erro ao excluir mensagem direta:', err); }
      },
    });
  };

  const handleSaveEdit = async () => {
    if (!editingMsg || !editingMsg.content.trim()) return;
    try {
      await api.put(`/social/dm/messages/${editingMsg.id}`, { content: editingMsg.content.trim() });
      setMessages((prev) => prev.map((m) =>
        m.id === editingMsg.id ? { ...m, content: editingMsg.content.trim(), edited_at: new Date().toISOString() } : m
      ));
    } catch (err) {
      console.warn('Erro ao editar mensagem direta:', err);
    } finally {
      setEditingMsg(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // New conversation: search users
  useEffect(() => {
    if (!newConvQuery.trim()) { setNewConvResults([]); return; }
    const timer = setTimeout(() => {
      api.get('/social/users/search', { params: { q: newConvQuery.trim() } })
        .then(({ data }) => setNewConvResults(data.users || []))
        .catch((err) => console.warn('Erro ao buscar usuarios para nova conversa:', err));
    }, 300);
    return () => clearTimeout(timer);
  }, [newConvQuery]);

  const startConversation = async (otherUserId) => {
    try {
      const { data } = await api.post(`/social/dm/conversations/${otherUserId}`);
      setShowNewConv(false);
      setNewConvQuery('');
      setNewConvResults([]);
      loadConversations();
      navigate(`/messages/${data.conversation_id}`);
    } catch (err) {
      console.warn('Erro ao iniciar conversa:', err);
    }
  };

  return (
    <div className="messages-page">
      <div className="messages-container">
        {/* Left sidebar: conversation list */}
        <div className="messages-sidebar">
          <div className="messages-sidebar-header">
            <h2>Mensagens</h2>
            <button className="dm-new-conv-btn" onClick={() => setShowNewConv((v) => !v)} aria-label="Nova conversa" title="Nova conversa">
              <Icon><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Icon>
            </button>
          </div>
          {showNewConv && (
            <div className="dm-new-conv-panel">
              <input
                className="dm-new-conv-input"
                type="text"
                placeholder="Buscar usuario..."
                value={newConvQuery}
                onChange={(e) => setNewConvQuery(e.target.value)}
                autoFocus
              />
              <div className="dm-new-conv-results">
                {newConvResults.map((u) => (
                  <div key={u.id} className="dm-new-conv-user" onClick={() => startConversation(u.id)}>
                    {(u.photo || u.id) ? (
                      <img className="dm-new-conv-avatar" src={buildAvatarSrc(u.photo, u.photo_mime, u.id)} alt={u.name} />
                    ) : (
                      <span className="dm-new-conv-avatar dm-new-conv-initial">{(u.name || 'U')[0]?.toUpperCase()}</span>
                    )}
                    <div>
                      <strong>{u.name}</strong>
                      {u.username && <span className="dm-new-conv-username">@{u.username}</span>}
                    </div>
                  </div>
                ))}
                {newConvQuery.trim() && newConvResults.length === 0 && (
                  <div className="dm-new-conv-empty">Nenhum usuario encontrado.</div>
                )}
              </div>
            </div>
          )}
          <div className="dm-search-wrap">
            <Icon><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Icon>
            <input
              className="dm-search-input"
              type="text"
              placeholder="Buscar conversa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="messages-conv-list">
            {filteredConversations.length === 0 && (
              <div className="messages-empty">{searchQuery ? 'Nenhum resultado.' : 'Nenhuma conversa ainda.'}</div>
            )}
            {filteredConversations.map((conv) => {
              const avatarSrc = buildAvatarSrc(conv.other_photo, conv.other_photo_mime, conv.other_user_id);
              return (
                <div
                  key={conv.id}
                  className={`messages-conv-item ${conv.id === activeConvId ? 'active' : ''}${conv.unread_count > 0 ? ' unread' : ''}`}
                  onClick={() => navigate(`/messages/${conv.id}`)}
                >
                  <div className="messages-conv-avatar">
                    {avatarSrc ? (
                      <img src={avatarSrc} alt={conv.other_name} />
                    ) : (
                      <span>{(conv.other_name || 'U')[0]?.toUpperCase()}</span>
                    )}
                    {onlineMap[conv.other_user_id] && <span className="dm-online-dot" />}
                  </div>
                  <div className="messages-conv-info">
                    <div className="messages-conv-name">
                      <strong>{conv.other_name}</strong>
                      {conv.other_is_ai && <span className="dm-ai-badge">IA</span>}
                      <span>{formatTime(conv.last_message_at)}</span>
                    </div>
                    {conv.other_username && (
                      <div className="messages-conv-username">@{conv.other_username}</div>
                    )}
                    <div className="messages-conv-preview">
                      {conv.last_message || 'Sem mensagens'}
                    </div>
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="messages-unread-badge">{conv.unread_count}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel: messages */}
        {activeConvId && activeConv ? (
          <div className="messages-panel">
            <div className="messages-panel-header">
              <button className="dm-back-btn" onClick={() => navigate('/messages')} aria-label="Voltar">
                <Icon width="20" height="20"><polyline points="15 18 9 12 15 6" /></Icon>
              </button>
              <div className="messages-panel-avatar dm-clickable" onClick={() => navigate(`/profile/${activeConv.other_user_id}`)}>
                {buildAvatarSrc(activeConv.other_photo, activeConv.other_photo_mime, activeConv.other_user_id) ? (
                  <img src={buildAvatarSrc(activeConv.other_photo, activeConv.other_photo_mime, activeConv.other_user_id)} alt={activeConv.other_name} />
                ) : (
                  <span>{(activeConv.other_name || 'U')[0]?.toUpperCase()}</span>
                )}
                {onlineMap[activeConv.other_user_id] && <span className="dm-online-dot" />}
              </div>
              <div className="messages-panel-user-info dm-clickable" onClick={() => navigate(`/profile/${activeConv.other_user_id}`)}>
                <strong>{activeConv.other_name}</strong>
                {activeConv.other_is_ai && <span className="dm-ai-badge">IA</span>}
                <span className="dm-panel-username">
                  {activeConv.other_username && `@${activeConv.other_username}`}
                  {onlineMap[activeConv.other_user_id] && <span className="dm-online-label"> · Online</span>}
                </span>
              </div>
              {!wsConnected && (
                <span className="dm-offline-badge" title="Sem conexão em tempo real">Offline</span>
              )}
              <button className="dm-search-msg-btn" onClick={() => { setMsgSearchOpen((v) => !v); setMsgSearch(''); setMsgSearchIdx(0); }} title="Buscar na conversa" aria-label="Buscar na conversa">
                <Icon width="16" height="16"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Icon>
              </button>
            </div>
            {msgSearchOpen && (() => {
              const matchIds = msgSearch ? messages.filter((m) => m.content?.toLowerCase().includes(msgSearch.toLowerCase())).map((m) => m.id) : [];
              const navigateSearch = (dir) => {
                if (matchIds.length === 0) return;
                const next = (msgSearchIdx + dir + matchIds.length) % matchIds.length;
                setMsgSearchIdx(next);
                document.getElementById(`dm-msg-${matchIds[next]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              };
              return (
                <div className="dm-msg-search-bar">
                  <input
                    type="text"
                    placeholder="Buscar mensagens..."
                    value={msgSearch}
                    onChange={(e) => { setMsgSearch(e.target.value); setMsgSearchIdx(0); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); navigateSearch(1); } }}
                    autoFocus
                  />
                  {msgSearch && (
                    <>
                      <span className="dm-msg-search-count">{matchIds.length > 0 ? `${msgSearchIdx + 1}/${matchIds.length}` : '0 resultados'}</span>
                      <button className="dm-msg-search-nav" onClick={() => navigateSearch(-1)} disabled={matchIds.length === 0} aria-label="Anterior">
                        <Icon width="14" height="14"><polyline points="18 15 12 9 6 15" /></Icon>
                      </button>
                      <button className="dm-msg-search-nav" onClick={() => navigateSearch(1)} disabled={matchIds.length === 0} aria-label="Próximo">
                        <Icon width="14" height="14"><polyline points="6 9 12 15 18 9" /></Icon>
                      </button>
                    </>
                  )}
                  <button className="dm-msg-search-close" onClick={() => { setMsgSearchOpen(false); setMsgSearch(''); setMsgSearchIdx(0); }}>&times;</button>
                </div>
              );
            })()}
            <div className="messages-list" ref={messagesListRef}>
              {loadingMessages && messages.length === 0 && (
                <div className="dm-skeleton-wrap">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className={`dm-skeleton-row ${i % 3 === 0 ? 'own' : 'other'}`}>
                      <div className="dm-skeleton-bubble" style={{ width: `${40 + (i * 13) % 30}%` }} />
                    </div>
                  ))}
                </div>
              )}
              {hasMoreMessages && !loadingMessages && messages.length > 0 && (
                <button onClick={loadOlderMessages} disabled={loadingMoreMessages} className="dm-load-older">
                  {loadingMoreMessages ? 'Carregando...' : 'Carregar anteriores'}
                </button>
              )}
              {!loadingMessages && messages.length === 0 && (
                <div className="dm-empty-chat">
                  <div className="dm-empty-chat-avatar">
                    {buildAvatarSrc(activeConv.other_photo, activeConv.other_photo_mime, activeConv.other_user_id) ? (
                      <img src={buildAvatarSrc(activeConv.other_photo, activeConv.other_photo_mime, activeConv.other_user_id)} alt={activeConv.other_name} />
                    ) : (
                      <span>{(activeConv.other_name || 'U')[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <strong>{activeConv.other_name}</strong>
                  <p>Envie a primeira mensagem para iniciar a conversa.</p>
                </div>
              )}
              {messages.map((msg, idx) => {
                const isOwn = currentUser && msg.sender_id === currentUser.id;
                const prevMsg = messages[idx - 1];
                const nextMsg = messages[idx + 1];
                const showDateSep = !prevMsg || getDateKey(msg.created_at) !== getDateKey(prevMsg.created_at);
                const isSearchMatch = msgSearch && msg.content?.toLowerCase().includes(msgSearch.toLowerCase());
                const sameSenderAsPrev = prevMsg && prevMsg.sender_id === msg.sender_id && !showDateSep;
                const sameSenderAsNext = nextMsg && nextMsg.sender_id === msg.sender_id && getDateKey(msg.created_at) === getDateKey(nextMsg?.created_at);
                const groupClass = sameSenderAsPrev ? ' grouped' : '';
                const lastInGroupClass = !sameSenderAsNext ? ' group-last' : '';
                return (
                  <React.Fragment key={msg.id}>
                    {showDateSep && (
                      <div className="dm-date-separator">
                        <span>{formatDateLabel(msg.created_at)}</span>
                      </div>
                    )}
                  <div id={`dm-msg-${msg.id}`} className={`messages-bubble-row ${isOwn ? 'own' : 'other'}${groupClass}${lastInGroupClass}${isSearchMatch ? ' search-highlight' : ''}${msgSearch && !isSearchMatch ? ' search-dim' : ''}${msg.deleted ? ' deleted' : ''}`}>
                    {reactPickerFor === msg.id && (
                      <div className="dm-react-wrap">
                        <div className="dm-react-picker">
                          {QUICK_REACTIONS.map((em) => (
                            <button key={em} className="dm-react-item" onClick={() => handleReact(msg.id, em)}>{em}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="messages-bubble">
                      {!msg.deleted && (
                        <div className="dm-msg-menu-wrap">
                          <button className="dm-msg-menu-trigger" onClick={() => setMenuOpenFor(menuOpenFor === msg.id ? null : msg.id)} aria-label="Opções da mensagem">
                            <Icon width="14" height="14"><polyline points="6 9 12 15 18 9" /></Icon>
                          </button>
                          {menuOpenFor === msg.id && (
                            <div className={`dm-msg-menu ${isOwn ? 'own' : 'other'}`}>
                              <button onClick={() => { setReplyTo({ id: msg.id, content: msg.content, sender_name: msg.sender_name || (isOwn ? 'Você' : activeConv.other_name) }); setMenuOpenFor(null); }}>
                                <Icon width="16" height="16"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></Icon>
                                <span>Responder</span>
                              </button>
                              <button onClick={() => { setReactPickerFor(msg.id); setMenuOpenFor(null); }}>
                                <Icon width="16" height="16"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></Icon>
                                <span>Reagir</span>
                              </button>
                              {msg.content && (
                                <button onClick={() => { navigator.clipboard.writeText(msg.content); setMenuOpenFor(null); }}>
                                  <Icon width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icon>
                                  <span>Copiar</span>
                                </button>
                              )}
                              {isOwn && (
                                <button onClick={() => { setEditingMsg({ id: msg.id, content: msg.content || '' }); setMenuOpenFor(null); }}>
                                  <Icon width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></Icon>
                                  <span>Editar</span>
                                </button>
                              )}
                              {isOwn && (
                                <button className="dm-msg-menu-danger" onClick={() => { handleDeleteMsg(msg.id); setMenuOpenFor(null); }}>
                                  <Icon width="16" height="16"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></Icon>
                                  <span>Apagar</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {msg.deleted ? (
                        <div className="dm-deleted-msg">Mensagem apagada</div>
                      ) : (
                        <>
                      {msg.reply_to_id && (msg.reply_content || msg.reply_sender_name) && (
                        <div className="dm-reply-context">
                          <strong>{msg.reply_sender_name}</strong>
                          <span>{msg.reply_content ? (msg.reply_content.length > 60 ? msg.reply_content.slice(0, 60) + '...' : msg.reply_content) : 'Mídia'}</span>
                        </div>
                      )}
                      {msg.media_url && (
                        <img src={msg.media_url} alt="Mídia" className="dm-media-img dm-media-clickable" onClick={() => setLightboxSrc(msg.media_url)} />
                      )}
                      {editingMsg && editingMsg.id === msg.id ? (
                        <div className="dm-edit-inline">
                          <textarea
                            className="dm-edit-textarea"
                            value={editingMsg.content}
                            onChange={(e) => setEditingMsg({ ...editingMsg, content: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); } if (e.key === 'Escape') setEditingMsg(null); }}
                            maxLength={2000}
                            autoFocus
                          />
                          <div className="dm-edit-actions">
                            <button onClick={() => setEditingMsg(null)}>Cancelar</button>
                            <button onClick={handleSaveEdit} className="dm-edit-save">Salvar</button>
                          </div>
                        </div>
                      ) : (
                        msg.content && <><span>{renderMessageContent(msg.content)}</span><span className="dm-bubble-time-spacer" /></>
                      )}
                      <span className="messages-bubble-time" title={msg.created_at ? new Date(parseDate(msg.created_at)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}>
                        {formatTime(msg.created_at)}
                        {msg.edited_at && <span className="dm-edited-label">editada</span>}
                        {isOwn && (
                          <span className={`dm-read-receipt ${msg.read_at ? 'read' : ''}`} title={msg.read_at ? 'Lida' : 'Enviada'}>
                            {msg.read_at ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 12 5 16 10 8" /><polyline points="8 12 12 16 22 4" /></svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 8 16 20 4" /></svg>
                            )}
                          </span>
                        )}
                      </span>
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="dm-reactions-row">
                          {Object.entries(msg.reactions).map(([emoji, userIds]) => (
                            <button
                              key={emoji}
                              className={`dm-reaction-chip ${currentUser && userIds.includes(currentUser.id) ? 'own' : ''}`}
                              onClick={() => handleReact(msg.id, emoji)}
                              title={`${userIds.length}`}
                            >
                              {emoji} {userIds.length > 1 ? userIds.length : ''}
                            </button>
                          ))}
                        </div>
                      )}
                      </>
                      )}
                    </div>
                  </div>
                  </React.Fragment>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {otherTyping && (
              <div className="dm-typing-indicator">
                <span className="dm-typing-dots"><span /><span /><span /></span>
                {activeConv.other_name} está digitando...
              </div>
            )}
            {replyTo && (
              <div className="dm-reply-preview">
                <div className="dm-reply-preview-content">
                  <strong>{replyTo.sender_name}</strong>
                  <span>{replyTo.content ? (replyTo.content.length > 80 ? replyTo.content.slice(0, 80) + '...' : replyTo.content) : 'Mídia'}</span>
                </div>
                <button className="dm-reply-preview-close" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta">&times;</button>
              </div>
            )}
            {mediaPreview && (
              <div className="dm-media-preview">
                <img src={mediaPreview.dataUrl} alt="Preview" />
                <button className="dm-media-remove" onClick={() => setMediaPreview(null)} aria-label="Remover imagem">&times;</button>
              </div>
            )}
            {sendError && (
              <div className="dm-send-error">
                <span>{sendError}</span>
                <button onClick={() => setSendError(null)}>&times;</button>
              </div>
            )}
            <div className="messages-input-area">
              <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
              <button className="dm-attach-btn" onClick={() => fileInputRef.current?.click()} aria-label="Anexar imagem">
                <Icon><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></Icon>
              </button>
              <div className="dm-emoji-wrap">
                <button className="dm-emoji-btn" onClick={() => setShowEmojiPicker((v) => !v)} aria-label="Emojis">
                  <Icon><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></Icon>
                </button>
                {showEmojiPicker && (
                  <div className="dm-emoji-picker">
                    {EMOJI_LIST.map((em) => (
                      <button key={em} className="dm-emoji-item" onClick={() => { setInputText((prev) => prev + em); setShowEmojiPicker(false); }}>
                        {em}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="dm-textarea-wrap">
                <textarea
                  ref={textareaRef}
                  className="dm-textarea"
                  placeholder="Escreva uma mensagem..."
                  value={inputText}
                  maxLength={2000}
                  onChange={(e) => { setInputText(e.target.value); sendTypingIndicator(); }}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  onInput={(e) => { e.target.style.height = 'auto'; const h = Math.min(e.target.scrollHeight, 160); e.target.style.height = h + 'px'; e.target.style.overflowY = e.target.scrollHeight > 160 ? 'auto' : 'hidden'; e.target.style.borderRadius = h > 44 ? '12px' : '20px'; }}
                />
                {inputText.length > 1800 && (
                  <span className={`dm-char-count${inputText.length >= 2000 ? ' limit' : ''}`}>{inputText.length}/2000</span>
                )}
              </div>
              <button className={`dm-send-btn${sending ? ' sending' : ''}`} onClick={handleSend} disabled={(!inputText.trim() && !mediaPreview) || sending} aria-label="Enviar">
                <Icon width="24" height="24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></Icon>
              </button>
            </div>
          </div>
        ) : (
          <div className="messages-placeholder">
            <div className="messages-placeholder-inner">
              <svg className="messages-placeholder-icon" viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <h3>Suas mensagens</h3>
              <p>Envie mensagens privadas para outros usuários da plataforma.</p>
              <button className="messages-placeholder-btn" onClick={() => setShowNewConv(true)}>
                Nova mensagem
              </button>
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        open={confirmModal.open}
        title="Confirmar"
        message={confirmModal.message}
        confirmText="Excluir"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ open: false, message: '', onConfirm: null })}
      />
      {lightboxSrc && (
        <div className="dm-lightbox" onClick={() => setLightboxSrc(null)}>
          <button className="dm-lightbox-close" onClick={() => setLightboxSrc(null)} aria-label="Fechar">&times;</button>
          <img src={lightboxSrc} alt="Imagem ampliada" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

export default Messages;

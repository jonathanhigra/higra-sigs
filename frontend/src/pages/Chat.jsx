import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import MarkdownRenderer from "../components/chat/MarkdownRenderer";

import ChatSidebar from "../components/chat/ChatSidebar";
import DeleteModal from "../components/chat/DeleteModal";
import "./Chat.css";

const SUGESTOES = [
  "Como funciona uma bomba anfíbia?",
  "Quais são os tipos de aeradores disponíveis?",
  "Me ajude a diagnosticar um problema no sistema hidráulico",
  "O que é cavitação e como evitar?",
];

const SendIcon = () => (
  <svg
    viewBox="0 0 24 24" width="28" height="28" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false"
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const getWsUrl = (token) => {
  const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const wsProtocol = apiUrl.startsWith("https") ? "wss" : "ws";
  const host = apiUrl.replace(/^https?:\/\//, "");
  return `${wsProtocol}://${host}/ws/chat?token=${token}`;
};

function Chat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [conversas, setConversas] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [conversationId, setConversationId] = useState(null);
  const [wsStatus, setWsStatus] = useState("connecting");
  const [feedback, setFeedback] = useState({});
  const [aiAvatar, setAiAvatar] = useState(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const toast = useToast();
  const [sendAnim, setSendAnim] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingMsg, setEditingMsg] = useState(null); // { index, text }
  const [sendError, setSendError] = useState(false);
  const ws = useRef(null);
  const endRef = useRef(null);
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const conversaIdRef = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectAttempt = useRef(0);
  const justCreatedConversaRef = useRef(null);
  const loadingConversaRef = useRef(null);
  // Smooth typewriter buffer refs
  const streamBufferRef = useRef("");
  const streamDisplayedLenRef = useRef(0);
  const streamRafRef = useRef(null);
  // Deduplication: track last sent message id
  const lastSentMsgRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const conversaId = query.get("conversa_id");

  const isNewConversation = query.get("new") === "1";
  const parsedConversaId = Number.parseInt(conversaId || "", 10);
  const activeConversaId = Number.isNaN(parsedConversaId) ? null : parsedConversaId;
  const showHero = !conversationId && messages.length === 0;
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // --- Smart scroll: só auto-scroll se perto do final ---
  const isNearBottom = useCallback(() => {
    const el = threadRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Smooth typewriter: drains buffer char-by-char via RAF
  const flushStreamBuffer = useCallback(() => {
    const animate = () => {
      const full = streamBufferRef.current;
      const displayed = streamDisplayedLenRef.current;
      if (displayed < full.length) {
        const next = Math.min(displayed + 3, full.length);
        streamDisplayedLenRef.current = next;
        const slice = full.substring(0, next);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && last?.meta?.streaming) {
            updated[updated.length - 1] = { ...last, content: slice };
          }
          return updated;
        });
        streamRafRef.current = requestAnimationFrame(animate);
      } else {
        streamRafRef.current = null;
      }
    };
    if (!streamRafRef.current) {
      streamRafRef.current = requestAnimationFrame(animate);
    }
  }, []);

  const isStreaming = messages.some((m) => m.meta?.streaming);

  // Ref para controlar se o usuário scrollou manualmente durante o streaming
  const userScrolledRef = useRef(false);

  const handleThreadScroll = useCallback(() => {
    const nearBottom = isNearBottom();
    setShowScrollBtn(!nearBottom);
    if (!nearBottom && (isStreaming || isTyping)) {
      userScrolledRef.current = true;
    }
    if (nearBottom) {
      userScrolledRef.current = false;
    }
  }, [isNearBottom, isStreaming, isTyping]);

  // Reset userScrolled quando streaming inicia
  useEffect(() => {
    if (isStreaming || isTyping) {
      userScrolledRef.current = false;
    }
  }, [isStreaming, isTyping]);

  useEffect(() => {
    if (isStreaming || isTyping) {
      if (!userScrolledRef.current) {
        scrollToBottom(false);
      }
    } else if (isNearBottom()) {
      scrollToBottom(false);
    }
  }, [messages, isTyping, isStreaming, isNearBottom, scrollToBottom]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (streamRafRef.current) cancelAnimationFrame(streamRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (location.state?.feedArticlePrompt) {
      setInput(location.state.feedArticlePrompt);
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => { conversaIdRef.current = activeConversaId; }, [activeConversaId]);
  useEffect(() => { setConversationId(activeConversaId || null); }, [activeConversaId]);

  useEffect(() => {
    api.get("/social/ai-profile").then(({ data }) => {
      const p = data?.profile;
      if (p?.photo) {
        setAiAvatar(`data:${p.photo_mime || "image/jpeg"};base64,${p.photo}`);
      }
    }).catch(() => {});
  }, []);

  const carregarConversas = useCallback(async () => {
    try {
      const { data } = await api.get("/historico/conversas");
      const lista = data?.conversas || data?.conversa || [];
      const ordenadas = Array.isArray(lista)
        ? [...lista].sort((a, b) => new Date(b.atualizado_em) - new Date(a.atualizado_em))
        : [];
      setConversas(ordenadas);
    } catch (err) {
      console.error("Erro ao carregar conversas:", err);
    }
  }, []);

  const carregarMensagens = useCallback(async (conversaIdAtual) => {
    if (!conversaIdAtual) { setMessages([]); return; }
    loadingConversaRef.current = conversaIdAtual;
    setMessages([]);
    setLoadingMsgs(true);
    try {
      const { data } = await api.get(`/historico/conversas/${conversaIdAtual}/mensagens`);
      // Ignorar resposta se o usuário já clicou em outra conversa
      if (loadingConversaRef.current !== conversaIdAtual) return;
      const lista = data?.mensagens || [];
      if (!Array.isArray(lista)) { setMessages([]); return; }
      const hasUser = lista.some((m) => m.role === "user");
      const normalizadas = (hasUser ? lista.filter((m) => m.role !== "system") : lista)
        .filter((m, idx) => !(m.role === "system" && idx !== 0));
      const comMeta = normalizadas.map((m, idx) =>
        m.role === "system" && idx === 0
          ? { ...m, meta: { ...(m.meta || {}), inicial: true } }
          : m
      );
      setMessages(comMeta);
      setTimeout(() => scrollToBottom(false), 50);
    } catch (err) {
      console.error("Erro ao carregar mensagens:", err);
      if (loadingConversaRef.current === conversaIdAtual) setMessages([]);
    } finally {
      if (loadingConversaRef.current === conversaIdAtual) setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    carregarConversas();
    const handler = () => carregarConversas();
    window.addEventListener("historico-atualizado", handler);
    return () => window.removeEventListener("historico-atualizado", handler);
  }, [carregarConversas]);


  useEffect(() => {
    if (conversationId) {
      // Pular reload se a conversa acabou de ser criada (mensagens ainda não salvas no DB)
      if (justCreatedConversaRef.current === conversationId) {
        justCreatedConversaRef.current = null;
        return;
      }
      carregarMensagens(conversationId);
    } else {
      setMessages([]); setInput(""); setIsTyping(false);
    }
  }, [conversationId, carregarMensagens]);


  useEffect(() => {
    if (!isNewConversation) return;
    setMessages([]); setInput(""); setIsTyping(false);
    conversaIdRef.current = null;
    navigate("/chat", { replace: true });
  }, [isNewConversation, navigate]);

  // --- WebSocket com reconexão automática ---
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const connect = () => {
      if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING) return;
      setWsStatus("connecting");
      const socket = new WebSocket(getWsUrl(token));
      ws.current = socket;

      socket.onopen = () => {
        setWsStatus("connected");
        reconnectAttempt.current = 0;
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "conversa") {
          if (data.conversa_id && data.conversa_id !== conversaIdRef.current) {
            justCreatedConversaRef.current = data.conversa_id;
            conversaIdRef.current = data.conversa_id;
            navigate(`/chat?conversa_id=${data.conversa_id}`, { replace: true });
          }
          if (data.mensagem_inicial) {
            setMessages((prev) => {
              if (prev.some((m) => m.meta?.inicial) || prev.some((m) => m.role === "user")) return prev;
              return [...prev, {
                role: "system", content: data.mensagem_inicial,
                meta: { inicial: true },
              }];
            });
          }
          carregarConversas();

        } else if (data.type === "stream_start") {
          setIsTyping(false);
          streamBufferRef.current = "";
          streamDisplayedLenRef.current = 0;
          if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null; }
          setMessages((prev) => [...prev, { role: "assistant", content: "", meta: { streaming: true, ts: new Date().toISOString() } }]);

        } else if (data.type === "stream_chunk") {
          streamBufferRef.current += data.texto;
          flushStreamBuffer();

        } else if (data.type === "stream_end") {
          // Cancel RAF and flush remaining buffer instantly
          if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null; }
          const finalText = streamBufferRef.current || data.conteudo?.resposta || "";
          const fontes = data.fontes || [];
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant") {
              const content = last?.meta?.streaming ? finalText : (last.content || finalText);
              updated[updated.length - 1] = { ...last, content, meta: { ...last.meta, streaming: false, fontes } };
            }
            return updated;
          });
          streamBufferRef.current = "";
          streamDisplayedLenRef.current = 0;
          setIsTyping(false);
          // Clear dedup ref after response complete
          lastSentMsgRef.current = null;
          carregarConversas();
          if (data.conversa_id && data.conversa_id !== conversaIdRef.current) {
            navigate(`/chat?conversa_id=${data.conversa_id}`, { replace: true });
          }

        } else if (data.type === "resposta") {
          const payload = data?.conteudo;
          const texto =
            payload && typeof payload === "object" && payload.resposta ? payload.resposta
            : payload && typeof payload === "object" && payload.texto ? payload.texto
            : typeof data.conteudo === "string" ? data.conteudo : JSON.stringify(data.conteudo);
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: texto, meta: typeof payload === "object" ? payload : null },
          ]);
          setIsTyping(false);
          lastSentMsgRef.current = null;
          carregarConversas();
          if (data.conversa_id && data.conversa_id !== conversaIdRef.current) {
            navigate(`/chat?conversa_id=${data.conversa_id}`, { replace: true });
          }

        } else if (data.type === "erro") {
          setMessages((prev) => [...prev, { role: "assistant", content: data.mensagem, meta: { erro: true } }]);
          setIsTyping(false);
          lastSentMsgRef.current = null;
        }
      };

      socket.onerror = () => console.error("WebSocket erro");
      socket.onclose = () => {
        setWsStatus("disconnected");
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempt.current), 15000);
        reconnectAttempt.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      reconnectAttempt.current = 0;
      if (ws.current) { ws.current.onclose = null; ws.current.close(); }
    };
  }, [navigate, carregarConversas, flushStreamBuffer]);

  // --- Handlers ---
  const doSend = useCallback((text) => {
    if (!text.trim() || isTyping) return;

    // Deduplication: skip if same message already sent
    if (lastSentMsgRef.current === text.trim()) return;
    lastSentMsgRef.current = text.trim();

    if (wsStatus !== "connected") {
      setSendError(true);
      setTimeout(() => setSendError(false), 3000);
      return;
    }

    setMessages((prev) => {
      const semInicial = prev.filter((m) => !m.meta?.inicial && m.role !== "system");
      return [...semInicial, { role: "user", content: text, meta: { ts: new Date().toISOString() } }];
    });
    setIsTyping(true);

    const payload = { mensagem: text };
    if (conversaIdRef.current) payload.conversa_id = conversaIdRef.current;
    else payload.nova_conversa = true;

    try {
      ws.current.send(JSON.stringify(payload));
    } catch (err) {
      console.error("Erro ao enviar via WS:", err);
      setSendError(true);
      setTimeout(() => setSendError(false), 3000);
      setIsTyping(false);
      lastSentMsgRef.current = null;
    }
  }, [isTyping, wsStatus]);

  const handleSend = () => {
    if (!input.trim()) return;
    setSendAnim(true);
    setTimeout(() => setSendAnim(false), 400);
    doSend(input);
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.borderRadius = "20px";
      inputRef.current.style.overflowY = "hidden";
    }
  };

  const handleSendDirect = (text) => {
    doSend(text);
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Atalhos globais: Escape fecha sidebar, Ctrl+N nova conversa
  useEffect(() => {
    const handleGlobalKey = (e) => {
      if (e.key === "Escape" && !isSidebarCollapsed) {
        setIsSidebarCollapsed(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        navigate("/chat?new=1");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && messages.length > 0) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, [isSidebarCollapsed, navigate]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    const h = Math.min(el.scrollHeight, 160);
    el.style.height = h + "px";
    el.style.overflowY = el.scrollHeight > 160 ? "auto" : "hidden";
    scrollToBottom(false);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Copiado!", 2000);
    }).catch(() => {});
  };

  const handleFeedback = (msgIndex, type) => {
    const prev = feedback[msgIndex];
    const newType = prev === type ? null : type;
    setFeedback((p) => ({ ...p, [msgIndex]: newType }));

    if (!newType) return;

    const msg = messages[msgIndex];

    // Send feedback to backend for RAG relevance tracking
    const fontes = msg?.meta?.fontes || [];
    const sources = fontes.map(f => f.source).filter(Boolean).join(",");
    if (sources) {
      const fd = new FormData();
      fd.append("feedback_type", newType);
      fd.append("sources", sources);
      api.post("/upload/feedback", fd).catch(() => {});
    }

    // Like → indexa resposta como conhecimento validado no RAG
    if (newType === "like") {
      const responseText = getTextContent(msg.content);
      if (responseText && responseText.length >= 50) {
        const prevUserMsg = [...messages].slice(0, msgIndex).reverse().find(m => m.role === "user");
        const query = prevUserMsg ? getTextContent(prevUserMsg.content) : "";
        const fd = new FormData();
        fd.append("text", responseText);
        fd.append("query", query);
        api.post("/upload/learn", fd).catch(() => {});
      }
    }
  };

  const handleRegenerate = () => {
    if (isTyping || wsStatus !== "connected") return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    setMessages((prev) => prev.slice(0, -1));
    setIsTyping(true);
    const payload = { mensagem: getTextContent(lastUserMsg.content) };
    if (conversaIdRef.current) payload.conversa_id = conversaIdRef.current;
    ws.current.send(JSON.stringify(payload));
  };

  const handleStop = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "stop" }));
    }
    if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null; }
    const finalText = streamBufferRef.current;
    setIsTyping(false);
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.meta?.streaming) {
        updated[updated.length - 1] = { ...last, content: finalText || last.content, meta: { ...last.meta, streaming: false, stopped: true } };
      }
      return updated;
    });
    streamBufferRef.current = "";
    streamDisplayedLenRef.current = 0;
    lastSentMsgRef.current = null;
  };

  // --- Editar mensagem do usuário ---
  const handleEditStart = (index) => {
    const msg = messages[index];
    if (!msg || msg.role !== "user") return;
    setEditingMsg({ index, text: getTextContent(msg.content) });
  };

  const handleEditCancel = () => setEditingMsg(null);

  const handleEditSave = () => {
    if (!editingMsg || !editingMsg.text.trim() || isTyping) return;
    // Remove this message and all after it, then resend
    const newText = editingMsg.text.trim();
    setMessages((prev) => prev.slice(0, editingMsg.index));
    setEditingMsg(null);
    doSend(newText);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/historico/conversas/${deleteTarget.id}`);
      await carregarConversas();
      if (conversationId === deleteTarget.id) {
        conversaIdRef.current = null;
        navigate("/chat?new=1", { replace: true });
      }
    } catch (err) {
      console.error("Erro ao excluir conversa:", err);
    } finally {
      setDeleteTarget(null);
    }
  };

  const getTextContent = (content) =>
    typeof content === "string" ? content : content?.texto || "";

  return (
    <div className="container chat-page">
      <div className="chat-shell">
        <div className={`chat-layout ${isSidebarCollapsed ? "collapsed-right" : ""}`}>
          <div className="chat-main">
            {wsStatus !== "connected" && (
              <div className={`ws-status-bar ${wsStatus}`}>
                {wsStatus === "connecting" ? "Conectando..." : "Desconectado — reconectando..."}
              </div>
            )}

            {sendError && (
              <div className="ws-send-error-toast">Sem conexão — mensagem não enviada</div>
            )}

            {showHero ? (
              <div className="chat-hero">
                <div className="chat-hero-center">
                  {aiAvatar && <img src={aiAvatar} alt="Arquimedes" className="chat-hero-avatar" />}
                  <h2 className="chat-hero-title">Como posso ajudar?</h2>
                  <p className="chat-hero-subtitle">Especialista em hidráulica e bombas centrífugas</p>
                  <div className="chat-input-pill">
                    <textarea
                      className="chat-input"
                      rows={1}
                      placeholder="Pergunte qualquer coisa"
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      disabled={isTyping}
                    />
                    <button
                      className={`round-send${sendAnim ? " sending" : ""}`}
                      onClick={handleSend}
                      disabled={isTyping || !input.trim()}
                      aria-label="Enviar mensagem"
                    >
                      <SendIcon />
                    </button>
                  </div>
                  <div className="chat-suggestions">
                    {SUGESTOES.map((s, i) => (
                      <button
                        key={i}
                        className="chat-suggestion-chip"
                        onClick={() => handleSendDirect(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {searchOpen && (
                  <div className="chat-search-bar" role="search">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input
                      autoFocus
                      className="chat-search-input"
                      placeholder="Buscar na conversa…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); setSearchTerm(""); } }}
                    />
                    {searchTerm && (
                      <button className="chat-search-clear" onClick={() => setSearchTerm("")} aria-label="Limpar busca">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    )}
                  </div>
                )}
                <div className="chat-thread" ref={threadRef} onScroll={handleThreadScroll} role="log" aria-live="polite">
                  {loadingMsgs && (
                    <div className="chat-skeleton-wrap">
                      {[1, 2, 3].map((n) => (
                        <div key={n} className={`chat-skeleton ${n % 2 === 0 ? "right" : "left"}`}>
                          <div className="skeleton-line" style={{ width: n === 2 ? "40%" : "65%" }} />
                        </div>
                      ))}
                    </div>
                  )}
                  {messages.map((m, i) => {
                    const matchesSearch = searchTerm && getTextContent(m.content).toLowerCase().includes(searchTerm.toLowerCase());
                    return (
                    <div key={`${m.role}-${i}`} className={`chat-msg ${m.role === "user" ? "user" : "ai"}${matchesSearch ? " search-hit" : ""}${searchTerm && !matchesSearch ? " search-dim" : ""}`}>
                      {m.role === "user" ? (
                        <div className="bubble-wrap msg-enter">
                          {editingMsg?.index === i ? (
                            <div className="edit-msg-area">
                              <textarea
                                className="edit-msg-textarea"
                                value={editingMsg.text}
                                onChange={(e) => setEditingMsg((prev) => ({ ...prev, text: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditSave(); } if (e.key === "Escape") handleEditCancel(); }}
                                autoFocus
                                rows={2}
                              />
                              <div className="edit-msg-actions">
                                <button onClick={handleEditCancel}>Cancelar</button>
                                <button className="edit-save" onClick={handleEditSave} disabled={!editingMsg.text.trim()}>Salvar</button>
                              </div>
                            </div>
                          ) : (
                            <div className="user-bubble-row">
                              <button className="edit-msg-btn" onClick={() => handleEditStart(i)} title="Editar mensagem" type="button" aria-label="Editar mensagem">
                                <EditIcon />
                              </button>
                              <div className="bubble user-bubble">{getTextContent(m.content)}</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={`ai-content msg-enter${m.meta?.erro ? " ai-content-erro" : ""}`}>
                          {m.meta?.erro ? (
                            <span className="erro-inline">
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                              {getTextContent(m.content)}
                            </span>
                          ) : (
                            <>
                            <MarkdownRenderer content={getTextContent(m.content)} />
                            {m.meta?.streaming && <span className="cursor" />}
                            </>
                          )}
                          {!m.meta?.streaming && !m.meta?.erro && getTextContent(m.content) && (
                            <div className="ai-actions-row">
                              <button className="ai-action-btn" onClick={() => handleCopy(getTextContent(m.content))} title="Copiar" type="button" aria-label="Copiar resposta">
                                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              </button>
                              {i === messages.length - 1 && !isTyping && (
                                <button className="ai-action-btn" onClick={handleRegenerate} title="Regenerar" type="button">
                                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="23 4 23 10 17 10" />
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                  </svg>
                                </button>
                              )}
                              <button
                                className={`ai-action-btn${feedback[i] === "like" ? " active-like" : ""}`}
                                onClick={() => handleFeedback(i, "like")}
                                title="Boa resposta" type="button"
                              >
                                <svg viewBox="0 0 24 24" width="15" height="15" fill={feedback[i] === "like" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                                </svg>
                              </button>
                              <button
                                className={`ai-action-btn${feedback[i] === "dislike" ? " active-dislike" : ""}`}
                                onClick={() => handleFeedback(i, "dislike")}
                                title="Resposta ruim" type="button"
                              >
                                <svg viewBox="0 0 24 24" width="15" height="15" fill={feedback[i] === "dislike" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                                </svg>
                              </button>

                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                  {isTyping && !messages.some((m) => m.meta?.streaming) && (
                    <div className="chat-msg ai msg-enter">
                      <div className="ai-content">
                        <div className="typing-dots">
                          <span></span><span></span><span></span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>

                {showScrollBtn && (
                  <button className="scroll-to-bottom" onClick={scrollToBottom} aria-label="Ir para o final" type="button">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                )}

                <div className="chat-input-sticky">
                  <div className="chat-input-pill">
                    <textarea
                      ref={inputRef}
                      className="chat-input"
                      rows={1}
                      placeholder="Pergunte qualquer coisa"
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      disabled={isTyping}
                    />
                    {isTyping ? (
                      <button className="round-send stop-btn" onClick={handleStop} aria-label="Parar geração" type="button">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                      </button>
                    ) : (
                      <button
                        className={`round-send${sendAnim ? " sending" : ""}`}
                        onClick={handleSend}
                        disabled={!input.trim()}
                        aria-label="Enviar mensagem"
                      >
                        <SendIcon />
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <ChatSidebar
          conversas={conversas}
          conversationId={conversationId}
          isCollapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed((prev) => !prev)}
          onDelete={setDeleteTarget}
          onRename={async (id, titulo) => {
            try {
              await api.patch(`/historico/conversas/${id}/rename`, { titulo });
              setConversas((prev) => prev.map((c) => (c.id === id ? { ...c, titulo } : c)));
            } catch (err) {
              console.error('Erro ao renomear conversa:', err);
            }
          }}
        />
      </div>

      <DeleteModal
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />

      <button
        className="mobile-sidebar-toggle"
        onClick={() => setIsSidebarCollapsed((prev) => !prev)}
        aria-label="Abrir histórico"
        type="button"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default Chat;

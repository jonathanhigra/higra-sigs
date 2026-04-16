import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";

function ChatSidebar({
  conversas,
  conversationId,
  isCollapsed,
  onToggle,
  onDelete,
  onRename,
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return conversas;
    const q = search.toLowerCase();
    return conversas.filter((c) =>
      (c.titulo || "").toLowerCase().includes(q)
    );
  }, [conversas, search]);

  return (
    <div className={`chat-sidebar sidebar-right ${isCollapsed ? "is-collapsed collapsed" : ""}`}>
      <aside className="chat-sidebar-panel chat-history">
        <div className="chat-history-header">
          <h5 className="chat-history-title">
            <svg
              viewBox="0 0 24 24" width="16" height="16" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden="true" focusable="false"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            <span>Conversas</span>
          </h5>
        </div>

        <button
          type="button"
          className="chat-new-btn"
          onClick={() => navigate("/chat?new=1")}
        >
          <svg
            viewBox="0 0 24 24" width="16" height="16" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true" focusable="false"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nova conversa
        </button>

        <div className="chat-search-wrap">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="chat-search-input"
            type="text"
            placeholder="Buscar conversas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="chat-history-empty">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.4 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p>{search.trim() ? "Nenhuma conversa encontrada." : "Nenhum histórico disponível."}</p>
          </div>
        ) : (
          <ul className="chat-history-list">
            {filtered.map((c, index) => (
              <li key={c.id}>
                <div className={`chat-history-item ${conversationId === c.id ? "active" : ""}`} style={{ animationDelay: `${index * 60}ms` }}>
                  <Link to={`/chat?conversa_id=${c.id}`} className="chat-history-link">
                    <div className="chat-history-name-row">
                      <span className={`chat-history-name ${c.titulo ? '' : 'is-placeholder'}`}>
                        {c.titulo || "Sem Nome"}
                      </span>
                      {onRename && (
                        <button
                          type="button"
                          className="chat-history-edit-btn"
                          aria-label="Editar nome"
                          title="Editar nome"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setRenameTarget(c);
                            setRenameValue(c.titulo || "");
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </Link>
                  <button
                    type="button"
                    className="chat-history-delete"
                    aria-label="Excluir conversa"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDelete(c);
                    }}
                  >
                    <svg
                      className="chat-history-delete-icon"
                      viewBox="0 0 24 24" width="18" height="18" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      aria-hidden="true" focusable="false"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="chat-sidebar-footer">
        <button
          type="button"
          className="chat-sidebar-toggle"
          onClick={onToggle}
          aria-label={isCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
          title={isCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {isCollapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
          </svg>
        </button>
      </div>

      {/* Modal de renomear */}
      {renameTarget && (
        <div
          className="chat-modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setRenameTarget(null); }}
        >
          <div className="chat-modal">
            <h4>Renomear conversa</h4>
            <input
              type="text"
              className="chat-rename-input"
              placeholder="Ex: Dúvida sobre bombas"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && onRename) {
                  onRename(renameTarget.id, renameValue.trim());
                  setRenameTarget(null);
                  setRenameValue("");
                }
              }}
              autoFocus
              maxLength={200}
            />
            <div className="chat-modal-actions">
              <button type="button" className="chat-modal-cancel" onClick={() => setRenameTarget(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="chat-modal-primary"
                onClick={() => {
                  if (onRename) onRename(renameTarget.id, renameValue.trim());
                  setRenameTarget(null);
                  setRenameValue("");
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatSidebar;

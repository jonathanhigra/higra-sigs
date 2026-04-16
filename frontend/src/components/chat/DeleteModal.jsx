import React from "react";

function DeleteModal({ target, onCancel, onConfirm }) {
  if (!target) return null;

  return (
    <div
      className="chat-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-delete-title"
    >
      <div className="chat-modal">
        <h4 id="chat-delete-title">Excluir conversa?</h4>
        <p>Essa ação não pode ser desfeita.</p>
        <div className="chat-modal-actions">
          <button type="button" className="chat-modal-cancel" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="chat-modal-confirm" onClick={onConfirm}>
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteModal;

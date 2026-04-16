import React, { useRef, useState } from 'react';
import api from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import './AvatarUploadModal.css';

const AvatarUploadModal = ({ open, currentSrc, onClose, onSaved, targetUserId }) => {
  const toast = useToast();
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast('A imagem deve ter no maximo 2 MB.', 'error');
      e.target.value = '';
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(f);
  };

  const handleSave = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const url = targetUserId ? `/auth/admin/users/${targetUserId}` : '/auth/me';
      await api.put(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast('Foto atualizada!', 'success');
      onSaved();
    } catch (err) {
      console.error('Erro ao atualizar foto:', err);
      toast('Erro ao atualizar foto.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      const url = targetUserId ? `/auth/admin/users/${targetUserId}/photo` : '/auth/me/photo';
      await api.delete(url);
      toast('Foto removida.', 'success');
      onSaved();
    } catch (err) {
      console.error('Erro ao remover foto:', err);
      toast('Erro ao remover foto.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setPreview(null);
    setFile(null);
    onClose();
  };

  const displaySrc = preview || currentSrc;

  return (
    <div className="avatar-modal-overlay" onClick={handleClose}>
      <div className="avatar-modal" onClick={(e) => e.stopPropagation()}>
        <div className="avatar-modal-header">
          <button className="avatar-modal-close" type="button" onClick={handleClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <h3>Foto do perfil</h3>
          <button
            className="avatar-modal-save"
            type="button"
            onClick={handleSave}
            disabled={!file || saving}
          >
            {saving ? 'Salvando...' : 'Aplicar'}
          </button>
        </div>

        <div className="avatar-modal-body">
          <div className="avatar-modal-preview">
            {displaySrc ? (
              <img src={displaySrc} alt="Preview" />
            ) : (
              <div className="avatar-modal-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            )}
          </div>

          <div className="avatar-modal-actions">
            <button
              className="avatar-modal-upload-btn"
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={saving}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Enviar foto
            </button>
            {currentSrc && (
              <button
                className="avatar-modal-remove-btn"
                type="button"
                onClick={handleRemove}
                disabled={saving}
              >
                Remover foto
              </button>
            )}
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>
    </div>
  );
};

export default AvatarUploadModal;

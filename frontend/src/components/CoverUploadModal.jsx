import React, { useRef, useState } from 'react';
import api from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import './CoverUploadModal.css';

const CoverUploadModal = ({ open, currentSrc, onClose, onSaved, targetUserId }) => {
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
      formData.append('cover', file);
      const url = targetUserId ? `/auth/admin/users/${targetUserId}/cover` : '/auth/me/cover';
      await api.put(url, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast('Capa atualizada!', 'success');
      onSaved();
    } catch (err) {
      console.error('Erro ao atualizar capa:', err);
      toast('Erro ao atualizar capa.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      const url = targetUserId ? `/auth/admin/users/${targetUserId}/cover` : '/auth/me/cover';
      await api.delete(url);
      toast('Capa removida.', 'success');
      onSaved();
    } catch (err) {
      console.error('Erro ao remover capa:', err);
      toast('Erro ao remover capa.', 'error');
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
  const hasCustomCover = currentSrc && !currentSrc.includes('/assets/');

  return (
    <div className="cover-modal-overlay" onClick={handleClose}>
      <div className="cover-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cover-modal-header">
          <button className="cover-modal-close" type="button" onClick={handleClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <h3>Foto de capa</h3>
          <button
            className="cover-modal-save"
            type="button"
            onClick={handleSave}
            disabled={!file || saving}
          >
            {saving ? 'Salvando...' : 'Aplicar'}
          </button>
        </div>

        <div className="cover-modal-body">
          <div className="cover-modal-preview">
            {displaySrc ? (
              <img src={displaySrc} alt="Preview" />
            ) : (
              <div className="cover-modal-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
            )}
          </div>

          <div className="cover-modal-actions">
            <button
              className="cover-modal-upload-btn"
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={saving}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Enviar imagem
            </button>
            {hasCustomCover && (
              <button
                className="cover-modal-remove-btn"
                type="button"
                onClick={handleRemove}
                disabled={saving}
              >
                Remover capa
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

export default CoverUploadModal;

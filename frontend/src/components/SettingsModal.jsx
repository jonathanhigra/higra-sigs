import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../lib/api';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../contexts/ToastContext';
import useAuthStore from '../stores/authStore';

// Ícones (mantidos iguais para consistência visual)
const IconUser = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 22a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconPalette = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h2a5 5 0 0 0 5-5V8A5 5 0 0 0 12 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7.5 10.5h.01M6 6h.01M10 6h.01M18 10h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconSliders = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="4" cy="12" r="2" stroke="currentColor" strokeWidth="2"/>
    <circle cx="12" cy="14" r="2" stroke="currentColor" strokeWidth="2"/>
    <circle cx="20" cy="8" r="2" stroke="currentColor" strokeWidth="2"/>
  </svg>
);
const IconCrown = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 7l4 4 5-7 5 7 4-4v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconGlobe = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2"/>
    <path d="M3 12h18M12 3c-3 3-3 15 0 18m0-18c3 3 3 15 0 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconClose = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);
const IconShield = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconBook = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const SettingsModal = ({ open, onClose, targetUserId }) => {
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const hiddenModules = useAuthStore((s) => s.hiddenModules);
  const toggleHiddenModule = useAuthStore((s) => s.toggleHiddenModule);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState(null); // null | 'checking' | 'available' | 'taken' | 'invalid'
  const [usernameSuggestions, setUsernameSuggestions] = useState([]);
  const usernameTimer = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [activeTab, setActiveTab] = useState('conta');
  const [editAccount, setEditAccount] = useState(false);
  const [lang, setLang] = useState('pt-BR');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const overlayRef = useRef(null);

  // Conhecimento (RAG) state
  const [ragSources, setRagSources] = useState([]);
  const [ragStats, setRagStats] = useState(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragUploading, setRagUploading] = useState(false);
  const [ragUploadProgress, setRagUploadProgress] = useState(0);
  const [ragUploadStage, setRagUploadStage] = useState('');
  const [ragDeleting, setRagDeleting] = useState(null);
  const [ragDeleteStage, setRagDeleteStage] = useState('');
  const [ragDisplayName, setRagDisplayName] = useState('');
  const [ragEditing, setRagEditing] = useState(null);
  const [ragEditName, setRagEditName] = useState('');
  const [ragAnalytics, setRagAnalytics] = useState(null);

  // Admin state
  const [arcLoading, setArcLoading] = useState('');
  const [arcConfig, setArcConfig] = useState(null);
  const [cleanupDate, setCleanupDate] = useState('');
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersSearch, setAdminUsersSearch] = useState('');
  const [roleChanging, setRoleChanging] = useState(null);

  const fetchRagData = useCallback(async () => {
    setRagLoading(true);
    try {
      const { data } = await api.get('/upload/sources');
      setRagSources(data.sources || []);
      setRagStats(data.stats || null);
    } catch { /* not admin */ }
    finally { setRagLoading(false); }
    try {
      const { data } = await api.get('/upload/analytics');
      setRagAnalytics(data);
    } catch { /* not admin */ }
  }, []);

  const [ragIndexingSource, setRagIndexingSource] = useState(null);

  const handleRagUpload = useCallback(async (file) => {
    if (!file) return;
    setRagUploading(true);
    setRagUploadProgress(0);
    setRagUploadStage('Enviando arquivo…');
    const sourceName = ragDisplayName.trim() || file.name;
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (ragDisplayName.trim()) formData.append('display_name', ragDisplayName.trim());

      await api.post('/upload/documento', formData, {
        timeout: 300000,
        onUploadProgress: (e) => {
          const pct = Math.round((e.loaded * 100) / (e.total || 1));
          setRagUploadProgress(pct);
          if (pct >= 100) {
            setRagUploadStage('Upload concluído');
            // Switch to indexing stage
            setRagIndexingSource(file.name);
          }
        },
      });
      setRagUploadProgress(100);
      setRagUploadStage('Concluído!');
      toast.success(`"${sourceName}" indexado com sucesso!`);
      setRagDisplayName('');
      fetchRagData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao enviar documento');
    } finally {
      setTimeout(() => {
        setRagUploading(false);
        setRagUploadProgress(0);
        setRagUploadStage('');
        setRagIndexingSource(null);
      }, 800);
    }
  }, [toast, fetchRagData, ragDisplayName]);

  const handleRagDelete = useCallback(async (sourceName) => {
    setRagDeleting(sourceName);
    setRagDeleteStage('Removendo e re-indexando…');
    try {
      const { data } = await api.delete(`/upload/sources/${encodeURIComponent(sourceName)}`, { timeout: 120000 });
      toast.success(`"${sourceName}" removido do RAG`);
      const refreshed = await api.get('/upload/sources');
      setRagSources(refreshed.data.sources || []);
      setRagStats(refreshed.data.stats || null);
    } catch (err) {
      console.error('[RAG DELETE ERROR]', err?.response?.data || err);
      toast.error(err?.response?.data?.detail || 'Erro ao remover');
    } finally { setRagDeleting(null); setRagDeleteStage(''); }
  }, [toast]);

  const handleRagRename = useCallback(async (sourceName) => {
    const newName = ragEditName.trim();
    setRagEditing(null);
    if (!newName && !ragSources.find(s => s.source === sourceName)?.display_name) return;
    try {
      const formData = new FormData();
      formData.append('display_name', newName);
      await api.patch(`/upload/sources/${encodeURIComponent(sourceName)}`, formData);
      toast.success('Nome atualizado');
      fetchRagData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao renomear');
    }
  }, [ragEditName, ragSources, toast, fetchRagData]);

  const fetchAdminData = useCallback(async () => {
    try {
      const [configRes] = await Promise.all([
        api.get('/arquimedes/config'),
      ]);
      setArcConfig(configRes.data);
    } catch { /* not admin */ }
    try {
      const { data } = await api.get('/auth/admin/users');
      setAdminUsers(data.users || []);
    } catch (err) { console.error('[ADMIN USERS ERROR]', err?.response?.status, err?.response?.data); }
  }, []);

  // Carrega perfil (proprio ou target via admin)
  useEffect(() => {
    if (!open) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    setLoading(true);
    const url = targetUserId ? `/auth/admin/users/${targetUserId}` : '/auth/me';
    api.get(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const data = res.data || {};
        setUser(data);
        setName(data.name || '');
        setBio(data.bio || '');
        setEmail(data.email || '');
        setUsername(data.username || '');
      })
      .catch((err) => {
        console.error('Erro ao carregar perfil:', err);
        setError('Não foi possível carregar seu perfil.');
      })
      .finally(() => setLoading(false));
  }, [open, targetUserId]);

  // Sincroniza perfil global
  useEffect(() => {
    const handler = (e) => {
      const detail = e?.detail || {};
      setUser((prev) => ({ ...prev, ...detail }));
      if (detail.name) setName(detail.name);
      if (detail.bio !== undefined) setBio(detail.bio || '');
      if (detail.email) setEmail(detail.email);
      if (detail.username) setUsername(detail.username);
    };
    window.addEventListener('profile-updated', handler);
    return () => window.removeEventListener('profile-updated', handler);
  }, []);

  const handleUsernameChange = (value) => {
    const val = value.toLowerCase().replace(/[^a-z0-9._]/g, '');
    setUsername(val);
    setUsernameStatus(null);
    setUsernameSuggestions([]);
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    if (!val || val === (user?.username || '')) return;
    if (val.length < 3 || val.length > 30) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    usernameTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/auth/check-username/${encodeURIComponent(val)}`);
        setUsernameStatus(data.available ? 'available' : 'taken');
        setUsernameSuggestions(data.suggestions || []);
      } catch {
        setUsernameStatus(null);
      }
    }, 400);
  };

  const handleBackdrop = (e) => { if (e.target === overlayRef.current && onClose) onClose(); };

  // Salva nome/foto
  const handleSave = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) return;
    setSaving(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('name', name || '');
      formData.append('bio', bio || '');
      if (username && username !== (user?.username || '')) formData.append('username', username);
      if (photo) formData.append('photo', photo);

      const saveUrl = targetUserId ? `/auth/admin/users/${targetUserId}` : '/auth/me';
      await api.put(saveUrl, formData, { headers: { Authorization: `Bearer ${token}` } });

      const fetchUrl = targetUserId ? `/auth/admin/users/${targetUserId}` : '/auth/me';
      const res = await api.get(fetchUrl, { headers: { Authorization: `Bearer ${token}` } });
      setUser(res.data);
      setEditAccount(false);
      if (!targetUserId) {
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: res.data }));
      }
    } catch (err) {
      console.error('Erro ao salvar perfil:', err);
      if (err?.response?.status === 409) {
        setError(err.response.data?.detail || 'Username já está em uso.');
      } else {
        setError('Não foi possível salvar as alterações.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordMsg('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Preencha todos os campos.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não conferem.');
      return;
    }

    const token = localStorage.getItem('token');
    try {
      await api.post(
        '/auth/change-password',
        { current_password: currentPassword, new_password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPasswordMsg('Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Erro ao alterar senha:', err);
      if (err?.response?.status === 401) setPasswordError('Senha atual incorreta.');
      else setPasswordError('Erro ao alterar senha. Tente novamente.');
    }
  };

  if (!open) return null;
  const cycleLang = () => setLang((l) => (l === 'pt-BR' ? 'en-US' : 'pt-BR'));

  return createPortal(
    <div className="modal-overlay" ref={overlayRef} onMouseDown={handleBackdrop}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{targetUserId ? `Editar usuario #${targetUserId}` : 'Configurações'}</h2>
          <button className="icon-btn" onClick={onClose}><IconClose /></button>
        </div>

        <div className="settings-container">
          <aside className="settings-nav">
            {[
              { key: 'conta', label: 'Conta', icon: <IconUser /> },
              ...(!targetUserId ? [
                { key: 'Aparência', label: 'Aparência', icon: <IconPalette /> },
                { key: 'personalizar', label: 'Personalizar', icon: <IconSliders /> },
                { key: 'seguranca', label: 'Segurança', icon: <IconCrown /> },
              ] : []),
              ...(!targetUserId && user?.is_admin ? [
                { key: 'conhecimento', label: 'Conhecimento', icon: <IconBook /> },
                { key: 'admin', label: 'Admin', icon: <IconShield /> },
              ] : []),
            ].map((t) => (
              <button key={t.key}
                className={`settings-nav-item ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(t.key);
                  if (t.key === 'admin' && (!arcConfig || adminUsers.length === 0)) fetchAdminData();
                  if (t.key === 'conhecimento' && ragSources.length === 0) fetchRagData();
                }}>
                <span className="settings-nav-icon">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </aside>

          <section className="settings-content">
            {loading ? <p>Carregando...</p> : (
              <>
                {/* Conta */}
                {activeTab === 'conta' && (
                  <div className="settings-block">
                    <div className="settings-row">
                      <div className="row-left">
                        <div className="avatar">
                          {user?.photo ? (
                            <img src={`data:${user.photo_mime || 'image/jpeg'};base64,${user.photo}`} alt="Avatar" />
                          ) : (
                            <div className="avatar-fallback">{(user?.name || 'U').slice(0, 1).toUpperCase()}</div>
                          )}
                        </div>
                        <div className="row-text">
                          <div className="row-title">{user?.name || '-'}</div>
                          <div className="row-subtitle">{user?.username ? `@${user.username} · ` : ''}{user?.email || '-'}</div>
                        </div>
                      </div>
                      <div className="row-right">
                        <button className="btn secondary small pill" onClick={() => setEditAccount(!editAccount)}>
                          {editAccount ? 'Fechar' : 'Editar'}
                        </button>
                      </div>
                    </div>

                    {editAccount && (
                      <form className="settings-form" onSubmit={handleSave}>
                        <div className="form-row">
                          <label htmlFor="name">Nome</label>
                          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                        <div className="form-row">
                          <label htmlFor="username">Username</label>
                          <div className="username-input-wrapper">
                            <span className="username-prefix">@</span>
                            <input
                              id="username"
                              type="text"
                              value={username}
                              onChange={(e) => handleUsernameChange(e.target.value)}
                              placeholder="seu.username"
                              maxLength={30}
                              style={{ paddingLeft: 28 }}
                            />
                            {usernameStatus === 'checking' && <span className="username-status checking">...</span>}
                            {usernameStatus === 'available' && <span className="username-status available">&#10003;</span>}
                            {usernameStatus === 'taken' && <span className="username-status taken">&#10007;</span>}
                            {usernameStatus === 'invalid' && <span className="username-status taken">min 3 caracteres</span>}
                          </div>
                          {usernameStatus === 'taken' && usernameSuggestions.length > 0 && (
                            <div className="username-suggestions">
                              {usernameSuggestions.map((s) => (
                                <button key={s} type="button" className="username-suggestion" onClick={() => { setUsername(s); setUsernameStatus('available'); setUsernameSuggestions([]); }}>
                                  @{s}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="form-row">
                          <label htmlFor="bio">Bio</label>
                          <textarea id="bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Fale sobre voce..." style={{ resize: 'vertical' }} />
                        </div>
                        <div className="form-row">
                          <label>Email</label>
                          <input type="email" value={email} disabled readOnly style={{ opacity: 0.7 }} />
                        </div>
                        <div className="form-row">
                          <label>Foto</label>
                          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
                        </div>
                        {error && <div className="form-error">{error}</div>}
                        <div className="form-actions">
                          <button type="button" className="btn ghost" onClick={() => setEditAccount(false)}>Cancelar</button>
                          <button type="submit" className="btn primary" disabled={saving || usernameStatus === 'taken' || usernameStatus === 'invalid'}>{saving ? 'Salvando...' : 'Salvar'}</button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* Segurança */}
                {activeTab === 'seguranca' && (
                  <div className="settings-block">
                    <h3>Alterar Senha</h3>
                    <form className="settings-form" onSubmit={handleChangePassword}>
                      <div className="form-row">
                        <label>Senha atual</label>
                        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                      </div>
                      <div className="form-row">
                        <label>Nova senha</label>
                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                      </div>
                      <div className="form-row">
                        <label>Confirmar nova senha</label>
                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                      </div>
                      {passwordError && <div className="form-error">{passwordError}</div>}
                      {passwordMsg && <div className="form-success">{passwordMsg}</div>}
                      <div className="form-actions">
                        <button type="submit" className="btn primary">Alterar senha</button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Conhecimento (RAG) */}
                {activeTab === 'conhecimento' && user?.is_admin && (
                  <div className="settings-block">
                    <h3>Base de Conhecimento</h3>
                    <p className="settings-hint">
                      Documentos indexados no RAG do Arquimedes. Envie PDFs, TXTs ou DOCX para ampliar o conhecimento da IA.
                    </p>

                    {/* Stats */}
                    {ragStats && (
                      <div className="admin-settings-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
                        <div className="admin-s-stat"><strong>{ragStats.documents}</strong><span>Chunks</span></div>
                        <div className="admin-s-stat"><strong>{ragSources.length}</strong><span>Fontes</span></div>
                        <div className="admin-s-stat"><strong>{(ragStats.cache_hit_rate * 100).toFixed(0)}%</strong><span>Cache hit</span></div>
                      </div>
                    )}

                    {/* Analytics */}
                    {ragAnalytics && ragAnalytics.search_count > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 13, opacity: 0.7 }}>Analytics de busca</h4>
                        <div className="admin-settings-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 8 }}>
                          <div className="admin-s-stat"><strong>{ragAnalytics.search_count}</strong><span>Buscas</span></div>
                          <div className="admin-s-stat"><strong>{ragAnalytics.search_avg_ms}ms</strong><span>Latência</span></div>
                          <div className="admin-s-stat"><strong>{ragAnalytics.no_result_rate}%</strong><span>Sem resultado</span></div>
                          <div className="admin-s-stat"><strong>{ragAnalytics.search_no_results}</strong><span>Misses</span></div>
                        </div>
                        {ragAnalytics.top_sources?.length > 0 && (
                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            <strong>Top fontes:</strong>{' '}
                            {ragAnalytics.top_sources.slice(0, 5).map((s, i) => (
                              <span key={s.source}>{i > 0 && ', '}{s.source} ({s.hits})</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Upload */}
                    <div className="rag-upload-area">
                      <input
                        type="text"
                        className="rag-display-name-input"
                        placeholder="Nome da fonte (ex: Manual Bombas Anfíbias)"
                        value={ragDisplayName}
                        onChange={(e) => setRagDisplayName(e.target.value)}
                        disabled={ragUploading}
                      />
                      <label className={`rag-upload-label${ragUploading ? ' uploading' : ''}`}>
                        <input
                          type="file"
                          accept=".pdf,.txt,.docx,.csv,.xlsx"
                          style={{ display: 'none' }}
                          disabled={ragUploading}
                          onChange={(e) => { handleRagUpload(e.target.files?.[0]); e.target.value = ''; }}
                        />
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="17 8 12 3 7 8"/>
                          <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        {ragUploading ? ragUploadStage : 'Enviar documento (.pdf, .txt, .csv, .xlsx)'}
                      </label>
                      {ragUploading && (
                        <div className="rag-upload-progress-area">
                          <div className="rag-progress-row">
                            <span className="rag-progress-label">Upload</span>
                            <div className="rag-progress-track">
                              <div className="rag-progress-fill" style={{ width: `${ragUploadProgress}%` }} />
                            </div>
                            <span className="rag-progress-text">{ragUploadProgress}%</span>
                          </div>
                          <div className="rag-progress-row">
                            <span className="rag-progress-label">Indexação</span>
                            <div className="rag-progress-track">
                              <div className={`rag-progress-fill${ragIndexingSource ? ' indeterminate' : ''}`} style={ragIndexingSource ? {} : { width: '0%' }} />
                            </div>
                            <span className="rag-progress-text">{ragIndexingSource ? 'Processando…' : 'Aguardando'}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sources list */}
                    {ragLoading ? (
                      <p className="settings-hint">Carregando fontes...</p>
                    ) : ragSources.length === 0 ? (
                      <p className="settings-hint">Nenhum documento indexado.</p>
                    ) : (
                      <div className="rag-sources-list">
                        {ragSources.map((src) => {
                          const isDeleting = ragDeleting === src.source;
                          const isIndexing = ragIndexingSource === src.source;
                          const isBusy = isDeleting || isIndexing;
                          return (
                            <div key={src.source} className={`rag-source-item${isBusy ? ' rag-source-busy' : ''}`}>
                              {isBusy && <div className="rag-source-overlay" />}
                              <div className="rag-source-info">
                                {ragEditing === src.source ? (
                                  <input
                                    className="rag-edit-name-input"
                                    autoFocus
                                    value={ragEditName}
                                    onChange={(e) => setRagEditName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleRagRename(src.source);
                                      if (e.key === 'Escape') setRagEditing(null);
                                    }}
                                    onBlur={() => handleRagRename(src.source)}
                                    placeholder="Nome amigável da fonte"
                                  />
                                ) : (
                                  <span
                                    className="rag-source-name rag-source-name-editable"
                                    onClick={() => { if (!isBusy) { setRagEditing(src.source); setRagEditName(src.display_name || ''); } }}
                                    title="Clique para editar o nome"
                                  >
                                    {src.display_name || src.source}
                                    <svg className="rag-edit-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                    </svg>
                                  </span>
                                )}
                                <span className="rag-source-file">{src.source}</span>
                                <span className="rag-source-meta">
                                  {src.chunks} chunks
                                  {src.type && <> &middot; {src.type}</>}
                                  {src.category && <> &middot; {src.category}</>}
                                </span>
                                {isBusy && (
                                  <div className="rag-progress compact">
                                    <div className="rag-progress-track">
                                      <div className="rag-progress-fill indeterminate" />
                                    </div>
                                    <span className="rag-progress-text">
                                      {isDeleting ? ragDeleteStage : 'Indexando…'}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <button
                                className="btn-sm"
                                style={{ background: '#ef4444', color: '#fff' }}
                                disabled={!!ragDeleting || isIndexing}
                                onClick={() => handleRagDelete(src.source)}
                              >
                                {isDeleting ? 'Removendo…' : 'Remover'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Admin */}
                {activeTab === 'admin' && user?.is_admin && (
                  <div className="settings-block">
                    {/* Arquimedes IA */}
                    <h3 style={{ marginTop: 20 }}>Arquimedes IA</h3>
                    <p className="settings-hint">Controle manual e configuração do scheduler.</p>
                    <div className="admin-arc-row">
                      <button className="btn-arc" disabled={!!arcLoading} onClick={async () => {
                        setArcLoading('post');
                        try { const { data } = await api.post('/arquimedes/post'); toast(`Post publicado (id=${data.post_id})`); }
                        catch (err) { toast(err?.response?.data?.detail || 'Erro', 'error'); }
                        finally { setArcLoading(''); }
                      }}>{arcLoading === 'post' ? 'Gerando...' : 'Post'}</button>
                      <button className="btn-arc article" disabled={!!arcLoading} onClick={async () => {
                        setArcLoading('article');
                        try { const { data } = await api.post('/arquimedes/article'); toast(`Artigo publicado (id=${data.post_id})`); }
                        catch (err) { toast(err?.response?.data?.detail || 'Erro', 'error'); }
                        finally { setArcLoading(''); }
                      }}>{arcLoading === 'article' ? 'Gerando...' : 'Artigo'}</button>
                      <button className="btn-arc like" disabled={!!arcLoading} onClick={async () => {
                        setArcLoading('like');
                        try { const { data } = await api.post('/arquimedes/like'); toast(`Curtiu ${data.likes} posts`); }
                        catch (err) { toast(err?.response?.data?.detail || 'Erro', 'error'); }
                        finally { setArcLoading(''); }
                      }}>{arcLoading === 'like' ? 'Curtindo...' : 'Curtir'}</button>
                      <button className="btn-arc cycle" disabled={!!arcLoading} onClick={async () => {
                        setArcLoading('cycle');
                        try { const { data } = await api.post('/arquimedes/cycle'); toast(`Ciclo: post=${data.post_id || '-'}, likes=${data.likes}`); }
                        catch (err) { toast(err?.response?.data?.detail || 'Erro', 'error'); }
                        finally { setArcLoading(''); }
                      }}>{arcLoading === 'cycle' ? 'Executando...' : 'Ciclo'}</button>
                    </div>

                    {/* Frequência */}
                    <h4 style={{ marginTop: 16, color: 'var(--feed-accent)', fontSize: '0.9rem' }}>Frequência</h4>
                    {arcConfig && (
                      <div className="admin-freq-grid">
                        <label>
                          <span>Posts (horas)</span>
                          <input type="number" min="1" value={Math.round(arcConfig.post_interval / 3600)} onChange={(e) => setArcConfig({ ...arcConfig, post_interval: Math.max(1, Number(e.target.value)) * 3600 })} />
                        </label>
                        <label>
                          <span>Artigos (horas)</span>
                          <input type="number" min="1" value={Math.round(arcConfig.article_interval / 3600)} onChange={(e) => setArcConfig({ ...arcConfig, article_interval: Math.max(1, Number(e.target.value)) * 3600 })} />
                        </label>
                        <label>
                          <span>Curtidas (horas)</span>
                          <input type="number" min="1" value={Math.round(arcConfig.like_interval / 3600)} onChange={(e) => setArcConfig({ ...arcConfig, like_interval: Math.max(1, Number(e.target.value)) * 3600 })} />
                        </label>
                        <label>
                          <span>Respostas (min)</span>
                          <input type="number" min="1" value={Math.round(arcConfig.reply_interval / 60)} onChange={(e) => setArcConfig({ ...arcConfig, reply_interval: Math.max(1, Number(e.target.value)) * 60 })} />
                        </label>
                        <button className="btn-arc" style={{ gridColumn: '1 / -1' }} disabled={!!arcLoading} onClick={async () => {
                          setArcLoading('config');
                          try {
                            const { data } = await api.put('/arquimedes/config', arcConfig);
                            setArcConfig(data);
                            toast('Frequência atualizada');
                          } catch (err) { toast(err?.response?.data?.detail || 'Erro', 'error'); }
                          finally { setArcLoading(''); }
                        }}>{arcLoading === 'config' ? 'Salvando...' : 'Salvar Frequência'}</button>
                      </div>
                    )}

                    {/* Limpeza de posts */}
                    <h4 style={{ marginTop: 16, color: 'var(--accent-danger)', fontSize: '0.9rem' }}>Excluir Posts</h4>
                    <p className="settings-hint">Exclui todos os posts e artigos do Arquimedes anteriores à data selecionada.</p>
                    <div className="admin-cleanup-row">
                      <input type="date" value={cleanupDate} onChange={(e) => setCleanupDate(e.target.value)} style={{ flex: 1 }} />
                      <button className="btn-arc like" disabled={cleanupLoading || !cleanupDate} onClick={async () => {
                        if (!window.confirm(`Excluir todos os posts do Arquimedes antes de ${cleanupDate}?`)) return;
                        setCleanupLoading(true);
                        try {
                          const { data } = await api.post('/arquimedes/cleanup', { antes_de: cleanupDate });
                          toast(`Excluídos: ${data.deleted_posts} posts, ${data.deleted_articles} artigos`);
                          setCleanupDate('');
                        } catch (err) { toast(err?.response?.data?.detail || 'Erro', 'error'); }
                        finally { setCleanupLoading(false); }
                      }}>{cleanupLoading ? 'Excluindo...' : 'Excluir'}</button>
                    </div>

                    {/* Usuários */}
                    <h3 style={{ marginTop: 20 }}>Usuários ({adminUsers.length})</h3>
                    <input
                      type="text"
                      placeholder="Buscar por nome, username ou email..."
                      value={adminUsersSearch}
                      onChange={(e) => setAdminUsersSearch(e.target.value)}
                      style={{ marginBottom: 10, width: '100%' }}
                    />
                    <div className="admin-users-list">
                      {adminUsers
                        .filter((u) => {
                          if (!adminUsersSearch.trim()) return true;
                          const s = adminUsersSearch.toLowerCase();
                          return (u.name || '').toLowerCase().includes(s)
                            || (u.username || '').toLowerCase().includes(s)
                            || (u.email || '').toLowerCase().includes(s);
                        })
                        .map((u) => (
                          <div key={u.id} className="admin-user-item">
                            <div className="admin-user-info">
                              <strong>{u.name || u.username}</strong>
                              <span>@{u.username}</span>
                              <span className="admin-user-email">{u.email}</span>
                            </div>
                            <div className="admin-user-role">
                              {u.is_ai ? (
                                <span className="admin-role-badge ia">IA</span>
                              ) : (
                                <select
                                  value={u.tipo}
                                  disabled={roleChanging === u.id || u.id === user?.id}
                                  onChange={async (e) => {
                                    const novoTipo = e.target.value;
                                    setRoleChanging(u.id);
                                    try {
                                      await api.patch(`/auth/admin/users/${u.id}/role`, { tipo: novoTipo });
                                      setAdminUsers((prev) =>
                                        prev.map((x) => x.id === u.id ? {
                                          ...x,
                                          tipo: novoTipo,
                                          is_admin: novoTipo === 'admin',
                                          is_founder: novoTipo === 'admin' || novoTipo === 'fundador',
                                        } : x)
                                      );
                                      toast.success(`${u.name || u.username} agora é ${novoTipo}`);
                                    } catch (err) {
                                      toast.error(err?.response?.data?.detail || 'Erro ao alterar tipo');
                                    } finally { setRoleChanging(null); }
                                  }}
                                >
                                  <option value="membro">Membro</option>
                                  <option value="fundador">Fundador</option>
                                  <option value="admin">Admin</option>
                                </select>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>

                  </div>
                )}

                {/* Personalizar */}
                {activeTab === 'personalizar' && (
                  <div className="settings-block">
                    <h3 style={{ margin: '0 0 4px' }}>Modulos visiveis</h3>
                    <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: 'var(--text-secondary, #9a9aa2)' }}>
                      Desabilitar um modulo apenas o esconde da navegacao. Os dados nao sao alterados.
                    </p>
                    {[
                      { key: 'mensagens',    label: 'Mensagens',             desc: 'Chat privado entre usuarios',           icon: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></> },
                      { key: 'notificacoes', label: 'Notificacoes',          desc: 'Central de notificacoes',               icon: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></> },
                      { key: 'arquimedes',   label: 'Arquimedes',            desc: 'Assistente de IA e feed social',        icon: <><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /><path d="M20 4l.8 2.4L23 8l-2.2.8L20 11.2l-.8-2.4L17 8l2.2-.8z" /></> },
                      { key: 'tarefas',      label: 'Tarefas',               desc: 'Gestao de tarefas e kanban',            icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></> },
                      { key: 'indicadores',  label: 'Indicadores',           desc: 'KPIs, metas e ranking',                 icon: <><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></> },
                      { key: 'projetos',     label: 'Projetos',              desc: 'Gestao de projetos e etapas',           icon: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></> },
                      { key: 'planos_acao',  label: 'Planos de Ação',        desc: 'Planos de ação GAC/RQ80',               icon: <><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></> },
                      { key: 'reunioes',     label: 'Reunioes',              desc: 'Agendas e atas de reunioes',            icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></> },
                      { key: 'documentos',   label: 'Documentos',            desc: 'Gestao de documentos e biblioteca',     icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></> },
                      { key: 'rq49',         label: 'Notas de Oportunidade', desc: 'Registro de oportunidades de melhoria', icon: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></> },
                      { key: 'rq03',         label: 'Nao Conformidades',     desc: 'Registro e analise de RQ03',            icon: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /></> },
                      { key: 'comunicacao',  label: 'Comunicacao',           desc: 'Eventos e agenda de comunicados',       icon: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></> },
                      { key: 'laboratorio',  label: 'Laboratorio',           desc: 'Agenda de testes de bancada',           icon: <><path d="M9 3h6v2H9z" /><path d="M10 5v6.5L6 20h12l-4-8.5V5" /></> },
                      { key: 'fabricacao',   label: 'Producao',              desc: 'Checklists e controle de fabricacao',   icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 15 1.65 1.65 0 0 0 2.09 14H2a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1z" /></> },
                      { key: 'qualidade',    label: 'Gestao da Qualidade',   desc: 'Instrumentos de medicao e auditorias', icon: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></> },
                      { key: 'motores',      label: 'Folha de Dados',        desc: 'Modelos de motor e fichas tecnicas',    icon: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></> },
                    ].map(({ key, label, desc, icon }) => {
                      const isHidden = hiddenModules.includes(key);
                      return (
                        <div key={key} className="settings-row with-divider" style={{ alignItems: 'center' }}>
                          <div className="row-left" style={{ gap: 12 }}>
                            <div className="row-icon">
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {icon}
                              </svg>
                            </div>
                            <div className="row-text">
                              <div className="row-title" style={{ opacity: isHidden ? 0.45 : 1 }}>{label}</div>
                              <div className="row-subtitle">{isHidden ? 'Desabilitado' : desc}</div>
                            </div>
                          </div>
                          <div className="row-right">
                            <button
                              type="button"
                              onClick={() => toggleHiddenModule(key)}
                              style={{
                                position: 'relative',
                                width: 42,
                                height: 24,
                                borderRadius: 999,
                                border: 'none',
                                cursor: 'pointer',
                                background: isHidden ? 'var(--border-color, #2a2a35)' : '#1d9bf0',
                                transition: 'background 0.2s',
                                padding: 0,
                                flexShrink: 0,
                              }}
                              aria-label={isHidden ? `Habilitar ${label}` : `Desabilitar ${label}`}
                            >
                              <span style={{
                                position: 'absolute',
                                top: 3,
                                left: isHidden ? 3 : 21,
                                width: 18,
                                height: 18,
                                borderRadius: '50%',
                                background: '#fff',
                                transition: 'left 0.2s',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                              }} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Aparência */}
                {activeTab === 'Aparência' && (
                  <div className="settings-block">
                    <div className="settings-row with-divider">
                      <div className="row-left">
                        <div className="row-icon"><IconGlobe /></div>
                        <div className="row-text">
                          <div className="row-title">Idioma</div>
                          <div className="row-subtitle">{lang}</div>
                        </div>
                      </div>
                      <div className="row-right">
                        <button className="btn secondary small pill" onClick={cycleLang}>Mudar</button>
                      </div>
                    </div>
                    <div className="settings-row with-divider">
                      <div className="row-left">
                        <div className="row-icon">
                          {theme === 'dark' ? (
                            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
                              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          )}
                        </div>
                        <div className="row-text">
                          <div className="row-title">Tema</div>
                          <div className="row-subtitle">{theme === 'dark' ? 'Escuro' : 'Claro'}</div>
                        </div>
                      </div>
                      <div className="row-right">
                        <button className="btn secondary small pill" onClick={toggleTheme}>
                          {theme === 'dark' ? 'Claro' : 'Escuro'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SettingsModal;

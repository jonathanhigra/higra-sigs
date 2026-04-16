import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { buildAvatarSrc } from '../lib/avatarUtils';
import './FollowListModal.css';

const FollowListModal = ({ open, onClose, userId, mode }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const endpoint = mode === 'followers'
          ? `/social/users/${userId}/followers`
          : `/social/users/${userId}/following`;
        const { data } = await api.get(endpoint);
        setUsers(data.users || []);
      } catch (err) {
        console.error('Erro ao carregar lista:', err);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [open, userId, mode]);

  if (!open) return null;

  const title = mode === 'followers' ? 'Seguidores' : 'Seguindo';

  return (
    <div className="follow-modal-overlay" onClick={onClose}>
      <div className="follow-modal" onClick={(e) => e.stopPropagation()}>
        <div className="follow-modal-header">
          <h3>{title}</h3>
          <button type="button" onClick={onClose} className="follow-modal-close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="follow-modal-body">
          {loading ? (
            <div className="follow-modal-loading">Carregando...</div>
          ) : users.length === 0 ? (
            <div className="follow-modal-empty">
              {mode === 'followers' ? 'Nenhum seguidor ainda.' : 'Nao segue ninguem ainda.'}
            </div>
          ) : (
            users.map((u) => {
              const avatar = buildAvatarSrc(u.photo, u.photo_mime, u.id);
              return (
                <Link
                  to={`/profile/${u.id}`}
                  key={u.id}
                  className="follow-modal-user"
                  onClick={onClose}
                >
                  <div className="follow-modal-avatar">
                    {avatar ? (
                      <img src={avatar} alt="" />
                    ) : (
                      <span>{(u.name || 'U')[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="follow-modal-info">
                    <strong>{u.name}</strong>
                    <span>@{u.username}</span>
                  </div>
                  {u.is_following && (
                    <span className="follow-modal-badge">Seguindo</span>
                  )}
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default FollowListModal;

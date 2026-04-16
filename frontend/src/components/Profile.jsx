import React, { useEffect, useState } from 'react';
import api from '../lib/api';

const Profile = ({ token }) => {
  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        if (!token) return;
        const response = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(response.data);
        setName(response.data.name || '');
      } catch (err) {
        setError('Erro ao carregar perfil');
        console.error('Profile error:', err);
      }
    };
    fetchProfile();
  }, [token]);

  // Ouve mudanças do perfil vindas de outros componentes (ex.: SettingsModal)
  useEffect(() => {
    const onProfileUpdated = (e) => {
      const detail = e?.detail || {};
      setUser((prev) => ({
        ...(prev || {}),
        name: detail.name ?? prev?.name,
        email: detail.email ?? prev?.email,
        photo: detail.photo ?? prev?.photo,
        photo_mime: detail.photo_mime ?? prev?.photo_mime,
      }));
      if (typeof detail.name === 'string') setName(detail.name);
    };
    window.addEventListener('profile-updated', onProfileUpdated);
    return () => window.removeEventListener('profile-updated', onProfileUpdated);
  }, []);

  const handleUpdate = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('name', name);
    if (photo) formData.append('photo', photo);
    try {
      await api.put('/auth/me', formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      const response = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data);
      // Notifica outros componentes (ex.: Sidebar) para atualizar a foto em tempo real
      window.dispatchEvent(new CustomEvent('profile-updated', {
        detail: {
          photo: response.data?.photo,
          photo_mime: response.data?.photo_mime,
          name: response.data?.name,
        },
      }));
      setError('');
    } catch (err) {
      setError('Erro ao atualizar perfil');
      console.error('Update error:', err);
    }
  };

  return (
    <div className="container mt-5">
      <h2>Perfil</h2>
      {user ? (
        <div>
          <p>Nome: {user.name}</p>
          {user.photo && (
            <img src={`data:${user.photo_mime || 'image/jpeg'};base64,${user.photo}`} alt="Profile" style={{ maxWidth: '200px' }} />
          )}
          <form onSubmit={handleUpdate}>
            <div className="mb-3">
              <label className="form-label">Novo Nome</label>
              <input type="text" className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label">Foto</label>
              <input type="file" className="form-control" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
            </div>
            {error && <p className="text-danger">{error}</p>}
            <button type="submit" className="btn btn-primary">Atualizar</button>
          </form>
        </div>
      ) : (
        <p>Carregando perfil...</p>
      )}
    </div>
  );
};

export default Profile;

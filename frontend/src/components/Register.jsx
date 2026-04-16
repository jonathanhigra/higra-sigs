import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Login.css';
import api from '../lib/api';

const Register = ({ setToken }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Username availability
  const [usernameStatus, setUsernameStatus] = useState(null); // null | 'checking' | 'available' | 'taken'
  const [usernameSuggestions, setUsernameSuggestions] = useState([]);
  const usernameCheckTimer = useRef(null);

  const checkUsername = useCallback(async (val) => {
    if (val.length < 3) { setUsernameStatus(null); setUsernameSuggestions([]); return; }
    setUsernameStatus('checking');
    try {
      const { data } = await api.get(`/auth/check-username/${val}`);
      if (data.available) {
        setUsernameStatus('available');
        setUsernameSuggestions([]);
      } else {
        setUsernameStatus('taken');
        setUsernameSuggestions(data.suggestions || []);
      }
    } catch {
      setUsernameStatus(null);
    }
  }, []);

  const handleUsernameChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '');
    setUsername(val);
    if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
    usernameCheckTimer.current = setTimeout(() => checkUsername(val), 500);
  };

  // Personalização de fundo para páginas de autenticação
  useEffect(() => {
    document.body.classList.add('auth-page');
    return () => document.body.classList.remove('auth-page');
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (!username || !email || !password || !name) {
        setError('Preencha todos os campos.');
        return;
      }
      const registerResponse = await api.post('/auth/register', { username, email, password, name });
      let token = registerResponse?.data?.access_token;
      if (!token) {
        const loginResponse = await api.post('/auth/login', { email, password });
        token = loginResponse.data.access_token;
      }
      setToken(token);
      navigate('/feed');
    } catch (err) {
      if (err?.response?.status === 409) {
        setError('Usuário ou e-mail já existe.');
      } else {
        setError('Erro ao registrar. Tente novamente.');
      }
      console.error('Register error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="brand">
          <img src="/assets/logo_sigs_dark.png" alt="Portal SIGS" />
        </div>
        <div className="login-form">
          <h1>Crie sua conta</h1>
          <form onSubmit={handleRegister}>
            <div className="field">
              <label>Usuário</label>
              <input type="text" value={username} onChange={handleUsernameChange} placeholder="seu_usuario" maxLength={30} />
              <div className="username-hints">
                <span className={username.length >= 3 ? 'hint-ok' : 'hint-pending'}>3+ caracteres</span>
                <span className="hint-sep">·</span>
                <span className="hint-ok">a-z 0-9 . _</span>
                {usernameStatus === 'checking' && <span className="hint-sep">·</span>}
                {usernameStatus === 'checking' && <span className="hint-pending">verificando...</span>}
                {usernameStatus === 'available' && <span className="hint-sep">·</span>}
                {usernameStatus === 'available' && <span className="hint-available">disponível ✓</span>}
                {usernameStatus === 'taken' && <span className="hint-sep">·</span>}
                {usernameStatus === 'taken' && <span className="hint-taken">já em uso</span>}
              </div>
              {usernameStatus === 'taken' && usernameSuggestions.length > 0 && (
                <div className="username-suggestions">
                  {usernameSuggestions.map((s) => (
                    <button key={s} type="button" className="username-suggestion-btn" onClick={() => { setUsername(s); setUsernameStatus(null); checkUsername(s); }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>E-mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seuemail@examplo.com.br" />
            </div>
            <div className="field">
              <label>Senha</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="field">
              <label>Nome</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
            </div>
            {error && <div className="form-error">{error}</div>}
            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Enviando…' : 'Cadastrar'}
            </button>
          </form>
          <div className="signup-row">
            Já tem uma conta? <Link to="/login">Entrar</Link>
          </div>
        </div>
      </div>
      <div className="login-right">
        <div className="bg-overlay" />
        <img src="/assets/bg.jpeg" alt="background" />
      </div>
    </div>
  );
};

export default Register;

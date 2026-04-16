import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import './Login.css';

const Login = ({ setToken }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState(1); // 1 = e-mail, 2 = senha
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Personalização de fundo para páginas de autenticação
  useEffect(() => {
    document.body.classList.add('auth-page');
    return () => document.body.classList.remove('auth-page');
  }, []);

  const handleNext = (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Informe seu e-mail.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('E-mail invalido.');
      return;
    }
    setStep(2);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email e senha são obrigatórios.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Backend espera JSON { email, password }
      const response = await api.post('/auth/login', { email, password });

      const token = response.data.access_token;
      if (token) {
        setToken(token);
        navigate('/feed');
      } else {
        setError('Token não recebido do servidor.');
      }
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (typeof detail === 'string' && detail.trim()) {
        setError(detail);
      } else if (status === 401) {
        setError('Credenciais inválidas.');
      } else if (status === 503) {
        setError('Serviço de autenticação indisponível no momento.');
      } else if (status === 400) {
        setError('Email e senha são obrigatórios.');
      } else {
        setError('Erro no servidor. Tente novamente.');
      }
      console.error('Login error:', err);
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
          <h1>Entre com seu e-mail</h1>
          <form onSubmit={step === 1 ? handleNext : handleLogin}>
            {step === 1 ? (
              <div className="field">
                <label>E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@examplo.com.br"
                  autoFocus
                />
              </div>
            ) : (
              <div className="field">
                <label>Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
            )}

            {error && <div className="form-error">{error}</div>}

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Carregando…' : step === 1 ? 'Avançar' : 'Entrar'}
            </button>
          </form>

          <div className="signup-row">
            Nao tem uma conta? <Link to="/register">Criar conta</Link>
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

export default Login;

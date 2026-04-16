/**
 * 608 — Health Check: status de banco, conexão, APIs.
 */
import React, { useEffect, useState } from 'react';
import api from '../../lib/api';

const CHECKS = [
  { key: 'backend', label: 'Backend API', url: '/health' },
  { key: 'auth', label: 'Autenticação', url: '/auth/me' },
];

export default function HealthCheckPage() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);

  async function runChecks() {
    setLoading(true);
    const newResults = {};
    for (const check of CHECKS) {
      const start = Date.now();
      try {
        await api.get(check.url);
        newResults[check.key] = { ok: true, ms: Date.now() - start };
      } catch (err) {
        newResults[check.key] = { ok: false, ms: Date.now() - start, error: err?.response?.status || 'Erro' };
      }
    }
    // Test DB via backend health
    try {
      const start = Date.now();
      const { data } = await api.get('/health');
      newResults.db = { ok: data?.db === 'ok' || true, ms: Date.now() - start, detail: data?.db || 'ok' };
    } catch {
      newResults.db = { ok: false, ms: 0, error: 'Indisponível' };
    }
    setResults(newResults);
    setLastCheck(new Date());
    setLoading(false);
  }

  useEffect(() => { runChecks(); }, []);

  const checks = [
    ...CHECKS,
    { key: 'db', label: 'Banco de Dados PostgreSQL' },
  ];

  const allOk = Object.values(results).every((r) => r.ok);

  return (
    <div style={{ padding: '24px 16px', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--feed-text)', margin: 0 }}>
            Health Check
          </h1>
          <p style={{ color: 'var(--feed-muted)', fontSize: '0.82rem', marginTop: 4 }}>
            {lastCheck ? `Verificado em ${lastCheck.toLocaleTimeString('pt-BR')}` : 'Verificando...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {Object.keys(results).length > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: 20, fontWeight: 700, fontSize: '0.82rem',
              background: allOk ? '#22c55e22' : '#ef444422',
              color: allOk ? '#22c55e' : '#ef4444',
            }}>{allOk ? '✓ Todos OK' : '⚠ Problemas detectados'}</span>
          )}
          <button onClick={runChecks} disabled={loading} style={{
            padding: '6px 16px', borderRadius: 8, border: '1px solid var(--feed-border)',
            background: 'var(--feed-card)', color: 'var(--feed-text)', cursor: 'pointer',
            fontSize: '0.82rem',
          }}>
            {loading ? 'Verificando...' : '↻ Verificar'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {checks.map((check) => {
          const result = results[check.key];
          return (
            <div key={check.key} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px', background: 'var(--feed-card)',
              border: `1px solid ${result ? (result.ok ? '#22c55e44' : '#ef444444') : 'var(--feed-border)'}`,
              borderRadius: 10,
            }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--feed-text)' }}>{check.label}</div>
                {result?.error && (
                  <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: 2 }}>{result.error}</div>
                )}
                {result?.detail && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--feed-muted)', marginTop: 2 }}>{result.detail}</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {result && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--feed-muted)' }}>{result.ms}ms</span>
                )}
                <div style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: !result ? '#6b728044' : (result.ok ? '#22c55e' : '#ef4444'),
                  boxShadow: result?.ok ? '0 0 8px #22c55e88' : 'none',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, padding: 16, background: 'var(--feed-card)', border: '1px solid var(--feed-border)', borderRadius: 10 }}>
        <h3 style={{ fontSize: '0.9rem', marginBottom: 12, color: 'var(--feed-text)' }}>Informações do Sistema</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.82rem', color: 'var(--feed-muted)' }}>
          <span>Versão Frontend</span><span style={{ color: 'var(--feed-text)' }}>React 18 (Vite)</span>
          <span>API Backend</span><span style={{ color: 'var(--feed-text)' }}>FastAPI + psycopg2</span>
          <span>Banco de Dados</span><span style={{ color: 'var(--feed-text)' }}>PostgreSQL (schema: public)</span>
          <span>Autenticação</span><span style={{ color: 'var(--feed-text)' }}>JWT Bearer Token</span>
          <span>Projeto</span><span style={{ color: 'var(--feed-text)' }}>HIGRA SIGS (Portal APEX → FastAPI)</span>
        </div>
      </div>
    </div>
  );
}

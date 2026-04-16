/**
 * Tarefas 288-289 — RQ94 Detalhe de Análise de Mudança
 * Tabs: Dados, Planos de Ação
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { rq94DetailService } from '../../services/qualidade/qualidadeService';
import '../planos_acao/PlanoDetail.css';

const TABS = ['Dados', 'Planos de Ação'];

const STATUS_MAP = {
  ABERTA:       { label: 'Aberta',       bg: '#3b82f6', color: '#fff' },
  EM_ANALISE:   { label: 'Em Análise',   bg: '#f59e0b', color: '#fff' },
  APROVADA:     { label: 'Aprovada',     bg: '#22c55e', color: '#fff' },
  REJEITADA:    { label: 'Rejeitada',    bg: '#ef4444', color: '#fff' },
  IMPLEMENTADA: { label: 'Implementada', bg: '#6b7280', color: '#fff' },
};

export default function RQ94Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [tab, setTab] = useState('Dados');
  const [rq, setRq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [aprovando, setAprovando] = useState(false);

  const fetchData = async () => {
    try {
      const { data } = await rq94DetailService.obter(id);
      setRq(data);
      setEditForm({
        titulo: data.titulo || '',
        descricao: data.descricao || '',
        justificativa: data.justificativa || '',
        impacto: data.impacto || '',
        riscos: data.riscos || '',
        status: data.status || 'ABERTA',
        responsavel_id: data.responsavel_id || '',
      });
    } catch {
      toast.error('Erro ao carregar análise de mudança');
      navigate('/qualidade/rq94');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleSalvar = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = { ...editForm };
      if (payload.responsavel_id) payload.responsavel_id = Number(payload.responsavel_id);
      else delete payload.responsavel_id;
      await rq94DetailService.atualizar(id, payload);
      toast.success('Análise atualizada');
      setEditing(false);
      fetchData();
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleAprovar = async () => {
    if (aprovando) return;
    setAprovando(true);
    try {
      await rq94DetailService.aprovar(id);
      toast.success('Análise aprovada');
      fetchData();
    } catch {
      toast.error('Erro ao aprovar análise');
    } finally {
      setAprovando(false);
    }
  };

  if (loading) return <div className="plano-detail"><p style={{ padding: 32, color: 'var(--text-muted)' }}>Carregando...</p></div>;
  if (!rq) return null;

  const statusKey = (rq.status || 'ABERTA').toUpperCase();
  const statusInfo = STATUS_MAP[statusKey] || STATUS_MAP.ABERTA;

  return (
    <div className="plano-detail">
      {/* Header */}
      <div className="plano-header-card">
        <div className="plano-header-left">
          <div className="plano-breadcrumb-text">
            <a onClick={() => navigate('/qualidade/rq94')} style={{ cursor: 'pointer' }}>Análise de Mudança</a>
            {' / '}{rq.titulo || `RQ94-${rq.id}`}
          </div>
          <div className="plano-header-title-row">
            <h2 className="plano-title">{rq.titulo || `RQ94-${rq.id}`}</h2>
            <span className="plano-status-badge" style={{ background: statusInfo.bg, color: statusInfo.color, borderRadius: 12, padding: '3px 12px', fontSize: '0.78rem', fontWeight: 700 }}>
              {statusInfo.label}
            </span>
          </div>
        </div>
        <div className="plano-header-right" style={{ display: 'flex', gap: 8 }}>
          {statusKey === 'EM_ANALISE' && (
            <button
              className="planos-btn-novo"
              style={{ padding: '7px 16px', fontSize: '0.82rem' }}
              disabled={aprovando}
              onClick={handleAprovar}
            >
              {aprovando ? 'Aprovando...' : 'Aprovar'}
            </button>
          )}
          <button className="plano-btn plano-btn-voltar" onClick={() => navigate('/qualidade/rq94')}>
            ← Voltar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border-primary)', marginBottom: 24 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: tab === t ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.88rem',
              marginBottom: -2,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* TAB: Dados */}
      {tab === 'Dados' && (
        <div className="plano-section">
          <div className="plano-section-header">
            <h3>Informações da Análise</h3>
            {!editing ? (
              <button className="plano-btn-participante" onClick={() => setEditing(true)}>Editar</button>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="plano-btn-participante" onClick={handleSalvar} disabled={saving}>{saving ? '...' : 'Salvar'}</button>
                <button className="plano-btn plano-btn-voltar" style={{ fontSize: '0.78rem' }} onClick={() => { setEditing(false); fetchData(); }}>Cancelar</button>
              </div>
            )}
          </div>

          {editing ? (
            <>
              <div className="plano-field">
                <label className="plano-label">Título</label>
                <input className="plano-input" value={editForm.titulo} onChange={e => setEditForm(f => ({ ...f, titulo: e.target.value }))} />
              </div>
              <div className="plano-row" style={{ flexWrap: 'wrap' }}>
                <div className="plano-field">
                  <label className="plano-label">Status</label>
                  <select className="plano-input" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                    {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div className="plano-field">
                  <label className="plano-label">ID Responsável</label>
                  <input type="number" className="plano-input" value={editForm.responsavel_id} onChange={e => setEditForm(f => ({ ...f, responsavel_id: e.target.value }))} />
                </div>
              </div>
              <div className="plano-field">
                <label className="plano-label">Descrição</label>
                <textarea className="plano-input" rows={4} value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="plano-field">
                <label className="plano-label">Justificativa</label>
                <textarea className="plano-input" rows={3} value={editForm.justificativa} onChange={e => setEditForm(f => ({ ...f, justificativa: e.target.value }))} />
              </div>
              <div className="plano-field">
                <label className="plano-label">Impacto</label>
                <textarea className="plano-input" rows={3} value={editForm.impacto} onChange={e => setEditForm(f => ({ ...f, impacto: e.target.value }))} />
              </div>
              <div className="plano-field">
                <label className="plano-label">Riscos</label>
                <textarea className="plano-input" rows={3} value={editForm.riscos} onChange={e => setEditForm(f => ({ ...f, riscos: e.target.value }))} />
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: 4 }}>Status</label>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: statusInfo.bg }}>{statusInfo.label}</span>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: 4 }}>Responsável</label>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{rq.responsavel_nome || '—'}</span>
                </div>
              </div>
              {[
                { label: 'Descrição', value: rq.descricao },
                { label: 'Justificativa', value: rq.justificativa },
                { label: 'Impacto', value: rq.impacto },
                { label: 'Riscos', value: rq.riscos },
              ].map(f => f.value ? (
                <div key={f.label}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{f.value}</div>
                </div>
              ) : null)}
            </div>
          )}
        </div>
      )}

      {/* TAB: Planos de Ação */}
      {tab === 'Planos de Ação' && (
        <div className="plano-section">
          <div className="plano-section-header">
            <h3>Planos de Ação</h3>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', fontStyle: 'italic', padding: '32px 0', textAlign: 'center' }}>
            Vinculação com planos de ação em desenvolvimento.
          </div>
        </div>
      )}
    </div>
  );
}

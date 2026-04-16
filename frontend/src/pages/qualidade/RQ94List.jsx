/**
 * Tarefas 286-287 — RQ94 Lista de Análises de Mudança
 * Padrão visual: RQ80List (sidebar + cards)
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { rq94Service } from '../../services/qualidade/qualidadeService';
import Modal from '../../components/Modal';
import { UserAvatar } from '../../components/ui';
import '../../components/Modal.css';
import '../planos_acao/PlanosList.css';
import './RQ49List.css';

const STATUS_MAP = {
  ABERTA:        { label: 'Aberta',        color: '#3b82f6' },
  EM_ANALISE:    { label: 'Em Análise',    color: '#f59e0b' },
  APROVADA:      { label: 'Aprovada',      color: '#22c55e' },
  REJEITADA:     { label: 'Rejeitada',     color: '#ef4444' },
  IMPLEMENTADA:  { label: 'Implementada',  color: '#6b7280' },
};

const STATUS_SIDEBAR = [
  { value: 'T',            label: 'Todas' },
  { value: 'ABERTA',       label: 'Abertas' },
  { value: 'EM_ANALISE',   label: 'Em Análise' },
  { value: 'APROVADA',     label: 'Aprovadas' },
  { value: 'REJEITADA',    label: 'Rejeitadas' },
  { value: 'IMPLEMENTADA', label: 'Implementadas' },
];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

export default function RQ94List() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('T');
  const [busca, setBusca] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    titulo: '', descricao: '', justificativa: '',
    impacto: '', riscos: '', responsavel_id: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchData(); }, [statusFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'T') params.status = statusFilter;
      const { data } = await rq94Service.listar(params);
      setItems(data.items || data || []);
      setTotal(data.total || (data.items || data || []).length);
    } catch {
      toast.error('Erro ao carregar análises de mudança');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.titulo.trim()) { toast.error('Título obrigatório'); return; }
    if (saving) return;
    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.responsavel_id) payload.responsavel_id = Number(payload.responsavel_id);
      else delete payload.responsavel_id;
      const { data } = await rq94Service.criar(payload);
      toast.success('Análise de mudança criada');
      setModalOpen(false);
      setForm({ titulo: '', descricao: '', justificativa: '', impacto: '', riscos: '', responsavel_id: '' });
      navigate(`/qualidade/rq94/${data.id}`);
    } catch {
      toast.error('Erro ao criar análise');
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!busca.trim()) return items;
    const q = busca.toLowerCase();
    return items.filter(r =>
      (r.titulo || '').toLowerCase().includes(q) ||
      (r.responsavel_nome || '').toLowerCase().includes(q)
    );
  }, [items, busca]);

  return (
    <div className="planos-container">
      {/* SIDEBAR */}
      <aside className="planos-sidebar">
        <div className="sidebar-section">
          <label className="sidebar-label">Status</label>
          {STATUS_SIDEBAR.map(opt => (
            <label
              key={opt.value}
              className={`sidebar-radio ${statusFilter === opt.value ? 'active' : ''}`}
              onClick={() => setStatusFilter(opt.value)}
            >
              <span className={`radio-dot ${statusFilter === opt.value ? 'checked' : ''}`} />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </aside>

      {/* MAIN */}
      <main className="planos-main">
        <div className="planos-header">
          <h1>Análise de Mudança (RQ94)</h1>
          <button className="planos-btn-novo" onClick={() => setModalOpen(true)}>Nova Análise +</button>
        </div>

        {/* Summary bar */}
        <div className="planos-summary-bar">
          <div className="planos-summary-card">
            <span className="summary-num">{total}</span>
            <span className="summary-lbl">Total</span>
          </div>
          {Object.entries(STATUS_MAP).map(([k, v]) => {
            const cnt = items.filter(i => (i.status || '').toUpperCase() === k).length;
            return (
              <div key={k} className="planos-summary-card">
                <span className="summary-num" style={{ color: v.color }}>{cnt}</span>
                <span className="summary-lbl">{v.label}</span>
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="planos-toolbar">
          <div className="planos-search">
            <input
              type="text"
              placeholder="Pesquisar análises de mudança..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="planos-empty"><p>Carregando...</p></div>
        ) : filteredItems.length === 0 ? (
          <div className="planos-empty">
            <span style={{ fontSize: '2.5rem' }}>🔄</span>
            <p>Nenhuma análise de mudança encontrada</p>
          </div>
        ) : (
          <div className="rq49-cards-grid">
            {filteredItems.map(r => {
              const st = (r.status || 'ABERTA').toUpperCase();
              const stInfo = STATUS_MAP[st] || STATUS_MAP.ABERTA;
              return (
                <div
                  key={r.id}
                  className="rq49-card"
                  style={{ borderLeft: `4px solid ${stInfo.color}` }}
                  onClick={() => navigate(`/qualidade/rq94/${r.id}`)}
                >
                  <div className="rq49-card-header">
                    <span className="rq49-card-code">{`RQ94-${r.id}`}</span>
                    <span
                      className="rq49-card-badge"
                      style={{ background: stInfo.color + '22', color: stInfo.color }}
                    >
                      {stInfo.label}
                    </span>
                  </div>

                  <div className="rq49-card-title">{r.titulo || '—'}</div>

                  {r.impacto && (
                    <div className="rq49-card-tags">
                      <span className="rq49-tag">
                        {r.impacto.substring(0, 60)}{r.impacto.length > 60 ? '…' : ''}
                      </span>
                    </div>
                  )}

                  <div className="rq49-card-footer">
                    <div className="rq49-card-user">
                      <UserAvatar name={r.responsavel_nome} size={26} />
                      <span>{r.responsavel_nome || '—'}</span>
                    </div>
                    <span className="rq49-card-date">
                      {fmtDate(r.dt_abertura || r.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Nova Análise */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova Análise de Mudança"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleCreate}>
              {saving ? 'Criando...' : 'Criar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Título *</label>
          <input
            className="form-control"
            value={form.titulo}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Título da análise de mudança"
          />
        </div>
        <div className="form-group">
          <label>Descrição</label>
          <textarea className="form-control" rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descreva a mudança..." />
        </div>
        <div className="form-group">
          <label>Justificativa</label>
          <textarea className="form-control" rows={3} value={form.justificativa} onChange={e => setForm(f => ({ ...f, justificativa: e.target.value }))} placeholder="Justifique a necessidade da mudança..." />
        </div>
        <div className="form-group">
          <label>Impacto</label>
          <textarea className="form-control" rows={2} value={form.impacto} onChange={e => setForm(f => ({ ...f, impacto: e.target.value }))} placeholder="Descreva o impacto esperado..." />
        </div>
        <div className="form-group">
          <label>Riscos</label>
          <textarea className="form-control" rows={2} value={form.riscos} onChange={e => setForm(f => ({ ...f, riscos: e.target.value }))} placeholder="Identifique os riscos..." />
        </div>
        <div className="form-group">
          <label>ID Responsável</label>
          <input type="number" className="form-control" value={form.responsavel_id} onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))} placeholder="ID do responsável" />
        </div>
      </Modal>
    </div>
  );
}

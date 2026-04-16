/**
 * APEX pg 329 — RQ49 Lista de NOs (NATIVE_CARDS com tabs)
 * Padrão visual: PlanosList (sidebar + summary bar + cards)
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { rq49Service } from '../../services/qualidade/rq49Service';
import api from '../../lib/api';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { SkeletonSummaryBar, SkeletonCardGrid } from '../../components/SkeletonPlanos';
import { UserAvatar, Tooltip } from '../../components/ui';
import '../planos_acao/PlanosList.css';
import '../../components/Modal.css';
import './RQ49List.css';

const STATUS_MAP = {
  ABERTA:       { label: 'Aberta',       color: '#3b82f6' },
  EM_ANALISE:   { label: 'Em Análise',   color: '#f59e0b' },
  PROCEDENTE:   { label: 'Procedente',   color: '#22c55e' },
  IMPROCEDENTE: { label: 'Improcedente', color: '#6b7280' },
  FECHADA:      { label: 'Fechada',      color: '#6b7280' },
};

const STATUS_SIDEBAR = [
  { value: 'T',            label: 'Todas' },
  { value: 'ABERTA',       label: 'Abertas' },
  { value: 'EM_ANALISE',   label: 'Em Análise' },
  { value: 'PROCEDENTE',   label: 'Procedentes' },
  { value: 'IMPROCEDENTE', label: 'Improcedentes' },
  { value: 'FECHADA',      label: 'Fechadas' },
];

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function buildStatusTooltip(r) {
  const parts = [];
  if (r.dt_abertura || r.created_at) parts.push(`Aberta: ${fmtDate(r.dt_abertura || r.created_at)}`);
  if (r.updated_at) {
    const upd = new Date(r.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    parts.push(`Atualizado: ${upd}`);
  }
  if (r.dt_fechamento) parts.push(`Fechada: ${fmtDate(r.dt_fechamento)}`);
  return parts.length ? parts.join(' \u2022 ') : null;
}

function SummaryBar({ items, total }) {
  const counts = useMemo(() => {
    const c = { ABERTA: 0, EM_ANALISE: 0, PROCEDENTE: 0, IMPROCEDENTE: 0, FECHADA: 0 };
    items.forEach(i => { const s = (i.status || 'ABERTA').toUpperCase(); if (s in c) c[s]++; });
    return c;
  }, [items]);

  return (
    <div className="planos-summary-bar">
      <div className="planos-summary-card">
        <span className="summary-num">{total}</span>
        <span className="summary-lbl">Total</span>
      </div>
      <div className="planos-summary-card rq49-abertas">
        <span className="summary-num">{counts.ABERTA}</span>
        <span className="summary-lbl">Abertas</span>
      </div>
      <div className="planos-summary-card rq49-analise">
        <span className="summary-num">{counts.EM_ANALISE}</span>
        <span className="summary-lbl">Em Análise</span>
      </div>
      <div className="planos-summary-card rq49-procedentes">
        <span className="summary-num">{counts.PROCEDENTE}</span>
        <span className="summary-lbl">Procedentes</span>
      </div>
      <div className="planos-summary-card rq49-fechadas">
        <span className="summary-num">{counts.FECHADA + counts.IMPROCEDENTE}</span>
        <span className="summary-lbl">Fechadas</span>
      </div>
    </div>
  );
}

export default function RQ49List() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('T');
  const [busca, setBusca] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', descricao: '' });
  const [saving, setSaving] = useState(false);
  const [dashPeriodo, setDashPeriodo] = useState(6);
  const [dashData, setDashData] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();
  const perPage = 20;

  useEffect(() => { fetchData(); }, [page, statusFilter]);

  const fetchDashboard = async (meses) => {
    try {
      const { data } = await api.get('/api/qualidade/rq49/dashboard', { params: { periodo_meses: meses } });
      setDashData(data);
    } catch { /* silencioso */ }
  };

  useEffect(() => { fetchDashboard(dashPeriodo); }, [dashPeriodo]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage };
      if (statusFilter !== 'T') params.status = statusFilter;
      const { data } = await rq49Service.listar(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { toast.error('Erro ao carregar Notas de Oportunidade'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.titulo.trim()) { toast.error('Título obrigatório'); return; }
    if (saving) return;
    setSaving(true);
    try {
      const { data } = await rq49Service.criar(form);
      toast.success('Nota de Oportunidade criada');
      setModalOpen(false);
      setForm({ titulo: '', descricao: '' });
      navigate(`/qualidade/rq49/${data.id}`);
    } catch { toast.error('Erro ao criar'); }
    finally { setSaving(false); }
  };

  const filteredItems = useMemo(() => {
    if (!busca.trim()) return items;
    const q = busca.toLowerCase();
    return items.filter(r =>
      (r.titulo || '').toLowerCase().includes(q) ||
      (r.codigo || '').toLowerCase().includes(q) ||
      (r.responsavel_nome || '').toLowerCase().includes(q) ||
      (r.origem || '').toLowerCase().includes(q)
    );
  }, [items, busca]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="planos-container">
      {/* SIDEBAR */}
      <aside className="planos-sidebar">
        <div className="sidebar-section">
          <label className="sidebar-label">Status</label>
          {STATUS_SIDEBAR.map(opt => (
            <label key={opt.value} className={`sidebar-radio ${statusFilter === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${statusFilter === opt.value ? 'checked' : ''}`} />
              <span onClick={() => { setStatusFilter(opt.value); setPage(1); }}>{opt.label}</span>
            </label>
          ))}
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <label className="sidebar-label">Por</label>
          {[
            { value: 'T', label: 'Todas' },
            { value: 'M', label: 'Minhas NOs' },
          ].map(opt => (
            <label key={opt.value} className="sidebar-radio">
              <span className="radio-dot" />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </aside>

      {/* MAIN */}
      <main className="planos-main">
        {/* Header */}
        <div className="planos-header">
          <h1>Notas de Oportunidade</h1>
          <button className="planos-btn-novo" onClick={() => setModalOpen(true)}>Nova NO +</button>
        </div>

        {/* Summary bar */}
        {loading ? <SkeletonSummaryBar /> : <SummaryBar items={items} total={total} />}

        {/* Dashboard com período (tarefa 280) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
          <span>Período:</span>
          {[3, 6, 12].map(m => (
            <button key={m}
              style={{
                padding: '2px 10px', borderRadius: 12, border: '1px solid var(--border-subtle)',
                background: dashPeriodo === m ? 'var(--accent)' : 'var(--bg-secondary)',
                color: dashPeriodo === m ? '#fff' : 'var(--text-secondary)',
                fontSize: 12, cursor: 'pointer'
              }}
              onClick={() => setDashPeriodo(m)}>{m}m</button>
          ))}
          {dashData && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              Eficácia: <strong style={{ color: 'var(--accent)' }}>
                {dashData.totais?.avaliadas > 0
                  ? `${Math.round((dashData.totais.eficazes / dashData.totais.avaliadas) * 100)}%`
                  : '—'}
              </strong>
            </span>
          )}
        </div>

        {/* Search toolbar */}
        <div className="planos-toolbar">
          <div className="planos-search">
            <Icon width={14} height={14}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>
            <input
              type="text"
              placeholder="Pesquisar notas de oportunidade..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
        </div>

        {/* Cards grid */}
        {loading ? (
          <SkeletonCardGrid cards={6} />
        ) : filteredItems.length === 0 ? (
          <div className="planos-empty">
            <span style={{ fontSize: '2.5rem' }}>📋</span>
            <p>Nenhuma nota de oportunidade encontrada</p>
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
                  onClick={() => navigate(`/qualidade/rq49/${r.id}`)}
                >
                  <div className="rq49-card-header">
                    <span className="rq49-card-code">{r.codigo || `NO-${r.id}`}</span>
                    <Tooltip text={buildStatusTooltip(r)} placement="top">
                      <span className="rq49-card-badge" style={{ background: stInfo.color + '22', color: stInfo.color }}>
                        {stInfo.label}
                      </span>
                    </Tooltip>
                  </div>

                  <div className="rq49-card-title">
                    {r.titulo || r.descricao?.substring(0, 120) || '—'}
                  </div>

                  {(r.origem || r.classificacao) && (
                    <div className="rq49-card-tags">
                      {r.origem && <span className="rq49-tag">{r.origem}</span>}
                      {r.classificacao && <span className="rq49-tag">{r.classificacao}</span>}
                    </div>
                  )}

                  <div className="rq49-card-footer">
                    <div className="rq49-card-user">
                      <UserAvatar name={r.responsavel_nome} size={26} />
                      <span>{r.responsavel_nome || '—'}</span>
                    </div>
                    <span className="rq49-card-date">
                      {r.dt_abertura ? new Date(r.dt_abertura).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && !loading && (
          <div className="planos-pagination">
            <span className="pagination-info">
              {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} de {total}
            </span>
            <div className="pagination-buttons">
              <button disabled={page <= 1} onClick={() => setPage(1)}>«</button>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0 12px' }}>
                {page} / {totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              <button disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
          </div>
        )}
      </main>

      {/* Modal Criar — APEX pg 320 */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova Nota de Oportunidade"
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
          <input className="form-control" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Descrição</label>
          <textarea className="form-control" rows={4} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}

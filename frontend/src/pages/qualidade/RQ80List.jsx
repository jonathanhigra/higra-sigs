/**
 * Tarefas 281-282 — RQ80 Lista de Auditorias
 * Padrão visual: RQ49List (sidebar + summary + cards)
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { rq80Service } from '../../services/qualidade/qualidadeService';
import Modal from '../../components/Modal';
import { UserAvatar } from '../../components/ui';
import '../../components/Modal.css';
import '../planos_acao/PlanosList.css';
import './RQ49List.css';

const STATUS_MAP = {
  PLANEJADA:     { label: 'Planejada',     color: '#3b82f6' },
  EM_EXECUCAO:   { label: 'Em Execução',   color: '#f59e0b' },
  CONCLUIDA:     { label: 'Concluída',     color: '#22c55e' },
  CANCELADA:     { label: 'Cancelada',     color: '#6b7280' },
};

const STATUS_SIDEBAR = [
  { value: 'T',           label: 'Todas' },
  { value: 'PLANEJADA',   label: 'Planejadas' },
  { value: 'EM_EXECUCAO', label: 'Em Execução' },
  { value: 'CONCLUIDA',   label: 'Concluídas' },
  { value: 'CANCELADA',   label: 'Canceladas' },
];

const TIPO_SIDEBAR = [
  { value: 'T',        label: 'Todos' },
  { value: 'INTERNA',  label: 'Interna' },
  { value: 'EXTERNA',  label: 'Externa' },
];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

export default function RQ80List() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('T');
  const [tipoFilter, setTipoFilter] = useState('T');
  const [busca, setBusca] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    titulo: '', tipo: 'INTERNA', escopo: '',
    auditor_id: '', auditado_id: '',
    dt_inicio: '', dt_fim: '', dt_auditoria: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchData(); }, [statusFilter, tipoFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'T') params.status = statusFilter;
      if (tipoFilter !== 'T') params.tipo = tipoFilter;
      const { data } = await rq80Service.listar(params);
      setItems(data.items || data || []);
      setTotal(data.total || (data.items || data || []).length);
    } catch {
      toast.error('Erro ao carregar auditorias');
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
      if (payload.auditor_id) payload.auditor_id = Number(payload.auditor_id);
      if (payload.auditado_id) payload.auditado_id = Number(payload.auditado_id);
      if (!payload.auditor_id) delete payload.auditor_id;
      if (!payload.auditado_id) delete payload.auditado_id;
      if (!payload.dt_inicio) delete payload.dt_inicio;
      if (!payload.dt_fim) delete payload.dt_fim;
      if (!payload.dt_auditoria) delete payload.dt_auditoria;
      const { data } = await rq80Service.criar(payload);
      toast.success('Auditoria criada');
      setModalOpen(false);
      setForm({ titulo: '', tipo: 'INTERNA', escopo: '', auditor_id: '', auditado_id: '', dt_inicio: '', dt_fim: '', dt_auditoria: '' });
      navigate(`/qualidade/rq80/${data.id}`);
    } catch {
      toast.error('Erro ao criar auditoria');
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!busca.trim()) return items;
    const q = busca.toLowerCase();
    return items.filter(r =>
      (r.titulo || '').toLowerCase().includes(q) ||
      (r.auditor_nome || '').toLowerCase().includes(q) ||
      (r.tipo || '').toLowerCase().includes(q)
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

        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <label className="sidebar-label">Tipo</label>
          {TIPO_SIDEBAR.map(opt => (
            <label
              key={opt.value}
              className={`sidebar-radio ${tipoFilter === opt.value ? 'active' : ''}`}
              onClick={() => setTipoFilter(opt.value)}
            >
              <span className={`radio-dot ${tipoFilter === opt.value ? 'checked' : ''}`} />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </aside>

      {/* MAIN */}
      <main className="planos-main">
        <div className="planos-header">
          <h1>Auditorias (RQ80)</h1>
          <button className="planos-btn-novo" onClick={() => setModalOpen(true)}>Nova Auditoria +</button>
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
              placeholder="Pesquisar auditorias..."
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
            <span style={{ fontSize: '2.5rem' }}>🔍</span>
            <p>Nenhuma auditoria encontrada</p>
          </div>
        ) : (
          <div className="rq49-cards-grid">
            {filteredItems.map(r => {
              const st = (r.status || 'PLANEJADA').toUpperCase();
              const stInfo = STATUS_MAP[st] || STATUS_MAP.PLANEJADA;
              return (
                <div
                  key={r.id}
                  className="rq49-card"
                  style={{ borderLeft: `4px solid ${stInfo.color}` }}
                  onClick={() => navigate(`/qualidade/rq80/${r.id}`)}
                >
                  <div className="rq49-card-header">
                    <span className="rq49-card-code">{r.tipo || 'INTERNA'}</span>
                    <span
                      className="rq49-card-badge"
                      style={{ background: stInfo.color + '22', color: stInfo.color }}
                    >
                      {stInfo.label}
                    </span>
                  </div>

                  <div className="rq49-card-title">{r.titulo || '—'}</div>

                  {r.escopo && (
                    <div className="rq49-card-tags">
                      <span className="rq49-tag">{r.escopo.substring(0, 60)}{r.escopo.length > 60 ? '…' : ''}</span>
                    </div>
                  )}

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {r.dt_auditoria && <span>Auditoria: {fmtDate(r.dt_auditoria)}</span>}
                    {r.dt_inicio && <span>Início: {fmtDate(r.dt_inicio)}</span>}
                    {r.dt_fim && <span>Fim: {fmtDate(r.dt_fim)}</span>}
                  </div>

                  <div className="rq49-card-footer">
                    <div className="rq49-card-user">
                      <UserAvatar name={r.auditor_nome} size={26} />
                      <span>{r.auditor_nome || '—'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal Nova Auditoria */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova Auditoria"
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
            placeholder="Título da auditoria"
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Tipo *</label>
            <select className="form-control" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
              <option value="INTERNA">Interna</option>
              <option value="EXTERNA">Externa</option>
            </select>
          </div>
          <div className="form-group">
            <label>Data Auditoria</label>
            <input type="date" className="form-control" value={form.dt_auditoria} onChange={e => setForm(f => ({ ...f, dt_auditoria: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label>Escopo</label>
          <textarea className="form-control" rows={3} value={form.escopo} onChange={e => setForm(f => ({ ...f, escopo: e.target.value }))} placeholder="Escopo da auditoria..." />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>ID Auditor</label>
            <input type="number" className="form-control" value={form.auditor_id} onChange={e => setForm(f => ({ ...f, auditor_id: e.target.value }))} placeholder="ID do auditor" />
          </div>
          <div className="form-group">
            <label>ID Auditado</label>
            <input type="number" className="form-control" value={form.auditado_id} onChange={e => setForm(f => ({ ...f, auditado_id: e.target.value }))} placeholder="ID do auditado" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Data Início</label>
            <input type="date" className="form-control" value={form.dt_inicio} onChange={e => setForm(f => ({ ...f, dt_inicio: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Data Fim</label>
            <input type="date" className="form-control" value={form.dt_fim} onChange={e => setForm(f => ({ ...f, dt_fim: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

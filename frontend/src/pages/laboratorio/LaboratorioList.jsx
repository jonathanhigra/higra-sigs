/**
 * Laboratório / Bancada — Lista (padrão visual PlanosList)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { laboratorioService } from '../../services/laboratorio/laboratorioService';
import Icon from '../../components/Icon';
import { SkeletonSimpleTable } from '../../components/SkeletonPlanos';
import Modal from '../../components/Modal';
import '../../components/Modal.css';
import '../planos_acao/PlanosList.css';
import { UserAvatar } from '../../components/ui';
import './LaboratorioList.css';

const STATUS_MAP = {
  AGU: { label: 'Aguardando',   rowBg: 'rgba(33, 150, 243, 0.08)' },
  AGENDADO: { label: 'Aguardando', rowBg: 'rgba(33, 150, 243, 0.08)' },
  EXE: { label: 'Em Execução',  rowBg: 'transparent' },
  EM_EXECUCAO: { label: 'Em Execução', rowBg: 'transparent' },
  FIN: { label: 'Finalizado',   rowBg: 'rgba(76, 175, 80, 0.08)' },
  FINALIZADO: { label: 'Finalizado', rowBg: 'rgba(76, 175, 80, 0.08)' },
  APR: { label: 'Aprovado',     rowBg: 'rgba(76, 175, 80, 0.08)' },
  REP: { label: 'Reprovado',    rowBg: 'rgba(239, 68, 68, 0.08)' },
  REPROVADO: { label: 'Reprovado', rowBg: 'rgba(239, 68, 68, 0.08)' },
};

const STATUS_BADGES = [
  { key: 'AGU', aliases: ['AGU','AGENDADO'], label: 'Agendado',     bg: '#2196f3' },
  { key: 'EXE', aliases: ['EXE','EM_EXECUCAO'], label: 'Em Execução', bg: '#ff9800' },
  { key: 'FIN', aliases: ['FIN','FINALIZADO'], label: 'Finalizado',  bg: '#4caf50' },
  { key: 'REP', aliases: ['REP','REPROVADO'], label: 'Reprovado',   bg: '#ef4444' },
];

function normStatus(s) {
  if (!s) return 'AGU';
  const u = s.toUpperCase();
  if (['AGU','AGENDADO'].includes(u)) return 'AGU';
  if (['EXE','EM_EXECUCAO'].includes(u)) return 'EXE';
  if (['FIN','FINALIZADO'].includes(u)) return 'FIN';
  if (['APR'].includes(u)) return 'APR';
  if (['REP','REPROVADO'].includes(u)) return 'REP';
  return 'AGU';
}

function badgeGroupForStatus(s) {
  const n = normStatus(s);
  if (n === 'APR') return 'FIN';
  return n;
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

export default function LaboratorioList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('T');
  const [tipoFilter, setTipoFilter] = useState('T');
  const [tiposTeste, setTiposTeste] = useState([]);
  const [search, setSearch] = useState('');
  const [activeBadges, setActiveBadges] = useState(STATUS_BADGES.map(b => b.key));
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ descricao: '', dt_agendamento: '', pv: '', nr_serie: '' });
  const navigate = useNavigate();
  const toast = useToast();
  const perPage = 20;

  useEffect(() => {
    laboratorioService.tiposTeste()
      .then(({ data }) => setTiposTeste(data.items || data || []))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [page, statusFilter, tipoFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, per_page: perPage };
      if (statusFilter !== 'T') params.status = statusFilter;
      if (tipoFilter !== 'T') params.tipo_teste = tipoFilter;
      const { data } = await laboratorioService.listarTestes(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { toast.error('Erro ao carregar testes'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    try {
      const { data } = await laboratorioService.criarTeste(form);
      toast.success('Teste agendado');
      setModalOpen(false);
      setForm({ descricao: '', dt_agendamento: '', pv: '', nr_serie: '' });
      navigate(`/laboratorio/${data.id}`);
    } catch { toast.error('Erro ao criar'); }
  };

  const toggleBadge = (key) => {
    setActiveBadges(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const filtered = items.filter(item => {
    const group = badgeGroupForStatus(item.status);
    if (!activeBadges.includes(group)) return false;
    if (search) {
      const hay = [item.pv, item._nr_serie, item.nr_serie, item.descricao, item.tipo_teste, item.responsavel_nome, item.equipamento].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const startIdx = (page - 1) * perPage + 1;
  const endIdx = Math.min(page * perPage, total);

  return (
    <div className="lab-container">
      {/* LEFT SIDEBAR */}
      <aside className="planos-sidebar">
        <div className="sidebar-section">
          <label className="sidebar-label">
            <span style={{ fontSize: '0.85rem' }}>☰</span> Filtros
          </label>
        </div>

        <div className="sidebar-section">
          <label className="sidebar-label">Status</label>
          {[
            { value: 'T', label: 'Todos' },
            { value: 'AGENDADO', label: 'Agendado' },
            { value: 'EM_EXECUCAO', label: 'Em Execução' },
            { value: 'FINALIZADO', label: 'Finalizado' },
          ].map(opt => (
            <label key={opt.value} className={`sidebar-radio ${statusFilter === opt.value ? 'active' : ''}`}>
              <span className={`radio-dot ${statusFilter === opt.value ? 'checked' : ''}`} />
              <span onClick={() => { setStatusFilter(opt.value); setPage(1); }}>{opt.label}</span>
            </label>
          ))}
        </div>

        <div className="sidebar-divider" />

        <div className="sidebar-section">
          <label className="sidebar-label">Tipo Teste</label>
          <label className={`sidebar-radio ${tipoFilter === 'T' ? 'active' : ''}`}>
            <span className={`radio-dot ${tipoFilter === 'T' ? 'checked' : ''}`} />
            <span onClick={() => { setTipoFilter('T'); setPage(1); }}>Todos</span>
          </label>
          {tiposTeste.map(tp => {
            const val = tp.codigo || tp.nome || tp.id;
            const lbl = tp.nome || tp.descricao || tp.codigo || val;
            return (
              <label key={val} className={`sidebar-radio ${tipoFilter === val ? 'active' : ''}`}>
                <span className={`radio-dot ${tipoFilter === val ? 'checked' : ''}`} />
                <span onClick={() => { setTipoFilter(val); setPage(1); }}>{lbl}</span>
              </label>
            );
          })}
        </div>
      </aside>

      {/* MAIN */}
      <main className="lab-main">
        {/* Header */}
        <div className="planos-header">
          <h1>Laboratório / Bancada</h1>
          <button className="planos-btn-novo" onClick={() => setModalOpen(true)}>
            + Agendar Teste
          </button>
        </div>

        {/* Search + Badges */}
        <div className="planos-toolbar">
          <div className="planos-search">
            <Icon width={15} height={15}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>
            <input type="text" placeholder="Pesquisar testes..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="planos-badges">
            {STATUS_BADGES.map(b => {
              const isActive = activeBadges.includes(b.key);
              const count = items.filter(i => badgeGroupForStatus(i.status) === b.key).length;
              return (
                <button key={b.key} className={`planos-badge ${isActive ? 'active' : 'inactive'}`}
                  style={{ '--badge-bg': b.bg }} onClick={() => toggleBadge(b.key)}>
                  <span className="badge-check">{isActive ? '✓' : ''}</span>
                  <span className="badge-label">{b.label}</span>
                  {count > 0 && <span className="badge-count">{count}</span>}
                  <span className="badge-close" onClick={e => { e.stopPropagation(); toggleBadge(b.key); }}>×</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="lab-table-wrapper">
            <table className="lab-table">
              <thead><tr><th className="col-action"></th><th>PV</th><th>Nr. Série</th><th>Tipo Teste</th><th>Equipamento</th><th>Status</th><th>Agendamento</th><th>Responsável</th></tr></thead>
              <tbody><SkeletonSimpleTable rows={7} cols={[36, 70, 100, 120, 130, 80, 90, 120]} /></tbody>
            </table>
          </div>
        ) : filtered.length === 0 ? (
          <div className="planos-empty">
            <span style={{ fontSize: '2.5rem' }}>🔬</span>
            <p>Nenhum teste encontrado</p>
          </div>
        ) : (
          <>
            <div className="lab-table-wrapper">
              <table className="lab-table">
                <thead>
                  <tr>
                    <th className="col-action"></th>
                    <th className="col-center">PV</th>
                    <th className="col-center">Nr. Série</th>
                    <th>Tipo Teste</th>
                    <th>Equipamento</th>
                    <th className="col-center">Status</th>
                    <th className="col-center">Agendamento</th>
                    <th>Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => {
                    const st = normStatus(t.status);
                    const cfg = STATUS_MAP[st] || STATUS_MAP.AGU;
                    return (
                      <tr key={t.id} style={{ '--row-bg': cfg.rowBg }} className="lab-row"
                        onClick={() => navigate(`/laboratorio/${t.id}`)}>
                        <td className="col-action">
                          <button className="edit-btn" onClick={e => { e.stopPropagation(); navigate(`/laboratorio/${t.id}`); }} title="Editar teste">
                            <Icon width={13} height={13}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>
                          </button>
                        </td>
                        <td className="col-center col-mono">{t.pv || '—'}</td>
                        <td className="col-center col-nowrap">{t._nr_serie || t.nr_serie || '—'}</td>
                        <td>{t.tipo_teste || '—'}</td>
                        <td>{t.equipamento || '—'}</td>
                        <td className="col-center">
                          <span className={`lab-status lab-status-${st.toLowerCase()}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="col-center col-nowrap">{formatDate(t._dt_agendamento || t.dt_agendamento)}</td>
                        <td>
                          <div className="user-cell">
                            <UserAvatar name={t.responsavel_nome} size={32} />
                            <span className="user-name">{t.responsavel_nome || '—'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="planos-pagination">
              <span className="pagination-info">{startIdx}–{endIdx} de {total} registros</span>
              <div className="pagination-buttons">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>◀</button>
                <span className="pagination-page">Página {page} de {Math.max(1, Math.ceil(total / perPage))}</span>
                <button disabled={page >= Math.ceil(total / perPage)} onClick={() => setPage(p => p + 1)}>▶</button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Modal Criar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Agendar Teste"
        footer={<><button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button><button className="btn-primary" onClick={handleCreate}>Agendar</button></>}>
        <div className="form-group"><label>Descrição *</label><input className="form-control" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} /></div>
        <div className="form-row">
          <div className="form-group"><label>Data agendamento</label><input type="date" className="form-control" value={form.dt_agendamento} onChange={e => setForm(f => ({ ...f, dt_agendamento: e.target.value }))} /></div>
          <div className="form-group"><label>PV</label><input className="form-control" value={form.pv} onChange={e => setForm(f => ({ ...f, pv: e.target.value }))} /></div>
        </div>
        <div className="form-group"><label>Nr. Série</label><input className="form-control" value={form.nr_serie} onChange={e => setForm(f => ({ ...f, nr_serie: e.target.value }))} /></div>
      </Modal>
    </div>
  );
}

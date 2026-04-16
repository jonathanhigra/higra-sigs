/**
 * APEX pg 25 — Agenda (Detalhe da Reunião)
 * Padrão PlanoDetail: header card + meta chips + tabs + modais
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { agendaService } from '../../services/reunioes/agendaService';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { SkeletonReuniaoDetail } from '../../components/SkeletonPlanos';
import useLovStore from '../../stores/lovStore';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import '../../components/Modal.css';
import '../planos_acao/PlanoDetail.css';
import './ReuniaoDetail.css';

// ── helpers ───────────────────────────────────────────────────────────────────

function diasParaReuniao(dt) {
  if (!dt) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const data  = new Date(dt + (dt.includes('T') ? '' : 'T00:00:00'));
  return Math.round((data - hoje) / 86400000);
}

const STATUS_COLORS = {
  AGENDADA:     '#3b82f6',
  EM_ANDAMENTO: '#f59e0b',
  ENCERRADA:    '#22c55e',
  CANCELADA:    '#ef4444',
};

const STATUS_LABELS = {
  AGENDADA:     'Agendada',
  EM_ANDAMENTO: 'Em Andamento',
  ENCERRADA:    'Encerrada',
  CANCELADA:    'Cancelada',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReuniaoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { getUsuarios } = useLovStore();

  const [agenda, setAgenda] = useState(null);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [tab, setTab] = useState('pautas');

  // Inline inputs
  const [newPauta, setNewPauta] = useState('');
  const [newDecisao, setNewDecisao] = useState('');

  // Modais
  const [modalAcao, setModalAcao] = useState(false);
  const [modalParticipante, setModalParticipante] = useState(false);
  const [modalCancelar, setModalCancelar] = useState(false);
  const [modalReagendar, setModalReagendar] = useState(false);

  // Forms
  const [acaoForm, setAcaoForm] = useState({ descricao: '', responsavel_id: '', dt_prazo: '' });
  const [participanteForm, setParticipanteForm] = useState({ usuario_id: '' });
  const [partSearch, setPartSearch] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [cancelarForm, setCancelarForm] = useState('');
  const [reagendarForm, setReagendarForm] = useState({ dt_agenda: '', hr_inicio: '', hr_fim: '', justificativa: '' });
  const [modalDuracao, setModalDuracao] = useState(false);
  const [duracaoForm, setDuracaoForm] = useState({ horas: '', minutos: '' });

  const fetchData = useCallback(async () => {
    try {
      const { data } = await agendaService.obter(id);
      setAgenda(data);
    } catch { toast.error('Erro ao carregar reunião'); navigate('/reunioes'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { getUsuarios().then(setUsuarios); }, []);

  useDocumentTitle(agenda ? (agenda.titulo || 'Reunião') : 'Reunião');

  const filteredUsers = useMemo(() => {
    if (!partSearch.trim()) return [];
    const q = partSearch.toLowerCase();
    return usuarios.filter(u => (u.nome || '').toLowerCase().includes(q)).slice(0, 8);
  }, [usuarios, partSearch]);

  if (loading) return <SkeletonReuniaoDetail />;
  if (!agenda) return null;

  // ── derived state ─────────────────────────────────────────────────────────
  const st = (agenda._status || agenda.status || 'AGENDADA').toUpperCase();
  const isFinalizada = ['ENCERRADA', 'CANCELADA'].includes(st);
  const dtAgenda = agenda._dt_agenda || agenda.dt_agenda;
  const hrIni    = agenda._hr_inicio  || agenda.hr_inicio  || '';
  const hrFim    = agenda._hr_fim     || agenda.hr_fim     || '';
  const titulo   = agenda._titulo || agenda.titulo || agenda.descricao || 'Reunião';
  const diasRestantes = diasParaReuniao(dtAgenda ? String(dtAgenda).substring(0, 10) : null);
  const isAtrasada = diasRestantes !== null && diasRestantes < 0 && !isFinalizada;
  const tituloDisplay = agenda.titulo ||
    (dtAgenda
      ? `${agenda.tipo_descricao || agenda.tipo || 'Reunião'} — ${new Date(String(dtAgenda).substring(0,10)+'T00:00:00').toLocaleDateString('pt-BR')}`
      : 'Reunião');

  // ── actions ───────────────────────────────────────────────────────────────

  const handleStatusChange = async (status) => {
    if (operating) return;
    setOperating(true);
    try {
      await agendaService.atualizar(id, { status });
      toast.success('Status atualizado');
      fetchData();
    } catch { toast.error('Erro ao atualizar status'); }
    finally { setOperating(false); }
  };

  const addPauta = async () => {
    if (!newPauta.trim() || operating) return;
    setOperating(true);
    try {
      await agendaService.addPauta(id, { descricao: newPauta, ordem: (agenda.pautas?.length || 0) + 1 });
      setNewPauta(''); fetchData();
    } catch { toast.error('Erro'); }
    finally { setOperating(false); }
  };

  const addDecisao = async () => {
    if (!newDecisao.trim() || operating) return;
    setOperating(true);
    try {
      await agendaService.addDecisao(id, { descricao: newDecisao });
      setNewDecisao(''); fetchData();
    } catch { toast.error('Erro'); }
    finally { setOperating(false); }
  };

  const addAcao = async () => {
    if (!acaoForm.descricao.trim() || operating) return;
    setOperating(true);
    try {
      await agendaService.addAcao(id, acaoForm);
      setModalAcao(false); setAcaoForm({ descricao: '', responsavel_id: '', dt_prazo: '' });
      fetchData(); toast.success('Ação registrada');
    } catch { toast.error('Erro'); }
    finally { setOperating(false); }
  };

  const addParticipante = async () => {
    if (!participanteForm.usuario_id || operating) return;
    setOperating(true);
    try {
      await agendaService.addParticipante(id, participanteForm);
      setModalParticipante(false); setParticipanteForm({ usuario_id: '' }); setPartSearch('');
      fetchData(); toast.success('Participante adicionado');
    } catch { toast.error('Erro'); }
    finally { setOperating(false); }
  };

  const downloadICS = () => {
    if (!agenda) return;
    const dt = (agenda._dt_agenda || agenda.dt_agenda || '').slice(0, 10).replace(/-/g, '');
    const hi = (agenda._hr_inicio || agenda.hr_inicio || '09:00').slice(0, 5).replace(':', '') + '00';
    const hf = (agenda._hr_fim || agenda.hr_fim || '10:00').slice(0, 5).replace(':', '') + '00';
    const titulo = (agenda._titulo || agenda.titulo || 'Reunião').replace(/[,;\\]/g, ' ');
    const local = (agenda.local || '').replace(/[,;\\]/g, ' ');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HIGRA SIGS//PT',
      'BEGIN:VEVENT',
      `DTSTART:${dt}T${hi}`,
      `DTEND:${dt}T${hf}`,
      `SUMMARY:${titulo}`,
      local ? `LOCATION:${local}` : '',
      `DESCRIPTION:Reunião agendada pelo SIGS`,
      `UID:reu-${agenda.id}@higra.sigs`,
      'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reuniao-${agenda.id}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleMarcarPresenca = async (partId, presente) => {
    try {
      await agendaService.marcarPresenca(id, partId, { presente });
      fetchData();
    } catch { toast.error('Erro ao marcar presença'); }
  };

  const handleSeguirPauta = async (pautaId, emDiscussao) => {
    try {
      await agendaService.seguirPauta(id, pautaId, { em_discussao: emDiscussao });
      fetchData();
    } catch { toast.error('Erro ao marcar pauta'); }
  };

  const handleDuracaoReal = async () => {
    const horas = parseInt(duracaoForm.horas || 0, 10);
    const minutos = parseInt(duracaoForm.minutos || 0, 10);
    const total = horas * 60 + minutos;
    if (total <= 0) { toast.error('Informe a duração'); return; }
    try {
      await agendaService.registrarDuracao(id, { duracao_real: total });
      toast.success('Duração registrada');
      setModalDuracao(false);
      setDuracaoForm({ horas: '', minutos: '' });
      fetchData();
    } catch { toast.error('Erro ao registrar duração'); }
  };

  const handleReagendar = async () => {
    if (!reagendarForm.dt_agenda || operating) return;
    setOperating(true);
    try {
      await agendaService.atualizar(id, {
        dt_agenda: reagendarForm.dt_agenda,
        hr_inicio: reagendarForm.hr_inicio,
        hr_fim:    reagendarForm.hr_fim,
      });
      toast.success('Reunião reagendada'); setModalReagendar(false); fetchData();
    } catch { toast.error('Erro ao reagendar'); }
    finally { setOperating(false); }
  };

  // ── tabs config ───────────────────────────────────────────────────────────
  const tabs = [
    { key: 'pautas',        label: 'Pautas',        count: (agenda.pautas || []).length },
    { key: 'decisoes',      label: 'Decisões',       count: (agenda.decisoes || []).length },
    { key: 'acoes',         label: 'Ações',          count: (agenda.acoes || []).length },
    { key: 'participantes', label: 'Participantes',  count: (agenda.participantes || []).length },
  ];

  return (
    <div className="plano-detail">

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div className="plano-header-card">
        <div className="plano-header-left">
          <div className="plano-breadcrumb-text">
            <a onClick={() => navigate('/reunioes')} style={{ cursor: 'pointer' }}>Reuniões</a>
            {' › '}{tituloDisplay}
          </div>
          <div className="plano-header-title-row">
            <h2 className="plano-title">{tituloDisplay}</h2>
            <span
              className="plano-status-badge"
              style={{ background: STATUS_COLORS[st] || '#3b82f6', color: '#fff', borderRadius: 12, padding: '3px 12px', fontSize: '0.78rem', fontWeight: 700 }}
            >
              {STATUS_LABELS[st] || st}
            </span>
            {diasRestantes !== null && (
              <span className={`plano-countdown-badge${isAtrasada ? ' over' : diasRestantes <= 1 ? ' soon' : ''}`}>
                {isAtrasada
                  ? `${Math.abs(diasRestantes)}d atrás`
                  : diasRestantes === 0 ? 'Hoje!'
                  : `em ${diasRestantes}d`}
              </span>
            )}
          </div>
        </div>

        <div className="plano-header-right">
          {st === 'AGENDADA' && (
            <button className="plano-btn" style={{ background: '#4caf50', color: '#fff' }} onClick={() => handleStatusChange('EM_ANDAMENTO')} disabled={operating}>
              <Icon><polygon points="5 3 19 12 5 21 5 3"/></Icon> Iniciar
            </button>
          )}
          {st === 'EM_ANDAMENTO' && (
            <button className="plano-btn" style={{ background: 'var(--accent)', color: '#fff' }} onClick={() => setModalDuracao(true)} disabled={operating}>
              <Icon><polyline points="20 6 9 17 4 12"/></Icon> Encerrar
            </button>
          )}
          <button className="plano-btn plano-btn-voltar" onClick={downloadICS} title="Baixar convite .ics">
            <Icon><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>
            <span className="reu-btn-label">.ics</span>
          </button>
          {!isFinalizada && (
            <button className="plano-btn plano-btn-voltar" onClick={() => setModalReagendar(true)} disabled={operating}>
              <Icon><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>
              <span className="reu-btn-label">Reagendar</span>
            </button>
          )}
          {!isFinalizada && (
            <button className="plano-btn plano-btn-excluir" onClick={() => setModalCancelar(true)} disabled={operating} title="Cancelar reunião">
              <Icon><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></Icon>
            </button>
          )}
          <button className="plano-btn plano-btn-voltar" onClick={() => navigate('/reunioes')}>
            <Icon><polyline points="15 18 9 12 15 6"/></Icon> Voltar
          </button>
        </div>
      </div>

      {/* ── Meta chips ──────────────────────────────────────────────────── */}
      <div className="plano-meta-chips">
        {dtAgenda && (
          <div className="plano-meta-chip">
            <span className="plano-meta-chip-icon">
              <Icon width={16} height={16}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>
            </span>
            <div className="plano-meta-chip-body">
              <span className="plano-meta-chip-label">Data</span>
              <span className="plano-meta-chip-value">
                {new Date(String(dtAgenda).substring(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR')}
              </span>
            </div>
          </div>
        )}
        {(hrIni || hrFim) && (
          <div className="plano-meta-chip">
            <span className="plano-meta-chip-icon">
              <Icon width={16} height={16}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Icon>
            </span>
            <div className="plano-meta-chip-body">
              <span className="plano-meta-chip-label">Horário</span>
              <span className="plano-meta-chip-value">
                {hrIni ? String(hrIni).substring(0, 5) : '—'}{hrFim ? ` — ${String(hrFim).substring(0, 5)}` : ''}
              </span>
            </div>
          </div>
        )}
        {agenda.local && (
          <div className="plano-meta-chip">
            <span className="plano-meta-chip-icon">
              <Icon width={16} height={16}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></Icon>
            </span>
            <div className="plano-meta-chip-body">
              <span className="plano-meta-chip-label">Local</span>
              <span className="plano-meta-chip-value">{agenda.local}</span>
            </div>
          </div>
        )}
        {agenda.tipo_descricao && (
          <div className="plano-meta-chip">
            <span className="plano-meta-chip-icon">
              <Icon width={16} height={16}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></Icon>
            </span>
            <div className="plano-meta-chip-body">
              <span className="plano-meta-chip-label">Tipo</span>
              <span className="plano-meta-chip-value">{agenda.tipo_descricao}</span>
            </div>
          </div>
        )}
        {agenda.responsavel_nome && (
          <div className="plano-meta-chip">
            <span className="plano-meta-chip-icon">
              <Icon width={16} height={16}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>
            </span>
            <div className="plano-meta-chip-body">
              <span className="plano-meta-chip-label">Responsável</span>
              <span className="plano-meta-chip-value">{agenda.responsavel_nome}</span>
            </div>
          </div>
        )}
        {(agenda.participantes || []).length > 0 && (
          <div className="plano-meta-chip">
            <span className="plano-meta-chip-icon">
              <Icon width={16} height={16}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></Icon>
            </span>
            <div className="plano-meta-chip-body">
              <span className="plano-meta-chip-label">Participantes</span>
              <span className="plano-meta-chip-value">{agenda.participantes.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* Descrição / Pauta geral */}
      {agenda.descricao && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Pauta</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{agenda.descricao}</div>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div className="reu-detail-tabs">
        {tabs.map(t => (
          <button key={t.key} className={`reu-detail-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.count > 0 && <span className="reu-tab-badge">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── Pautas ──────────────────────────────────────────────────────── */}
      {tab === 'pautas' && (
        <div className="reu-tab-content">
          {!isFinalizada && (
            <div className="reu-add-row">
              <input
                className="plano-input"
                placeholder="Qual a pauta?"
                value={newPauta}
                onChange={e => setNewPauta(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPauta()}
              />
              <button className="plano-btn plano-btn-salvar" onClick={addPauta} disabled={operating}>
                <Icon><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>
                Adicionar
              </button>
            </div>
          )}
          {(agenda.pautas || []).length === 0
            ? <div className="reu-tab-empty">Nenhuma pauta registrada</div>
            : (agenda.pautas || []).map((p, i) => (
                <div key={p.id} className="reu-pauta-item" style={{
                  background: p.em_discussao === 'S' ? 'var(--color-primary, #7c3aed)11' : undefined,
                  borderLeft: p.em_discussao === 'S' ? '3px solid var(--color-primary, #7c3aed)' : undefined,
                }}>
                  <span className="reu-pauta-num">{p.ordem || i + 1}</span>
                  <span style={{ flex: 1 }}>{p.descricao}</span>
                  {st === 'EM_ANDAMENTO' && (
                    <button
                      onClick={() => handleSeguirPauta(p.id, p.em_discussao !== 'S')}
                      style={{
                        fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, border: 'none',
                        cursor: 'pointer', fontWeight: 600,
                        background: p.em_discussao === 'S' ? 'var(--color-primary, #7c3aed)' : 'var(--feed-card)',
                        color: p.em_discussao === 'S' ? '#fff' : 'var(--feed-muted)',
                      }}
                      title={p.em_discussao === 'S' ? 'Parar discussão' : 'Iniciar discussão'}
                    >
                      {p.em_discussao === 'S' ? '▶ Em Discussão' : '▷ Seguir'}
                    </button>
                  )}
                </div>
              ))
          }
        </div>
      )}

      {/* ── Decisões ────────────────────────────────────────────────────── */}
      {tab === 'decisoes' && (
        <div className="reu-tab-content">
          {!isFinalizada && (
            <div className="reu-add-row">
              <input
                className="plano-input"
                placeholder="Nova decisão..."
                value={newDecisao}
                onChange={e => setNewDecisao(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDecisao()}
              />
              <button className="plano-btn plano-btn-salvar" onClick={addDecisao} disabled={operating}>
                <Icon><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>
                Adicionar
              </button>
            </div>
          )}
          {(agenda.decisoes || []).length === 0
            ? <div className="reu-tab-empty">Nenhuma decisão registrada</div>
            : (agenda.decisoes || []).map((d, i) => (
                <div key={d.id} className="reu-decisao-item">
                  <span className="reu-pauta-num">{i + 1}.</span>
                  <span>{d.descricao}</span>
                </div>
              ))
          }
        </div>
      )}

      {/* ── Ações ───────────────────────────────────────────────────────── */}
      {tab === 'acoes' && (
        <div className="reu-tab-content">
          {!isFinalizada && (
            <button className="plano-btn plano-btn-salvar" style={{ marginBottom: 12 }} onClick={() => setModalAcao(true)}>
              <Icon><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Icon>
              Nova Ação
            </button>
          )}
          {(agenda.acoes || []).length === 0
            ? <div className="reu-tab-empty">Nenhuma ação registrada</div>
            : (
              <div className="planos-table-wrapper">
                <table className="planos-table">
                  <thead><tr><th>Descrição</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead>
                  <tbody>
                    {(agenda.acoes || []).map(a => (
                      <tr key={a.id} className="planos-row">
                        <td style={{ fontWeight: 600 }}>{a.descricao}</td>
                        <td>{a.responsavel_nome || '—'}</td>
                        <td className="col-mono">{a.dt_prazo ? new Date(a.dt_prazo + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                        <td>
                          <span className="reu-acao-status" style={{
                            background: a.status === 'CONCLUIDA' ? '#22c55e22' : '#f59e0b22',
                            color:      a.status === 'CONCLUIDA' ? '#22c55e'   : '#f59e0b',
                          }}>{a.status || 'PENDENTE'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {/* ── Participantes ───────────────────────────────────────────────── */}
      {tab === 'participantes' && (
        <div className="reu-tab-content">
          {!isFinalizada && (
            <button className="plano-btn plano-btn-salvar" style={{ marginBottom: 12 }} onClick={() => setModalParticipante(true)}>
              <Icon><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></Icon>
              Adicionar Participante
            </button>
          )}
          {(agenda.participantes || []).length === 0
            ? <div className="reu-tab-empty">Nenhum participante</div>
            : (
              <div className="reu-participante-grid">
                {(agenda.participantes || []).map(p => (
                  <div key={p.id} className="reu-participante-card">
                    <span className="reu-participante-avatar">
                      {(p.usuario_nome || '?')[0].toUpperCase()}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div className="reu-participante-nome">{p.usuario_nome || `Usuário #${p.usuario_id || p.beg_usuario_id}`}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <button
                          onClick={() => handleMarcarPresenca(p.id, p.presente !== 'S')}
                          style={{
                            fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, border: 'none',
                            cursor: 'pointer', fontWeight: 600,
                            background: p.presente === 'S' ? '#22c55e22' : '#ef444422',
                            color: p.presente === 'S' ? '#22c55e' : '#ef4444',
                          }}
                        >
                          {p.presente === 'S' ? '✓ Presente' : '✗ Ausente'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* ── Modal Nova Ação ─────────────────────────────────────────────── */}
      <Modal open={modalAcao} onClose={() => setModalAcao(false)} title="Nova Ação" size="small"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalAcao(false)}>Cancelar</button>
            <button className="btn-primary" onClick={addAcao} disabled={operating}>Criar</button>
          </>
        }
      >
        <div className="form-group">
          <label>Descrição *</label>
          <textarea className="form-control" rows={3} value={acaoForm.descricao} onChange={e => setAcaoForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descreva a ação..." />
        </div>
        <div className="form-group">
          <label>Prazo</label>
          <input type="date" className="form-control" value={acaoForm.dt_prazo} onChange={e => setAcaoForm(f => ({ ...f, dt_prazo: e.target.value }))} />
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '8px 0 0' }}>
          Uma tarefa será gerada automaticamente ao criar esta ação.
        </p>
      </Modal>

      {/* ── Modal Adicionar Participante ─────────────────────────────────── */}
      <Modal
        open={modalParticipante}
        onClose={() => { setModalParticipante(false); setPartSearch(''); setParticipanteForm({ usuario_id: '' }); }}
        title="Adicionar Participante"
        size="small"
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setModalParticipante(false); setPartSearch(''); setParticipanteForm({ usuario_id: '' }); }}>Cancelar</button>
            <button className="btn-primary" onClick={addParticipante} disabled={operating || !participanteForm.usuario_id}>Adicionar</button>
          </>
        }
      >
        <div className="form-group">
          <label>Buscar participante</label>
          <div className="reu-user-search-wrap">
            <input
              className="reu-user-search-input"
              placeholder="Digite o nome..."
              value={partSearch}
              onChange={e => { setPartSearch(e.target.value); setParticipanteForm({ usuario_id: '' }); }}
              autoComplete="off"
            />
            {filteredUsers.length > 0 && (
              <div className="reu-user-search-dropdown">
                {filteredUsers.map(u => (
                  <div
                    key={u.id}
                    className={`reu-user-search-item${participanteForm.usuario_id === u.id ? ' selected' : ''}`}
                    onMouseDown={() => { setParticipanteForm({ usuario_id: u.id }); setPartSearch(''); }}
                  >
                    <span className="reu-user-avatar">{(u.nome || '?')[0].toUpperCase()}</span>
                    {u.nome}
                  </div>
                ))}
              </div>
            )}
          </div>
          {participanteForm.usuario_id && (() => {
            const u = usuarios.find(x => x.id === participanteForm.usuario_id);
            return u ? (
              <div className="reu-selected-user">
                <span className="reu-user-avatar">{(u.nome || '?')[0].toUpperCase()}</span>
                {u.nome}
              </div>
            ) : null;
          })()}
        </div>
      </Modal>

      {/* ── Modal Cancelar ───────────────────────────────────────────────── */}
      <Modal open={modalCancelar} onClose={() => setModalCancelar(false)} title="Cancelar Reunião" size="small"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalCancelar(false)}>Voltar</button>
            <button className="btn-primary" style={{ background: '#ef4444' }} onClick={() => { handleStatusChange('CANCELADA'); setModalCancelar(false); }} disabled={operating}>
              Confirmar Cancelamento
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Justificativa</label>
          <textarea className="form-control" rows={4} value={cancelarForm} onChange={e => setCancelarForm(e.target.value)} placeholder="Motivo do cancelamento..." />
        </div>
      </Modal>

      {/* ── Modal Reagendar ──────────────────────────────────────────────── */}
      <Modal open={modalReagendar} onClose={() => setModalReagendar(false)} title="Reagendar Reunião" size="small"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalReagendar(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleReagendar} disabled={operating}>Reagendar</button>
          </>
        }
      >
        <div className="form-group">
          <label>Nova Data *</label>
          <input type="date" className="form-control" value={reagendarForm.dt_agenda} onChange={e => setReagendarForm(f => ({ ...f, dt_agenda: e.target.value }))} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Novo Início</label>
            <input type="time" className="form-control" value={reagendarForm.hr_inicio} onChange={e => setReagendarForm(f => ({ ...f, hr_inicio: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Novo Fim</label>
            <input type="time" className="form-control" value={reagendarForm.hr_fim} onChange={e => setReagendarForm(f => ({ ...f, hr_fim: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label>Justificativa</label>
          <textarea className="form-control" value={reagendarForm.justificativa} onChange={e => setReagendarForm(f => ({ ...f, justificativa: e.target.value }))} placeholder="Por que a reunião foi reagendada?" />
        </div>
      </Modal>

      {/* ── Modal Duração Real (Encerrar) ────────────────────────────────── */}
      <Modal open={modalDuracao} onClose={() => setModalDuracao(false)} title="Encerrar Reunião" size="small"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalDuracao(false)}>Cancelar</button>
            <button className="btn-primary" style={{ background: '#22c55e' }} onClick={async () => {
              await handleDuracaoReal();
              handleStatusChange('ENCERRADA');
            }}>Encerrar</button>
          </>
        }
      >
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
          Registre a duração real da reunião antes de encerrar.
        </p>
        {hrIni && hrFim && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Planejado: {hrIni.slice(0, 5)} — {hrFim.slice(0, 5)}
          </p>
        )}
        <div className="form-row">
          <div className="form-group">
            <label>Horas reais</label>
            <input type="number" className="form-control" min={0} max={23}
              value={duracaoForm.horas}
              onChange={e => setDuracaoForm(f => ({ ...f, horas: e.target.value }))}
              placeholder="1" />
          </div>
          <div className="form-group">
            <label>Minutos reais</label>
            <input type="number" className="form-control" min={0} max={59}
              value={duracaoForm.minutos}
              onChange={e => setDuracaoForm(f => ({ ...f, minutos: e.target.value }))}
              placeholder="30" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

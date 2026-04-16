/**
 * APEX pg 204 — Projeto - Visão Geral
 *
 * Layout: Left sidebar (Info Card + Equipe + Progresso) + Main (Tabs)
 * Tabs: Anotações, Etapas, Custos Extras, Estatísticas, Histórico
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { projetoService } from '../../services/projetos/projetoService';
import { foccoService } from '../../services/projetos/foccoService';
import { tarefaService } from '../../services/tarefas/tarefaService';
import { lovService } from '../../services/lovService';
import Modal from '../../components/Modal';
import KanbanBoard from '../../components/KanbanBoard';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { StatusBadge, UserAvatar, Breadcrumbs, CopyButton, RelativeTime } from '../../components/ui';
import '../../components/Modal.css';
import '../../components/DetailPage.css';
import '../../components/KanbanBoard.css';

const PRIORIDADE_LABELS = { URGENTE: 'Urgente', ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' };

const STATUS_COLORS = {
  PENDENTE: 'var(--text-muted)',
  CONCLUIDO: '#22c55e',
  FINALIZADO: '#22c55e',
  EM_ANDAMENTO: '#3b82f6',
  CANCELADA: '#ef4444',
};

const PAPEL_COLORS = {
  RESPONSAVEL: '#3b82f6',
  APROVADOR: '#f59e0b',
  COLABORADOR: '#6b7280',
};
const PAPEL_LABELS = {
  RESPONSAVEL: 'Responsável',
  APROVADOR: 'Aprovador',
  COLABORADOR: 'Colaborador',
};
function PapelBadge({ papel }) {
  const p = (papel || 'COLABORADOR').toUpperCase();
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 10,
      backgroundColor: PAPEL_COLORS[p] || '#6b7280', color: '#fff',
      fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
    }}>{PAPEL_LABELS[p] || p}</span>
  );
}

function EtapaTimeline({ etapas, projeto }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Determine total date range
  const allDates = [
    projeto.dt_inicio,
    projeto.dt_prev_termino,
    projeto.dt_entrega,
    ...etapas.map(e => e.dt_inicio).filter(Boolean),
    ...etapas.map(e => e.dt_fim).filter(Boolean),
  ].filter(Boolean).map(d => new Date(d).getTime()).filter(n => !isNaN(n));

  if (allDates.length < 2) {
    return <div className="empty-state">Adicione datas de início e fim às etapas para visualizar a timeline.</div>;
  }

  const minTs = Math.min(...allDates);
  const maxTs = Math.max(...allDates);
  const totalMs = maxTs - minTs || 1;

  const toPct = (dateStr) => {
    if (!dateStr) return null;
    const ts = new Date(dateStr).getTime();
    if (isNaN(ts)) return null;
    return Math.max(0, Math.min(100, ((ts - minTs) / totalMs) * 100));
  };

  const todayPct = toPct(today.toISOString().split('T')[0]);

  const fmtShort = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  // Gera ticks mensais dentro do intervalo
  const monthTicks = [];
  const startDate = new Date(minTs);
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  // Avança para o próximo primeiro dia do mês dentro do intervalo
  if (cur.getTime() < minTs) cur.setMonth(cur.getMonth() + 1);
  while (cur.getTime() <= maxTs && monthTicks.length < 24) {
    const ts = cur.getTime();
    monthTicks.push({
      ts,
      pct: ((ts - minTs) / totalMs) * 100,
      label: cur.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  // % de progresso estimado por status
  const progressByStatus = (s) => {
    const u = (s || '').toUpperCase();
    if (['CONCLUIDO', 'FINALIZADO'].includes(u)) return 100;
    if (u === 'EM_ANDAMENTO') return 50;
    if (u === 'CANCELADA' || u === 'CANCELADO') return 0;
    return 0; // PENDENTE
  };

  return (
    <div className="prj-gantt">
      <div className="prj-gantt-legend">
        <span><span className="prj-gantt-sw" style={{ background: STATUS_COLORS.PENDENTE }} /> Pendente</span>
        <span><span className="prj-gantt-sw" style={{ background: STATUS_COLORS.EM_ANDAMENTO }} /> Em andamento</span>
        <span><span className="prj-gantt-sw" style={{ background: STATUS_COLORS.CONCLUIDO }} /> Concluído</span>
        <span><span className="prj-gantt-sw" style={{ background: '#f59e0b' }} /> ◆ Marco</span>
        {todayPct !== null && (
          <span><span className="prj-gantt-sw" style={{ background: 'var(--accent)', width: 2 }} /> Hoje</span>
        )}
      </div>

      <div className="prj-timeline" style={{ position: 'relative' }}>
        {/* Axis header com ticks mensais */}
        <div className="prj-tl-axis">
          <div className="prj-tl-label-col" />
          <div className="prj-tl-bar-col" style={{ position: 'relative' }}>
            {monthTicks.map((t, i) => (
              <span key={i} style={{
                position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0,
                borderLeft: '1px dashed var(--border-subtle)', paddingLeft: 3,
                fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'nowrap',
              }}>{t.label}</span>
            ))}
            {monthTicks.length === 0 && (
              <>
                <span className="prj-tl-axis-start">{fmtShort(new Date(minTs).toISOString())}</span>
                <span className="prj-tl-axis-end">{fmtShort(new Date(maxTs).toISOString())}</span>
              </>
            )}
            {todayPct !== null && todayPct >= 0 && todayPct <= 100 && (
              <div className="prj-tl-today-line" style={{ left: `${todayPct}%` }}>
                <span className="prj-tl-today-label">Hoje</span>
              </div>
            )}
          </div>
        </div>

        {/* Linha do projeto (faixa total) */}
        {projeto.dt_inicio && projeto.dt_prev_termino && (() => {
          const ps = toPct(projeto.dt_inicio);
          const pe = toPct(projeto.dt_prev_termino);
          if (ps == null || pe == null) return null;
          return (
            <div className="prj-tl-row" style={{ background: 'var(--bg-hover)' }}>
              <div className="prj-tl-label-col" title="Projeto">
                <span className="prj-tl-num" style={{ background: 'var(--accent)', color: '#fff' }}>P</span>
                <span className="prj-tl-name" style={{ fontWeight: 700 }}>Projeto</span>
              </div>
              <div className="prj-tl-bar-col">
                <div className="prj-tl-bar" style={{
                  left: `${ps}%`, width: `${Math.max(1, pe - ps)}%`,
                  background: 'var(--accent)', opacity: 0.35, height: 10,
                }} title={`${fmtShort(projeto.dt_inicio)} → ${fmtShort(projeto.dt_prev_termino)}`} />
              </div>
            </div>
          );
        })()}

        {/* Etapa rows */}
        {etapas.map((e, i) => {
          const startPct = toPct(e.dt_inicio);
          const endPct   = toPct(e.dt_fim);
          const hasDates = startPct !== null && endPct !== null;
          const width = hasDates ? Math.max(1, endPct - startPct) : 2;
          const left  = hasDates ? startPct : ((i / etapas.length) * 80);
          const color = STATUS_COLORS[e.status] || STATUS_COLORS.PENDENTE;
          const isMilestone = e.marco === 'S';
          const pct = progressByStatus(e.status);

          return (
            <div key={e.id} className="prj-tl-row">
              <div className="prj-tl-label-col" title={e.titulo}>
                <span className="prj-tl-num">{i + 1}</span>
                <span className="prj-tl-name">
                  {isMilestone && <span style={{ color: '#f59e0b', marginRight: 3 }}>◆</span>}
                  {e.titulo}
                </span>
              </div>
              <div className="prj-tl-bar-col">
                {/* Gridlines mensais */}
                {monthTicks.map((t, idx) => (
                  <span key={idx} style={{
                    position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0,
                    borderLeft: '1px dashed var(--border-subtle)', pointerEvents: 'none',
                  }} />
                ))}
                {isMilestone ? (
                  <div
                    className="prj-tl-milestone"
                    style={{ left: `${endPct ?? left}%`, color: '#f59e0b' }}
                    title={`Marco: ${e.titulo}${e.dt_fim ? ' · ' + fmtShort(e.dt_fim) : ''}`}
                  >◆</div>
                ) : (
                  <div
                    className="prj-tl-bar"
                    style={{
                      left: `${left}%`, width: `${width}%`,
                      background: color, opacity: hasDates ? 1 : 0.4,
                      overflow: 'hidden',
                    }}
                    title={`${e.titulo} · ${pct}%${e.dt_inicio ? ' · ' + fmtShort(e.dt_inicio) : ''}${e.dt_fim ? ' → ' + fmtShort(e.dt_fim) : ''}`}
                  >
                    {/* Progress fill */}
                    {pct > 0 && (
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${pct}%`,
                        background: 'rgba(255,255,255,0.25)',
                      }} />
                    )}
                    {width > 10 && (
                      <span style={{
                        position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
                        color: '#fff', fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap',
                        textShadow: '0 1px 2px rgba(0,0,0,0.4)', pointerEvents: 'none',
                      }}>{pct}%</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProjetoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [projeto, setProjeto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('anotacoes');
  const [modalEtapa, setModalEtapa] = useState(false);
  const [modalAnot, setModalAnot] = useState(false);
  const [modalGasto, setModalGasto] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [modalPrazos, setModalPrazos] = useState(false);
  const [prazosForm, setPrazosForm] = useState({ dt_inicio: '', dt_prev_termino: '', propagar_etapas: true, propagar_tarefas: false });
  const [savingPrazos, setSavingPrazos] = useState(false);
  const [etapaView, setEtapaView] = useState('lista');
  const [etapaForm, setEtapaForm] = useState({ titulo: '', descricao: '', dt_inicio: '', dt_fim: '', marco: 'N' });
  // Drag-and-drop de etapas
  const [dragEtapaId, setDragEtapaId] = useState(null);
  const [dragOverEtapaId, setDragOverEtapaId] = useState(null);
  const [reordenando, setReordenando] = useState(false);
  // Participantes
  const [modalParticipante, setModalParticipante] = useState(false);
  const [partForm, setPartForm] = useState({ usuario_id: '', papel: 'COLABORADOR' });
  const [usuariosLov, setUsuariosLov] = useState([]);
  const [anotForm, setAnotForm] = useState('');
  const [gastoForm, setGastoForm] = useState({ descricao: '', valor: '', dt_gasto: '', categoria: '', fornecedor: '', nota_fiscal: '', justificativa: '' });
  const [editForm, setEditForm] = useState({});
  const [foccoPV, setFoccoPV] = useState(null);
  const [foccoLoading, setFoccoLoading] = useState(false);
  const [modalVincularPV, setModalVincularPV] = useState(false);
  const [pvInput, setPvInput] = useState('');
  // CRM neg
  const [crmNeg, setCrmNeg] = useState(null);
  const [crmNegLoading, setCrmNegLoading] = useState(false);
  const [modalVincularNeg, setModalVincularNeg] = useState(false);
  const [negInput, setNegInput] = useState('');
  // RQ49
  const [rq49Vinculos, setRq49Vinculos] = useState([]);
  const [modalVincularRq49, setModalVincularRq49] = useState(false);
  const [rq49Input, setRq49Input] = useState('');
  // Kanban de tarefas
  const [kanbanData, setKanbanData] = useState(null);
  const [kanbanLoading, setKanbanLoading] = useState(false);
  const [tarefasView, setTarefasView] = useState('kanban'); // 'kanban' | 'lista'
  // Tarefas Fixas
  const [tarefasFixas, setTarefasFixas] = useState([]);
  const [modalTarefaFixa, setModalTarefaFixa] = useState(false);
  const [tfForm, setTfForm] = useState({ titulo: '', descricao: '', recorrencia: 'SEMANAL', dia_semana: '', dia_mes: '' });
  // Equipe Padrão
  const [equipesPadrao, setEquipesPadrao] = useState([]);
  const [modalAplicarEquipe, setModalAplicarEquipe] = useState(false);
  const [eqpSelecionada, setEqpSelecionada] = useState('');

  const fetchData = async () => {
    try {
      const { data } = await projetoService.obter(id);
      setProjeto(data);
    } catch { toast.error('Erro ao carregar projeto'); navigate('/projetos'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);

  // Carregar LOV de usuários para modal de participante
  useEffect(() => {
    lovService.usuarios({ per_page: 500 })
      .then(r => setUsuariosLov(r.data.items || r.data || []))
      .catch(() => {});
  }, []);

  // Carregar PV Focco vinculado
  useEffect(() => {
    if (!projeto?.focco_pv) { setFoccoPV(null); return; }
    setFoccoLoading(true);
    foccoService.obterPV(projeto.focco_pv)
      .then(r => setFoccoPV(r.data))
      .catch(() => setFoccoPV(null))
      .finally(() => setFoccoLoading(false));
  }, [projeto?.focco_pv]);

  // Carregar Negócio CRM vinculado
  useEffect(() => {
    if (!projeto?.crm_neg_id) { setCrmNeg(null); return; }
    setCrmNegLoading(true);
    projetoService.obterNegCrm(id)
      .then(r => setCrmNeg(r.data))
      .catch(() => setCrmNeg(null))
      .finally(() => setCrmNegLoading(false));
  }, [projeto?.crm_neg_id]);

  // Carregar RQ49 vinculadas
  useEffect(() => {
    if (!projeto) return;
    setRq49Vinculos(projeto.rq49_vinculos || []);
  }, [projeto?.rq49_vinculos]);

  // Carregar kanban de tarefas
  const fetchKanban = useCallback(async () => {
    setKanbanLoading(true);
    try {
      const { data } = await projetoService.kanban(id);
      setKanbanData(data);
    } catch { setKanbanData(null); }
    finally { setKanbanLoading(false); }
  }, [id]);

  useEffect(() => {
    if (tab === 'tarefas' || tab === 'equipe-view') fetchKanban();
  }, [tab, fetchKanban]);

  if (loading) return (
    <div className="detail-page">
      <div className="dp-skeleton-header" />
      <div className="dp-layout">
        <div className="dp-layout-left">
          <div className="dp-skeleton-card" style={{ height: 200 }} />
          <div className="dp-skeleton-card" style={{ height: 120 }} />
        </div>
        <div>
          <div className="dp-skeleton-cards">
            {[1,2,3].map(i => <div key={i} className="dp-skeleton-card" style={{ height: 36 }} />)}
          </div>
          <div className="dp-skeleton-block" style={{ height: 120, marginTop: 12 }} />
        </div>
      </div>
    </div>
  );
  if (!projeto) return null;

  const totalEtapas = (projeto.etapas || []).length;
  const etapasConcluidas = (projeto.etapas || []).filter(e => e.status === 'CONCLUIDO' || e.status === 'FINALIZADO').length;
  const gaugePercent = totalEtapas > 0 ? Math.round((etapasConcluidas / totalEtapas) * 100) : 0;
  const totalGastos = (projeto.gastos || []).reduce((sum, g) => sum + Number(g.valor || 0), 0);

  const handleAddEtapa = async () => {
    if (!etapaForm.titulo.trim()) return;
    try {
      const payload = {
        titulo: etapaForm.titulo,
        descricao: etapaForm.descricao,
        ordem: totalEtapas + 1,
        marco: etapaForm.marco || 'N',
      };
      if (etapaForm.dt_inicio) payload.dt_inicio = etapaForm.dt_inicio;
      if (etapaForm.dt_fim)    payload.dt_fim = etapaForm.dt_fim;
      await projetoService.criarEtapa(id, payload);
      toast.success('Etapa adicionada');
      setModalEtapa(false);
      setEtapaForm({ titulo: '', descricao: '', dt_inicio: '', dt_fim: '', marco: 'N' });
      fetchData();
    } catch { toast.error('Erro ao adicionar etapa'); }
  };

  // Drag-and-drop: reordena etapas localmente e envia PUT para persistir
  const handleEtapaDragStart = (etapaId) => (e) => {
    setDragEtapaId(etapaId);
    try { e.dataTransfer.effectAllowed = 'move'; } catch { /* ignore */ }
  };
  const handleEtapaDragOver = (etapaId) => (e) => {
    e.preventDefault();
    if (dragEtapaId && dragEtapaId !== etapaId) setDragOverEtapaId(etapaId);
  };
  const handleEtapaDragEnd = () => { setDragEtapaId(null); setDragOverEtapaId(null); };
  // Participantes
  const handleAddParticipante = async () => {
    if (!partForm.usuario_id) { toast.error('Selecione um usuário'); return; }
    try {
      await projetoService.addParticipante(id, {
        usuario_id: Number(partForm.usuario_id),
        papel: partForm.papel,
      });
      toast.success('Participante adicionado');
      setModalParticipante(false);
      setPartForm({ usuario_id: '', papel: 'COLABORADOR' });
      fetchData();
    } catch {
      toast.error('Erro ao adicionar participante');
    }
  };
  const handleUpdateParticipante = async (partId, novoPapel) => {
    try {
      await projetoService.atualizarParticipante(partId, { papel: novoPapel });
      setProjeto(p => ({
        ...p,
        participantes: (p.participantes || []).map(x =>
          x.id === partId ? { ...x, papel: novoPapel } : x
        ),
      }));
    } catch { toast.error('Erro ao atualizar papel'); fetchData(); }
  };
  const handleRemoveParticipante = async (partId) => {
    if (!window.confirm('Remover este participante?')) return;
    try {
      await projetoService.removerParticipante(partId);
      toast.success('Participante removido');
      setProjeto(p => ({ ...p, participantes: (p.participantes || []).filter(x => x.id !== partId) }));
    } catch { toast.error('Erro ao remover participante'); }
  };

  const handleEtapaDrop = (targetId) => async (e) => {
    e.preventDefault();
    const sourceId = dragEtapaId;
    setDragEtapaId(null); setDragOverEtapaId(null);
    if (!sourceId || sourceId === targetId) return;
    const lista = [...(projeto.etapas || [])];
    const srcIdx = lista.findIndex(x => x.id === sourceId);
    const tgtIdx = lista.findIndex(x => x.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const [moved] = lista.splice(srcIdx, 1);
    lista.splice(tgtIdx, 0, moved);
    // Otimista: atualiza UI
    setProjeto(p => ({ ...p, etapas: lista.map((e, i) => ({ ...e, ordem: i + 1 })) }));
    setReordenando(true);
    try {
      await projetoService.reordenarEtapas(id, lista.map(x => x.id));
      toast.success('Ordem das etapas atualizada');
    } catch {
      toast.error('Erro ao reordenar etapas');
      fetchData();
    } finally {
      setReordenando(false);
    }
  };

  const handleAddAnot = async () => {
    if (!anotForm.trim()) return;
    try {
      await projetoService.criarAnotacao(id, { descricao: anotForm });
      toast.success('Anotação adicionada');
      setModalAnot(false); setAnotForm(''); fetchData();
    } catch { toast.error('Erro ao adicionar anotação'); }
  };

  const handleAddGasto = async () => {
    if (!gastoForm.descricao.trim()) return;
    try {
      await projetoService.criarGasto(id, { ...gastoForm, valor: gastoForm.valor ? Number(gastoForm.valor) : null });
      toast.success('Gasto registrado');
      setModalGasto(false);
      setGastoForm({ descricao: '', valor: '', dt_gasto: '', categoria: '', fornecedor: '', nota_fiscal: '', justificativa: '' });
      fetchData();
    } catch { toast.error('Erro ao registrar gasto'); }
  };

  const handleEditProjeto = async () => {
    try {
      await projetoService.atualizar(id, editForm);
      toast.success('Projeto atualizado');
      setModalEditar(false); fetchData();
    } catch { toast.error('Erro ao atualizar projeto'); }
  };

  const handleVincularPV = async () => {
    if (!pvInput.trim()) return;
    try {
      await foccoService.vincularPV(id, pvInput.trim());
      toast.success('PV vinculado ao projeto');
      setModalVincularPV(false);
      setPvInput('');
      fetchData();
    } catch { toast.error('Erro ao vincular PV'); }
  };

  const handleDesvincularPV = async () => {
    try {
      await foccoService.desvincularPV(id);
      toast.success('PV desvinculado');
      setFoccoPV(null);
      fetchData();
    } catch { toast.error('Erro ao desvincular PV'); }
  };

  const handleVincularNeg = async () => {
    if (!negInput.trim()) return;
    const negId = parseInt(negInput.trim(), 10);
    if (isNaN(negId) || negId <= 0) { toast.error('Informe um ID de Negócio válido'); return; }
    try {
      await projetoService.vincularNeg(id, negId);
      toast.success('Negócio CRM vinculado ao projeto');
      setModalVincularNeg(false);
      setNegInput('');
      fetchData();
    } catch { toast.error('Erro ao vincular Negócio CRM'); }
  };

  const handleDesvincularNeg = async () => {
    try {
      await projetoService.desvincularNeg(id);
      toast.success('Negócio CRM desvinculado');
      setCrmNeg(null);
      fetchData();
    } catch { toast.error('Erro ao desvincular Negócio CRM'); }
  };

  const handleVincularRq49 = async () => {
    if (!rq49Input.trim()) return;
    const rq49Id = parseInt(rq49Input.trim(), 10);
    if (isNaN(rq49Id) || rq49Id <= 0) { toast.error('Informe um ID de RQ49 válido'); return; }
    try {
      await projetoService.vincularRq49(id, rq49Id);
      toast.success('RQ49 vinculada ao projeto');
      setModalVincularRq49(false);
      setRq49Input('');
      fetchData();
    } catch { toast.error('Erro ao vincular RQ49'); }
  };

  const handleDesvincularRq49 = async (rq49Id) => {
    if (!window.confirm('Remover este vínculo com a RQ49?')) return;
    try {
      await projetoService.desvincularRq49(id, rq49Id);
      toast.success('Vínculo RQ49 removido');
      setRq49Vinculos(prev => prev.filter(v => v.beg_rq49_id !== rq49Id));
    } catch { toast.error('Erro ao remover vínculo RQ49'); }
  };

  // Sync tarefas fixas com dados do projeto
  useEffect(() => {
    if (projeto) setTarefasFixas(projeto.tarefas_fixas || []);
  }, [projeto?.tarefas_fixas]);

  const handleCriarTarefaFixa = async () => {
    if (!tfForm.titulo.trim()) { toast.error('Título obrigatório'); return; }
    try {
      const { data } = await projetoService.criarTarefaFixa(id, {
        titulo: tfForm.titulo,
        descricao: tfForm.descricao || null,
        recorrencia: tfForm.recorrencia,
        dia_semana: tfForm.dia_semana ? Number(tfForm.dia_semana) : null,
        dia_mes: tfForm.dia_mes ? Number(tfForm.dia_mes) : null,
      });
      toast.success('Tarefa fixa criada');
      setModalTarefaFixa(false);
      setTfForm({ titulo: '', descricao: '', recorrencia: 'SEMANAL', dia_semana: '', dia_mes: '' });
      setTarefasFixas(prev => [...prev, data]);
    } catch { toast.error('Erro ao criar tarefa fixa'); }
  };

  const handleRemoverTarefaFixa = async (tfId) => {
    if (!window.confirm('Remover esta tarefa fixa?')) return;
    try {
      await projetoService.removerTarefaFixa(id, tfId);
      toast.success('Tarefa fixa removida');
      setTarefasFixas(prev => prev.filter(tf => tf.id !== tfId));
    } catch { toast.error('Erro ao remover tarefa fixa'); }
  };

  const openAplicarEquipe = async () => {
    try {
      const { data } = await projetoService.listarEquipes();
      setEquipesPadrao(data.items || []);
      setEqpSelecionada('');
      setModalAplicarEquipe(true);
    } catch { toast.error('Erro ao carregar equipes'); }
  };

  const handleAplicarEquipe = async () => {
    if (!eqpSelecionada) { toast.error('Selecione uma equipe'); return; }
    try {
      const { data } = await projetoService.aplicarEquipe(id, Number(eqpSelecionada));
      toast.success(`${data.adicionados} membro(s) adicionado(s) ao projeto`);
      setModalAplicarEquipe(false);
      fetchData();
    } catch { toast.error('Erro ao aplicar equipe'); }
  };

  // Mapeamento status Kanban → status da tarefa
  const KANBAN_STATUS_MAP = {
    PENDENTE:     'ABERTA',
    EM_ANDAMENTO: 'EM_ANDAMENTO',
    CONCLUIDO:    'CONCLUIDA',
  };

  const handleKanbanDrop = async (itemId, fromColId, toColId) => {
    const novoStatus = KANBAN_STATUS_MAP[toColId];
    if (!novoStatus) return;
    // Atualiza otimista
    setKanbanData(prev => {
      if (!prev) return prev;
      const colunas = { ...prev.colunas };
      const item = (colunas[fromColId] || []).find(t => t.id === itemId);
      if (!item) return prev;
      colunas[fromColId] = colunas[fromColId].filter(t => t.id !== itemId);
      colunas[toColId] = [...(colunas[toColId] || []), { ...item, status: toColId }];
      return { ...prev, colunas };
    });
    try {
      await tarefaService.atualizar(itemId, { status: novoStatus });
    } catch {
      toast.error('Erro ao mover tarefa');
      fetchKanban(); // reverte
    }
  };

  const openEdit = () => {
    setEditForm({
      titulo: projeto.titulo, descricao: projeto.descricao, objetivo: projeto.objetivo,
      status: projeto.status, prioridade: projeto.prioridade,
      dt_prev_termino: projeto.dt_prev_termino || '',
    });
    setModalEditar(true);
  };

  const openAlterarPrazos = () => {
    setPrazosForm({
      dt_inicio: projeto.dt_inicio ? String(projeto.dt_inicio).slice(0, 10) : '',
      dt_prev_termino: projeto.dt_prev_termino ? String(projeto.dt_prev_termino).slice(0, 10) : '',
      propagar_etapas: true,
      propagar_tarefas: false,
    });
    setModalPrazos(true);
  };

  const handleAlterarPrazos = async () => {
    if (!prazosForm.dt_prev_termino) { toast.error('Informe a nova previsão de término'); return; }
    setSavingPrazos(true);
    try {
      const { data } = await projetoService.alterarPrazos(id, {
        dt_prev_termino: prazosForm.dt_prev_termino,
        dt_inicio: prazosForm.dt_inicio || undefined,
        propagar_etapas: prazosForm.propagar_etapas,
        propagar_tarefas: prazosForm.propagar_tarefas,
      });
      const detalhes = [];
      if (data?.etapas_afetadas) detalhes.push(`${data.etapas_afetadas} etapa(s)`);
      if (data?.tarefas_afetadas) detalhes.push(`${data.tarefas_afetadas} tarefa(s)`);
      toast.success(`Prazos atualizados${detalhes.length ? ' — ' + detalhes.join(', ') + ' reescalonada(s)' : ''}`);
      setModalPrazos(false);
      fetchData();
    } catch {
      toast.error('Erro ao alterar prazos');
    } finally {
      setSavingPrazos(false);
    }
  };

  return (
    <div className="detail-page">
      {/* Header */}
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[{ label: 'Projetos', to: '/projetos' }, { label: projeto.codigo || `PRJ-${projeto.id}` }]} />
          <div className="dp-code" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {projeto.codigo || `PRJ-${projeto.id}`}{projeto.categoria ? ` · ${projeto.categoria}` : ''}
            <CopyButton value={projeto.codigo || `PRJ-${projeto.id}`} label="Copiar código" size={12} />
          </div>
          <h1>{projeto.titulo}</h1>
        </div>
        <div className="dp-header-actions">
          <button className="btn-secondary" onClick={openAlterarPrazos} title="Alterar prazos com propagação">Prazos</button>
          <button className="btn-secondary" onClick={async () => {
            if (!window.confirm('Criar uma cópia deste projeto? Etapas serão copiadas; anotações e gastos NÃO.')) return;
            try {
              const { data } = await projetoService.copiar(id);
              toast.success(`Cópia criada: ${data.titulo}`);
              navigate(`/projetos/${data.id}`);
            } catch { toast.error('Erro ao copiar projeto'); }
          }} title="Duplicar estrutura do projeto">Copiar Projeto</button>
          <button className="btn-secondary" onClick={openEdit}>Editar</button>
          <button className="btn-secondary" onClick={() => navigate('/projetos')}>Voltar</button>
        </div>
      </div>

      {/* Layout 2 colunas */}
      <div className="dp-layout">
        {/* LEFT SIDEBAR */}
        <div className="dp-layout-left">
          {/* Info Card */}
          <div className="dp-info-card">
            <div className="dp-info-card-header">
              <StatusBadge status={projeto.status} />
              {projeto.prioridade && (
                <StatusBadge status={projeto.prioridade} label={PRIORIDADE_LABELS[projeto.prioridade] || projeto.prioridade} />
              )}
            </div>
            {projeto.descricao && (
              <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.4, paddingBottom: 10, marginBottom: 4, borderBottom: '1px solid var(--border-subtle)' }}>
                {String(projeto.descricao).replace(/<[^>]+>/g, '').substring(0, 150)}
                {String(projeto.descricao).length > 150 ? '...' : ''}
              </div>
            )}
            <div className="dp-info-row">
              <span className="dp-info-label">Líder</span>
              <span className="dp-info-value" style={{ fontWeight: 600 }}>{projeto.responsavel_nome || '—'}</span>
            </div>
            <div className="dp-info-row">
              <span className="dp-info-label">Início</span>
              <span className="dp-info-value">{projeto.dt_inicio ? new Date(projeto.dt_inicio).toLocaleDateString('pt-BR') : '—'}</span>
            </div>
            <div className="dp-info-row">
              <span className="dp-info-label">Previsão</span>
              <span className="dp-info-value">{projeto.dt_prev_termino ? new Date(projeto.dt_prev_termino).toLocaleDateString('pt-BR') : '—'}</span>
            </div>
            <div className="dp-info-row">
              <span className="dp-info-label">Entrega</span>
              <span className="dp-info-value">{projeto.dt_entrega ? new Date(projeto.dt_entrega).toLocaleDateString('pt-BR') : '—'}</span>
            </div>
            {projeto.vlr_orc && (
              <div className="dp-info-row">
                <span className="dp-info-label">Orçamento</span>
                <span className="dp-info-value">R$ {Number(projeto.vlr_orc).toLocaleString('pt-BR')}</span>
              </div>
            )}
            {projeto.objetivo && (
              <div className="dp-info-row" style={{ flexDirection: 'column', gap: 4 }}>
                <span className="dp-info-label">Objetivo</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{projeto.objetivo}</span>
              </div>
            )}
          </div>

          {/* Equipe Card */}
          <div className="dp-info-card">
            <div className="dp-info-card-header">
              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Equipe ({(projeto.participantes || []).length})</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn-secondary" style={{ padding: '3px 8px', fontSize: '0.68rem' }}
                  onClick={openAplicarEquipe} title="Aplicar equipe padrão">Equipe Padrão</button>
                <button className="btn-primary" style={{ padding: '3px 10px', fontSize: '0.72rem' }}
                  onClick={() => setModalParticipante(true)}>+ Adicionar</button>
              </div>
            </div>
            {(projeto.participantes || []).length === 0
              ? <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Nenhum participante</div>
              : (projeto.participantes || []).map(p => (
                <div key={p.id} className="dp-member-row" title={p.papel || 'COLABORADOR'}>
                  <UserAvatar name={p.usuario_nome} size={26} />
                  <span style={{ flex: 1 }}>{p.usuario_nome || `User #${p.usuario_id}`}</span>
                  <PapelBadge papel={p.papel} />
                </div>
              ))
            }
          </div>

          {/* Progresso Gauge */}
          <div className="dp-info-card" style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>Progresso</div>
            <ResponsiveContainer width="100%" height={110}>
              <PieChart>
                <Pie data={[{ value: gaugePercent }, { value: 100 - gaugePercent }]}
                  dataKey="value" startAngle={180} endAngle={0}
                  cx="50%" cy="90%" innerRadius={36} outerRadius={50}>
                  <Cell fill="var(--accent)" />
                  <Cell fill="var(--border-primary)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)', marginTop: -16 }}>{gaugePercent}%</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{etapasConcluidas}/{totalEtapas} etapas</div>
          </div>

          {/* Negócio CRM — vínculo read-only */}
          <div className="dp-info-card">
            <div className="dp-info-card-header">
              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Negócio CRM</span>
              {projeto.crm_neg_id ? (
                <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.72rem' }}
                  onClick={handleDesvincularNeg}>Desvincular</button>
              ) : (
                <button className="btn-primary" style={{ padding: '3px 10px', fontSize: '0.72rem' }}
                  onClick={() => setModalVincularNeg(true)}>Vincular</button>
              )}
            </div>
            {crmNegLoading ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Carregando...</div>
            ) : crmNeg && crmNeg.crm_neg_id !== null ? (
              <div style={{ fontSize: '0.82rem' }}>
                {crmNeg.cod_neg && (
                  <div className="dp-info-row">
                    <span className="dp-info-label">Cód.</span>
                    <span className="dp-info-value" style={{ fontWeight: 600 }}>{crmNeg.cod_neg}</span>
                  </div>
                )}
                <div className="dp-info-row">
                  <span className="dp-info-label">Negócio</span>
                  <span className="dp-info-value">{crmNeg.titulo || `#${projeto.crm_neg_id}`}</span>
                </div>
                {crmNeg.status && (
                  <div className="dp-info-row">
                    <span className="dp-info-label">Status</span>
                    <span className="dp-info-value">{crmNeg.status}</span>
                  </div>
                )}
                {crmNeg.vlr_total > 0 && (
                  <div className="dp-info-row">
                    <span className="dp-info-label">Valor</span>
                    <span className="dp-info-value" style={{ fontWeight: 600 }}>
                      {Number(crmNeg.vlr_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                )}
                <div style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Somente leitura — edite no módulo CRM
                </div>
              </div>
            ) : projeto.crm_neg_id ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Negócio #{projeto.crm_neg_id} — dados não disponíveis
              </div>
            ) : (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Nenhum negócio CRM vinculado</div>
            )}
          </div>

          {/* RQ49 — Oportunidades vinculadas */}
          <div className="dp-info-card">
            <div className="dp-info-card-header">
              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>RQ49 — Oportunidades ({rq49Vinculos.length})</span>
              <button className="btn-primary" style={{ padding: '3px 10px', fontSize: '0.72rem' }}
                onClick={() => setModalVincularRq49(true)}>Vincular</button>
            </div>
            {rq49Vinculos.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Nenhuma oportunidade vinculada</div>
            ) : rq49Vinculos.map(v => (
              <div key={v.vinculo_id || v.beg_rq49_id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                padding: '6px 0', borderBottom: '1px solid var(--border-subtle)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                    {v.codigo ? `${v.codigo} — ` : `#${v.beg_rq49_id} — `}
                    {v.titulo || 'Sem título'}
                  </div>
                  {v.status && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>{v.status}</div>
                  )}
                </div>
                <button
                  className="btn-secondary"
                  style={{ padding: '2px 8px', fontSize: '0.7rem', marginLeft: 6, flexShrink: 0 }}
                  onClick={() => handleDesvincularRq49(v.beg_rq49_id)}
                  title="Remover vínculo"
                >✕</button>
              </div>
            ))}
          </div>

          {/* Tarefas Fixas */}
          <div className="dp-info-card">
            <div className="dp-info-card-header">
              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Tarefas Fixas ({tarefasFixas.length})</span>
              <button className="btn-primary" style={{ padding: '3px 10px', fontSize: '0.72rem' }}
                onClick={() => setModalTarefaFixa(true)}>+ Adicionar</button>
            </div>
            {tarefasFixas.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Nenhuma tarefa fixa</div>
            ) : tarefasFixas.map(tf => (
              <div key={tf.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                padding: '5px 0', borderBottom: '1px solid var(--border-subtle)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={tf.titulo}>{tf.titulo}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>
                    {tf.recorrencia === 'DIARIA' ? 'Diária' :
                     tf.recorrencia === 'SEMANAL' ? 'Semanal' : 'Mensal'}
                    {tf.responsavel_nome ? ` · ${tf.responsavel_nome}` : ''}
                  </div>
                </div>
                <button className="btn-secondary"
                  style={{ padding: '2px 7px', fontSize: '0.7rem', marginLeft: 6, flexShrink: 0 }}
                  onClick={() => handleRemoverTarefaFixa(tf.id)}
                  title="Remover">✕</button>
              </div>
            ))}
          </div>

          {/* Focco ERP — PV Vinculado */}
          <div className="dp-info-card">
            <div className="dp-info-card-header">
              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Focco ERP — PV</span>
              {projeto.focco_pv ? (
                <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.72rem' }}
                  onClick={handleDesvincularPV}>Desvincular</button>
              ) : (
                <button className="btn-primary" style={{ padding: '3px 10px', fontSize: '0.72rem' }}
                  onClick={() => setModalVincularPV(true)}>Vincular PV</button>
              )}
            </div>
            {foccoLoading ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Carregando PV...</div>
            ) : foccoPV ? (
              <div style={{ fontSize: '0.82rem' }}>
                <div className="dp-info-row">
                  <span className="dp-info-label">Nº PV</span>
                  <span className="dp-info-value" style={{ fontWeight: 600 }}>{foccoPV.numero_pv}</span>
                </div>
                <div className="dp-info-row">
                  <span className="dp-info-label">Cliente</span>
                  <span className="dp-info-value">{foccoPV.cliente_razao || '—'}</span>
                </div>
                <div className="dp-info-row">
                  <span className="dp-info-label">Valor</span>
                  <span className="dp-info-value" style={{ fontWeight: 600 }}>
                    {foccoPV.vlr_total != null
                      ? Number(foccoPV.vlr_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '—'}
                  </span>
                </div>
                <div className="dp-info-row">
                  <span className="dp-info-label">Status</span>
                  <StatusBadge status={foccoPV.status_focco || 'ABERTO'} />
                </div>
                <div className="dp-info-row">
                  <span className="dp-info-label">Entrega</span>
                  <span className="dp-info-value">
                    {foccoPV.dt_entrega ? new Date(foccoPV.dt_entrega).toLocaleDateString('pt-BR') : '—'}
                  </span>
                </div>
                {foccoPV.itens && foccoPV.itens.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {foccoPV.itens.length} ite{foccoPV.itens.length === 1 ? 'm' : 'ns'} no pedido
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {projeto.focco_pv
                  ? `PV ${projeto.focco_pv} não encontrado no cache`
                  : 'Nenhum PV vinculado'}
              </div>
            )}
          </div>
        </div>

        {/* MAIN CONTENT — Tabs */}
        <div>
          <div className="detail-tabs">
            {[
              { key: 'anotacoes',  label: `Anotações (${(projeto.anotacoes || []).length})` },
              { key: 'etapas',     label: `Etapas (${totalEtapas})` },
              { key: 'tarefas',    label: 'Tarefas' },
              { key: 'equipe-view', label: 'Visão da Equipe' },
              { key: 'participantes', label: `Participantes (${(projeto.participantes || []).length})` },
              { key: 'custos',     label: `Gastos Extras (${(projeto.gastos || []).length})` },
              { key: 'estatisticas', label: 'Estatísticas' },
              { key: 'historico',  label: 'Histórico' },
            ].map(t => (
              <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>

          {/* Anotações */}
          {tab === 'anotacoes' && (
            <div>
              <button className="btn-primary" style={{ marginBottom: 12 }} onClick={() => setModalAnot(true)}>+ Nova Anotação</button>
              {(projeto.anotacoes || []).length === 0
                ? <div className="empty-state">Nenhuma anotação</div>
                : (projeto.anotacoes || []).map(a => (
                  <div key={a.id} className="dp-timeline-item" style={{ marginBottom: 8 }}>
                    <div className="dp-timeline-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <UserAvatar name={a.autor} size={22} />
                        <span className="dp-timeline-author">{a.autor || '—'}</span>
                      </div>
                      <span className="dp-timeline-date"><RelativeTime value={a.created_at} /></span>
                    </div>
                    <div className="dp-timeline-body">{a.descricao}</div>
                  </div>
                ))
              }
            </div>
          )}

          {/* Etapas */}
          {tab === 'etapas' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <button className="btn-primary" onClick={() => setModalEtapa(true)}>+ Nova Etapa</button>
                {reordenando && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Salvando ordem...</span>}
                <div className="reu-view-toggle" style={{ marginLeft: 'auto' }}>
                  <button className={etapaView === 'lista' ? 'active' : ''} onClick={() => setEtapaView('lista')} title="Lista">Lista</button>
                  <button className={etapaView === 'timeline' ? 'active' : ''} onClick={() => setEtapaView('timeline')} title="Timeline">Timeline</button>
                </div>
              </div>
              {etapaView === 'lista' && (projeto.etapas || []).length > 1 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                  Arraste as etapas pelo ícone <span style={{ color: 'var(--text-secondary)' }}>⋮⋮</span> para reordenar.
                </div>
              )}
              {(projeto.etapas || []).length === 0
                ? <div className="empty-state">Nenhuma etapa cadastrada</div>
                : etapaView === 'timeline'
                ? <EtapaTimeline etapas={projeto.etapas} projeto={projeto} />
                : (projeto.etapas || []).map((e, i) => (
                  <div
                    key={e.id}
                    className="dp-etapa-item"
                    draggable
                    onDragStart={handleEtapaDragStart(e.id)}
                    onDragOver={handleEtapaDragOver(e.id)}
                    onDragLeave={() => setDragOverEtapaId(null)}
                    onDrop={handleEtapaDrop(e.id)}
                    onDragEnd={handleEtapaDragEnd}
                    style={{
                      opacity: dragEtapaId === e.id ? 0.4 : 1,
                      borderTop: dragOverEtapaId === e.id ? '2px solid var(--accent)' : undefined,
                      cursor: 'grab',
                    }}
                  >
                    <div className="dp-etapa-left">
                      <span
                        title="Arraste para reordenar"
                        style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1, userSelect: 'none', marginRight: 4 }}
                      >⋮⋮</span>
                      <div className="dp-etapa-num">{i + 1}</div>
                      <div>
                        <div className="dp-etapa-title">
                          {e.marco === 'S' && <span title="Marco" style={{ color: '#f59e0b', marginRight: 4 }}>◆</span>}
                          {e.titulo}
                        </div>
                        {e.responsavel_nome && <div className="dp-etapa-meta">{e.responsavel_nome}</div>}
                        {(e.dt_inicio || e.dt_fim) && (
                          <div className="dp-etapa-meta">
                            {e.dt_inicio && new Date(e.dt_inicio).toLocaleDateString('pt-BR')}
                            {e.dt_fim && ` — ${new Date(e.dt_fim).toLocaleDateString('pt-BR')}`}
                          </div>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={e.status || 'PENDENTE'} />
                  </div>
                ))
              }
            </div>
          )}

          {/* Tarefas — Kanban e Lista */}
          {tab === 'tarefas' && (() => {
            const COLS = [
              { id: 'PENDENTE',     title: 'Pendente',     color: 'var(--text-muted)' },
              { id: 'EM_ANDAMENTO', title: 'Em Andamento', color: '#3b82f6' },
              { id: 'CONCLUIDO',    title: 'Concluído',    color: '#22c55e' },
            ];
            const columns = COLS.map(c => ({
              ...c,
              items: (kanbanData?.colunas?.[c.id] || []),
            }));
            const allTarefas = [
              ...(kanbanData?.colunas?.PENDENTE || []),
              ...(kanbanData?.colunas?.EM_ANDAMENTO || []),
              ...(kanbanData?.colunas?.CONCLUIDO || []),
            ];
            return (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {kanbanData ? `${kanbanData.total} tarefa(s)` : ''}
                  </span>
                  <div className="reu-view-toggle" style={{ marginLeft: 'auto' }}>
                    <button className={tarefasView === 'kanban' ? 'active' : ''} onClick={() => setTarefasView('kanban')}>Kanban</button>
                    <button className={tarefasView === 'lista' ? 'active' : ''} onClick={() => setTarefasView('lista')}>Lista</button>
                  </div>
                </div>
                {kanbanLoading ? (
                  <div className="empty-state">Carregando tarefas...</div>
                ) : !kanbanData || kanbanData.total === 0 ? (
                  <div className="empty-state">Nenhuma tarefa vinculada a este projeto</div>
                ) : tarefasView === 'kanban' ? (
                  <KanbanBoard
                    columns={columns}
                    onDrop={handleKanbanDrop}
                  />
                ) : (
                  <table className="data-table">
                    <thead><tr>
                      <th>Título</th><th>Status</th><th>Responsável</th><th>Prazo</th>
                    </tr></thead>
                    <tbody>
                      {allTarefas.map(t => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 600 }}>{t.titulo || `#${t.id}`}</td>
                          <td><StatusBadge status={t.status || 'ABERTA'} /></td>
                          <td>{t.responsavel_nome || '—'}</td>
                          <td>{t.dt_prazo ? new Date(t.dt_prazo).toLocaleDateString('pt-BR') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })()}

          {/* Visão da Equipe — tarefas agrupadas por membro */}
          {tab === 'equipe-view' && (() => {
            const allTarefas = kanbanData
              ? [
                  ...(kanbanData.colunas?.PENDENTE || []),
                  ...(kanbanData.colunas?.EM_ANDAMENTO || []),
                  ...(kanbanData.colunas?.CONCLUIDO || []),
                ]
              : [];

            // Agrupa por responsável
            const byUser = {};
            for (const t of allTarefas) {
              const key = t.responsavel_nome || 'Sem responsável';
              if (!byUser[key]) byUser[key] = { nome: key, total: 0, pendentes: 0, andamento: 0, concluidas: 0, tarefas: [] };
              byUser[key].total++;
              byUser[key].tarefas.push(t);
              const st = (t.status || '').toUpperCase();
              if (['CONCLUIDO', 'CONCLUIDA', 'FINALIZADO'].includes(st)) byUser[key].concluidas++;
              else if (['EM_ANDAMENTO'].includes(st)) byUser[key].andamento++;
              else byUser[key].pendentes++;
            }
            const membros = Object.values(byUser).sort((a, b) => b.total - a.total);

            return (
              <div>
                {kanbanLoading ? (
                  <div className="empty-state">Carregando...</div>
                ) : membros.length === 0 ? (
                  <div className="empty-state">Nenhuma tarefa vinculada ao projeto.</div>
                ) : (
                  membros.map(m => {
                    const pctConcluidas = m.total > 0 ? Math.round((m.concluidas / m.total) * 100) : 0;
                    return (
                      <div key={m.nome} style={{ marginBottom: 16, border: '1px solid var(--border-primary)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 14px', background: 'var(--bg-secondary)',
                          borderBottom: '1px solid var(--border-subtle)',
                        }}>
                          <UserAvatar name={m.nome} size={28} />
                          <span style={{ fontWeight: 700, flex: 1 }}>{m.nome}</span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {m.concluidas}/{m.total} · {pctConcluidas}%
                          </span>
                          <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pctConcluidas}%`,
                              background: pctConcluidas === 100 ? '#22c55e' : 'var(--accent)', transition: 'width .3s' }} />
                          </div>
                        </div>
                        <div style={{ padding: '8px 14px' }}>
                          <div style={{ display: 'flex', gap: 12, marginBottom: 6, fontSize: '0.75rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Pendentes: <strong>{m.pendentes}</strong></span>
                            <span style={{ color: '#3b82f6' }}>Em andamento: <strong>{m.andamento}</strong></span>
                            <span style={{ color: '#22c55e' }}>Concluídas: <strong>{m.concluidas}</strong></span>
                          </div>
                          {m.tarefas.map(t => {
                            const st = (t.status || '').toUpperCase();
                            const stColor = ['CONCLUIDO','CONCLUIDA','FINALIZADO'].includes(st)
                              ? '#22c55e' : st === 'EM_ANDAMENTO' ? '#3b82f6' : 'var(--text-muted)';
                            return (
                              <div key={t.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '4px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.82rem',
                              }}>
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {t.titulo || `#${t.id}`}
                                </span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                                  {t.dt_prazo && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                      {new Date(t.dt_prazo).toLocaleDateString('pt-BR')}
                                    </span>
                                  )}
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: stColor, flexShrink: 0 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()}

          {/* Participantes */}
          {tab === 'participantes' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <button className="btn-primary" onClick={() => setModalParticipante(true)}>+ Adicionar Participante</button>
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Papéis: <PapelBadge papel="RESPONSAVEL" /> &nbsp;
                  <PapelBadge papel="COLABORADOR" /> &nbsp;
                  <PapelBadge papel="APROVADOR" />
                </span>
              </div>
              {(projeto.participantes || []).length === 0
                ? <div className="empty-state">Nenhum participante</div>
                : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}></th>
                        <th>Usuário</th>
                        <th style={{ width: 180 }}>Papel</th>
                        <th style={{ width: 80 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(projeto.participantes || []).map(p => (
                        <tr key={p.id}>
                          <td><UserAvatar name={p.usuario_nome} size={28} /></td>
                          <td style={{ fontWeight: 600 }}>{p.usuario_nome || `User #${p.usuario_id}`}</td>
                          <td>
                            <select
                              className="form-control"
                              style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                              value={(p.papel || 'COLABORADOR').toUpperCase()}
                              onChange={e => handleUpdateParticipante(p.id, e.target.value)}
                            >
                              <option value="RESPONSAVEL">Responsável</option>
                              <option value="COLABORADOR">Colaborador</option>
                              <option value="APROVADOR">Aprovador</option>
                            </select>
                          </td>
                          <td>
                            <button
                              className="btn-secondary"
                              style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                              onClick={() => handleRemoveParticipante(p.id)}
                              title="Remover"
                            >Remover</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          )}

          {/* Custos Extras */}
          {tab === 'custos' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <button className="btn-primary" onClick={() => setModalGasto(true)}>+ Registrar Gasto</button>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                  Total: R$ {totalGastos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {(projeto.gastos || []).length === 0
                ? <div className="empty-state">Nenhum gasto registrado</div>
                : (
                  <table className="data-table">
                    <thead><tr>
                      <th>Fornecedor</th><th>Descrição</th><th>Categoria</th>
                      <th style={{ textAlign: 'right' }}>Valor</th>
                      <th>Data</th><th>NF</th><th>Justificativa</th>
                    </tr></thead>
                    <tbody>
                      {(projeto.gastos || []).map(g => (
                        <tr key={g.id}>
                          <td>{g.fornecedor || '—'}</td>
                          <td>{g.descricao}</td>
                          <td>
                            {g.categoria ? (
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                                background: 'var(--bg-hover)', fontSize: '0.72rem', fontWeight: 600,
                                color: 'var(--text-secondary)',
                              }}>{g.categoria}</span>
                            ) : '—'}
                          </td>
                          <td style={{ fontWeight: 600, textAlign: 'right' }}>
                            R$ {Number(g.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td>{g.dt_gasto ? new Date(g.dt_gasto).toLocaleDateString('pt-BR') : '—'}</td>
                          <td>{g.nota_fiscal || '—'}</td>
                          <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={g.justificativa || ''}>
                            {g.justificativa || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          )}

          {/* Estatísticas */}
          {tab === 'estatisticas' && (() => {
            // KPIs
            const orcado = Number(projeto.vlr_orc || 0);
            const pctOrc = orcado > 0 ? Math.min(100, Math.round((totalGastos / orcado) * 100)) : 0;
            const orcExcedido = orcado > 0 && totalGastos > orcado;
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const dtIni = projeto.dt_inicio ? new Date(projeto.dt_inicio) : null;
            const dtFim = projeto.dt_prev_termino ? new Date(projeto.dt_prev_termino) : null;
            let pctPrazo = null;
            let diasRestantes = null;
            let prazoColor = 'var(--text-muted)';
            let prazoLabel = '—';
            if (dtIni && dtFim) {
              const total = Math.max(1, (dtFim - dtIni) / 86400000);
              const passado = Math.max(0, (today - dtIni) / 86400000);
              pctPrazo = Math.min(100, Math.round((passado / total) * 100));
              diasRestantes = Math.round((dtFim - today) / 86400000);
              if (diasRestantes < 0) { prazoColor = '#ef4444'; prazoLabel = `${Math.abs(diasRestantes)} dia(s) atrasado`; }
              else if (diasRestantes <= 7) { prazoColor = '#f59e0b'; prazoLabel = `${diasRestantes} dia(s) restantes`; }
              else { prazoColor = '#22c55e'; prazoLabel = `${diasRestantes} dia(s) restantes`; }
            }
            const tarefasTotal = (projeto.tarefas || []).length;
            const tarefasConcluidas = (projeto.tarefas || []).filter(t => ['CONCLUIDA', 'FINALIZADO', 'F', 'C'].includes(String(t.status || '').toUpperCase())).length;
            const anotacoesCount = (projeto.anotacoes || []).length;

            return (
              <>
                <div className="dp-stat-grid">
                  {/* Completude (etapas) */}
                  <div className="dp-stat-card" style={{ borderLeft: `3px solid ${gaugePercent >= 100 ? '#22c55e' : 'var(--accent)'}` }}>
                    <div className="dp-stat-label">Completude (Etapas)</div>
                    <div className="dp-stat-value" style={{ color: 'var(--accent)' }}>{gaugePercent}%</div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--border-subtle)', marginTop: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${gaugePercent}%`, background: gaugePercent >= 100 ? '#22c55e' : 'var(--accent)', transition: 'width .3s' }} />
                    </div>
                    <div className="dp-stat-sub">{etapasConcluidas}/{totalEtapas} etapas</div>
                  </div>

                  {/* Orçamento consumido */}
                  <div className="dp-stat-card" style={{ borderLeft: `3px solid ${orcExcedido ? '#ef4444' : pctOrc > 80 ? '#f59e0b' : '#22c55e'}` }}>
                    <div className="dp-stat-label">Orçamento Consumido</div>
                    <div className="dp-stat-value" style={{ fontSize: '1.3rem', color: orcExcedido ? '#ef4444' : 'var(--text-primary)' }}>
                      {orcado > 0 ? `${pctOrc}%` : '—'}
                    </div>
                    {orcado > 0 && (
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--border-subtle)', marginTop: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, pctOrc)}%`, background: orcExcedido ? '#ef4444' : pctOrc > 80 ? '#f59e0b' : '#22c55e', transition: 'width .3s' }} />
                      </div>
                    )}
                    <div className="dp-stat-sub">
                      R$ {totalGastos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      {orcado > 0 && ` / R$ ${orcado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    </div>
                  </div>

                  {/* Prazo */}
                  <div className="dp-stat-card" style={{ borderLeft: `3px solid ${prazoColor}` }}>
                    <div className="dp-stat-label">Prazo</div>
                    <div className="dp-stat-value" style={{ fontSize: '1.1rem', color: prazoColor }}>{prazoLabel}</div>
                    {pctPrazo !== null && (
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--border-subtle)', marginTop: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pctPrazo}%`, background: prazoColor, transition: 'width .3s' }} />
                      </div>
                    )}
                    <div className="dp-stat-sub">
                      {dtIni ? dtIni.toLocaleDateString('pt-BR') : '—'} → {dtFim ? dtFim.toLocaleDateString('pt-BR') : '—'}
                    </div>
                  </div>

                  {/* Equipe */}
                  <div className="dp-stat-card">
                    <div className="dp-stat-label">Equipe</div>
                    <div className="dp-stat-value">{(projeto.participantes || []).length}</div>
                    <div className="dp-stat-sub">participante(s)</div>
                  </div>

                  {/* Tarefas */}
                  {tarefasTotal > 0 && (
                    <div className="dp-stat-card">
                      <div className="dp-stat-label">Tarefas</div>
                      <div className="dp-stat-value">{tarefasConcluidas}/{tarefasTotal}</div>
                      <div className="dp-stat-sub">{Math.round((tarefasConcluidas / tarefasTotal) * 100)}% concluídas</div>
                    </div>
                  )}

                  {/* Anotações */}
                  <div className="dp-stat-card">
                    <div className="dp-stat-label">Anotações</div>
                    <div className="dp-stat-value">{anotacoesCount}</div>
                    <div className="dp-stat-sub">registro(s)</div>
                  </div>
                </div>

                {/* Saúde do projeto — semáforo */}
                <div className="dp-info-card" style={{ marginTop: 16 }}>
                  <div className="dp-info-card-header">
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Saúde do Projeto</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%',
                        background: gaugePercent >= 100 ? '#22c55e' : gaugePercent >= 50 ? '#f59e0b' : '#ef4444' }} />
                      <span>Progresso das etapas</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%',
                        background: orcExcedido ? '#ef4444' : pctOrc > 80 ? '#f59e0b' : '#22c55e' }} />
                      <span>Consumo orçamentário</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: prazoColor }} />
                      <span>Prazo de entrega</span>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Histórico */}
          {tab === 'historico' && (
            <div className="empty-state">Histórico de alterações de prazo será exibido aqui</div>
          )}
        </div>
      </div>

      {/* Modal Etapa */}
      <Modal open={modalEtapa} onClose={() => setModalEtapa(false)} title="Nova Etapa" size="small"
        footer={<><button className="btn-secondary" onClick={() => setModalEtapa(false)}>Cancelar</button><button className="btn-primary" onClick={handleAddEtapa}>Adicionar</button></>}>
        <div className="form-group"><label>Título *</label><input className="form-control" value={etapaForm.titulo} onChange={e => setEtapaForm(f => ({ ...f, titulo: e.target.value }))} /></div>
        <div className="form-group"><label>Descrição</label><textarea className="form-control" value={etapaForm.descricao} onChange={e => setEtapaForm(f => ({ ...f, descricao: e.target.value }))} /></div>
        <div className="form-row">
          <div className="form-group"><label>Início</label><input type="date" className="form-control" value={etapaForm.dt_inicio} onChange={e => setEtapaForm(f => ({ ...f, dt_inicio: e.target.value }))} /></div>
          <div className="form-group"><label>Fim</label><input type="date" className="form-control" value={etapaForm.dt_fim} onChange={e => setEtapaForm(f => ({ ...f, dt_fim: e.target.value }))} /></div>
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={etapaForm.marco === 'S'}
              onChange={e => setEtapaForm(f => ({ ...f, marco: e.target.checked ? 'S' : 'N' }))} />
            <span style={{ color: '#f59e0b' }}>◆</span>
            <span>Marco (milestone) — destacado na timeline/Gantt</span>
          </label>
        </div>
      </Modal>

      {/* Modal Anotação */}
      <Modal open={modalAnot} onClose={() => setModalAnot(false)} title="Nova Anotação" size="small"
        footer={<><button className="btn-secondary" onClick={() => setModalAnot(false)}>Cancelar</button><button className="btn-primary" onClick={handleAddAnot}>Adicionar</button></>}>
        <div className="form-group"><label>Anotação</label><textarea className="form-control" rows={5} value={anotForm} onChange={e => setAnotForm(e.target.value)} /></div>
      </Modal>

      {/* Modal Gasto Extra */}
      <Modal open={modalGasto} onClose={() => setModalGasto(false)} title="Registrar Gasto Extra"
        footer={<><button className="btn-secondary" onClick={() => setModalGasto(false)}>Cancelar</button><button className="btn-primary" onClick={handleAddGasto}>Registrar</button></>}>
        <div className="form-group"><label>Descrição *</label><input className="form-control" value={gastoForm.descricao} onChange={e => setGastoForm(f => ({ ...f, descricao: e.target.value }))} /></div>
        <div className="form-row">
          <div className="form-group"><label>Valor (R$) *</label><input type="number" step="0.01" min="0" className="form-control" value={gastoForm.valor} onChange={e => setGastoForm(f => ({ ...f, valor: e.target.value }))} /></div>
          <div className="form-group"><label>Data</label><input type="date" className="form-control" value={gastoForm.dt_gasto} onChange={e => setGastoForm(f => ({ ...f, dt_gasto: e.target.value }))} /></div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Categoria</label>
            <select className="form-control" value={gastoForm.categoria}
              onChange={e => setGastoForm(f => ({ ...f, categoria: e.target.value }))}>
              <option value="">— Selecione —</option>
              <option value="MATERIAL">Material</option>
              <option value="SERVICO">Serviço</option>
              <option value="VIAGEM">Viagem</option>
              <option value="HOSPEDAGEM">Hospedagem</option>
              <option value="ALIMENTACAO">Alimentação</option>
              <option value="FERRAMENTA">Ferramenta / Equipamento</option>
              <option value="CONSULTORIA">Consultoria</option>
              <option value="TREINAMENTO">Treinamento</option>
              <option value="OUTROS">Outros</option>
            </select>
          </div>
          <div className="form-group"><label>Fornecedor</label><input className="form-control" value={gastoForm.fornecedor} onChange={e => setGastoForm(f => ({ ...f, fornecedor: e.target.value }))} /></div>
        </div>
        <div className="form-group"><label>Nota Fiscal</label><input className="form-control" value={gastoForm.nota_fiscal} onChange={e => setGastoForm(f => ({ ...f, nota_fiscal: e.target.value }))} placeholder="Número da NF" /></div>
        <div className="form-group">
          <label>Justificativa</label>
          <textarea className="form-control" rows={3}
            value={gastoForm.justificativa}
            onChange={e => setGastoForm(f => ({ ...f, justificativa: e.target.value }))}
            placeholder="Motivo do gasto, por que foi necessário?"
          />
        </div>
      </Modal>

      {/* Modal Participante */}
      <Modal open={modalParticipante} onClose={() => setModalParticipante(false)} title="Adicionar Participante" size="small"
        footer={<><button className="btn-secondary" onClick={() => setModalParticipante(false)}>Cancelar</button><button className="btn-primary" onClick={handleAddParticipante}>Adicionar</button></>}>
        <div className="form-group">
          <label>Usuário *</label>
          <select className="form-control" value={partForm.usuario_id}
            onChange={e => setPartForm(f => ({ ...f, usuario_id: e.target.value }))}>
            <option value="">— Selecione —</option>
            {usuariosLov
              .filter(u => !(projeto.participantes || []).some(p => Number(p.usuario_id) === Number(u.id)))
              .map(u => <option key={u.id} value={u.id}>{u.nome || u.login || u.descricao}</option>)
            }
          </select>
        </div>
        <div className="form-group">
          <label>Papel</label>
          <select className="form-control" value={partForm.papel}
            onChange={e => setPartForm(f => ({ ...f, papel: e.target.value }))}>
            <option value="RESPONSAVEL">Responsável</option>
            <option value="COLABORADOR">Colaborador</option>
            <option value="APROVADOR">Aprovador</option>
          </select>
          <small style={{ color: 'var(--text-muted)', marginTop: 4, display: 'block', fontSize: '0.75rem' }}>
            <strong>Responsável</strong>: conduz o trabalho &nbsp;|&nbsp;
            <strong>Colaborador</strong>: executa tarefas &nbsp;|&nbsp;
            <strong>Aprovador</strong>: valida entregas
          </small>
        </div>
      </Modal>

      {/* Modal Vincular PV Focco */}
      <Modal open={modalVincularPV} onClose={() => setModalVincularPV(false)} title="Vincular PV do Focco" size="small"
        footer={<><button className="btn-secondary" onClick={() => setModalVincularPV(false)}>Cancelar</button><button className="btn-primary" onClick={handleVincularPV}>Vincular</button></>}>
        <div className="form-group">
          <label>Número do PV</label>
          <input className="form-control" placeholder="Ex: 12345" value={pvInput} onChange={e => setPvInput(e.target.value)} />
          <small style={{ color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            Informe o número do Pedido de Venda do Focco ERP para vincular a este projeto.
          </small>
        </div>
      </Modal>

      {/* Modal Aplicar Equipe Padrão */}
      <Modal open={modalAplicarEquipe} onClose={() => setModalAplicarEquipe(false)} title="Aplicar Equipe Padrão" size="small"
        footer={<><button className="btn-secondary" onClick={() => setModalAplicarEquipe(false)}>Cancelar</button><button className="btn-primary" onClick={handleAplicarEquipe}>Aplicar</button></>}>
        {equipesPadrao.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Nenhuma equipe padrão cadastrada. Acesse <strong>Projetos → Equipes Padrão</strong> para criar.
          </div>
        ) : (
          <div className="form-group">
            <label>Selecione a Equipe</label>
            <select className="form-control" value={eqpSelecionada}
              onChange={e => setEqpSelecionada(e.target.value)}>
              <option value="">— Selecione —</option>
              {equipesPadrao.map(eq => (
                <option key={eq.id} value={eq.id}>
                  {eq.nome} ({eq.total_membros || 0} membro(s))
                </option>
              ))}
            </select>
            {eqpSelecionada && (() => {
              const eq = equipesPadrao.find(e => String(e.id) === String(eqpSelecionada));
              if (!eq || !eq.membros?.length) return null;
              return (
                <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-surface)', borderRadius: 6, fontSize: '0.78rem' }}>
                  {eq.membros.map(m => (
                    <div key={m.usuario_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>{m.usuario_nome || `#${m.usuario_id}`}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{m.papel}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            <small style={{ color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
              Membros já participantes não serão duplicados.
            </small>
          </div>
        )}
      </Modal>

      {/* Modal Tarefa Fixa */}
      <Modal open={modalTarefaFixa} onClose={() => setModalTarefaFixa(false)} title="Adicionar Tarefa Fixa" size="small"
        footer={<><button className="btn-secondary" onClick={() => setModalTarefaFixa(false)}>Cancelar</button><button className="btn-primary" onClick={handleCriarTarefaFixa}>Adicionar</button></>}>
        <div className="form-group">
          <label>Título *</label>
          <input className="form-control" value={tfForm.titulo} onChange={e => setTfForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Ex: Reunião semanal de status" />
        </div>
        <div className="form-group">
          <label>Descrição</label>
          <textarea className="form-control" rows={2} value={tfForm.descricao}
            onChange={e => setTfForm(f => ({ ...f, descricao: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Recorrência</label>
          <select className="form-control" value={tfForm.recorrencia}
            onChange={e => setTfForm(f => ({ ...f, recorrencia: e.target.value, dia_semana: '', dia_mes: '' }))}>
            <option value="DIARIA">Diária</option>
            <option value="SEMANAL">Semanal</option>
            <option value="MENSAL">Mensal</option>
          </select>
        </div>
        {tfForm.recorrencia === 'SEMANAL' && (
          <div className="form-group">
            <label>Dia da semana</label>
            <select className="form-control" value={tfForm.dia_semana}
              onChange={e => setTfForm(f => ({ ...f, dia_semana: e.target.value }))}>
              <option value="">— Qualquer —</option>
              <option value="1">Segunda-feira</option>
              <option value="2">Terça-feira</option>
              <option value="3">Quarta-feira</option>
              <option value="4">Quinta-feira</option>
              <option value="5">Sexta-feira</option>
              <option value="6">Sábado</option>
              <option value="0">Domingo</option>
            </select>
          </div>
        )}
        {tfForm.recorrencia === 'MENSAL' && (
          <div className="form-group">
            <label>Dia do mês (1-31)</label>
            <input type="number" className="form-control" min="1" max="31" value={tfForm.dia_mes}
              onChange={e => setTfForm(f => ({ ...f, dia_mes: e.target.value }))}
              placeholder="Ex: 1 (primeiro dia do mês)" />
          </div>
        )}
      </Modal>

      {/* Modal Vincular Negócio CRM */}
      <Modal open={modalVincularNeg} onClose={() => setModalVincularNeg(false)} title="Vincular Negócio CRM" size="small"
        footer={<><button className="btn-secondary" onClick={() => setModalVincularNeg(false)}>Cancelar</button><button className="btn-primary" onClick={handleVincularNeg}>Vincular</button></>}>
        <div className="form-group">
          <label>ID do Negócio CRM</label>
          <input className="form-control" type="number" min="1" placeholder="Ex: 123"
            value={negInput} onChange={e => setNegInput(e.target.value)} />
          <small style={{ color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            Informe o ID do Negócio no módulo CRM. O vínculo é somente leitura neste projeto — alterações devem ser feitas no CRM.
          </small>
        </div>
      </Modal>

      {/* Modal Vincular RQ49 */}
      <Modal open={modalVincularRq49} onClose={() => setModalVincularRq49(false)} title="Vincular RQ49 — Oportunidade" size="small"
        footer={<><button className="btn-secondary" onClick={() => setModalVincularRq49(false)}>Cancelar</button><button className="btn-primary" onClick={handleVincularRq49}>Vincular</button></>}>
        <div className="form-group">
          <label>ID da RQ49</label>
          <input className="form-control" type="number" min="1" placeholder="Ex: 42"
            value={rq49Input} onChange={e => setRq49Input(e.target.value)} />
          <small style={{ color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            Vincule uma Nota de Oportunidade (RQ49) que originou este projeto.
          </small>
        </div>
      </Modal>

      {/* Modal Alterar Prazos */}
      <Modal open={modalPrazos} onClose={() => setModalPrazos(false)} title="Alterar Prazos do Projeto" size="small"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalPrazos(false)}>Cancelar</button>
            <button className="btn-primary" disabled={savingPrazos} onClick={handleAlterarPrazos}>
              {savingPrazos ? 'Aplicando...' : 'Aplicar'}
            </button>
          </>
        }
      >
        <div className="form-row">
          <div className="form-group">
            <label>Data de Início</label>
            <input type="date" className="form-control" value={prazosForm.dt_inicio}
              onChange={e => setPrazosForm(f => ({ ...f, dt_inicio: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Nova Previsão de Término *</label>
            <input type="date" className="form-control" value={prazosForm.dt_prev_termino}
              onChange={e => setPrazosForm(f => ({ ...f, dt_prev_termino: e.target.value }))} />
          </div>
        </div>
        <div style={{ padding: 12, background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border-subtle)', marginTop: 8 }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>
            Propagação automática (reescalonamento proporcional em relação à data de início):
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', marginBottom: 4 }}>
            <input type="checkbox" checked={prazosForm.propagar_etapas}
              onChange={e => setPrazosForm(f => ({ ...f, propagar_etapas: e.target.checked }))} />
            Reescalonar <strong>etapas</strong> do projeto
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            <input type="checkbox" checked={prazosForm.propagar_tarefas}
              onChange={e => setPrazosForm(f => ({ ...f, propagar_tarefas: e.target.checked }))} />
            Reescalonar <strong>tarefas</strong> vinculadas às etapas (não concluídas)
          </label>
        </div>
      </Modal>

      {/* Modal Editar Projeto */}
      <Modal open={modalEditar} onClose={() => setModalEditar(false)} title="Editar Projeto"
        footer={<><button className="btn-secondary" onClick={() => setModalEditar(false)}>Cancelar</button><button className="btn-primary" onClick={handleEditProjeto}>Salvar</button></>}>
        <div className="form-group"><label>Título</label><input className="form-control" value={editForm.titulo || ''} onChange={e => setEditForm(f => ({ ...f, titulo: e.target.value }))} /></div>
        <div className="form-group"><label>Descrição</label><textarea className="form-control" value={editForm.descricao || ''} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} /></div>
        <div className="form-group"><label>Objetivo</label><textarea className="form-control" value={editForm.objetivo || ''} onChange={e => setEditForm(f => ({ ...f, objetivo: e.target.value }))} /></div>
        <div className="form-row">
          <div className="form-group"><label>Status</label>
            <select className="form-control" value={editForm.status || ''} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
              <option value="ABERTO">Aberto</option>
              <option value="EM_ANDAMENTO">Em andamento</option>
              <option value="PARALISADO">Paralisado</option>
              <option value="FINALIZADO">Finalizado</option>
            </select>
          </div>
          <div className="form-group"><label>Prioridade</label>
            <select className="form-control" value={editForm.prioridade || ''} onChange={e => setEditForm(f => ({ ...f, prioridade: e.target.value }))}>
              <option value="URGENTE">Urgente</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Média</option>
              <option value="BAIXA">Baixa</option>
            </select>
          </div>
        </div>
        <div className="form-group"><label>Previsão de Término</label><input type="date" className="form-control" value={editForm.dt_prev_termino || ''} onChange={e => setEditForm(f => ({ ...f, dt_prev_termino: e.target.value }))} /></div>
      </Modal>
    </div>
  );
}

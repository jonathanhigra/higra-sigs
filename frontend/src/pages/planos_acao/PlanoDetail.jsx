/**
 * Cadastro Plano de Ação — melhorias completas (rounds 1–3)
 * Status badge, countdown, user search, breadcrumb, print, duplicate,
 * aval_efic, manual %, criterio, delete guard, multi-task, near-deadline,
 * LOV cache, lazy sections, date validation, task suggestion, dt_implementacao,
 * double-submit guard + new round:
 * #6  Auto-save onBlur (titulo, dt_prazo) — debounce 2s
 * #7  Char counter on textareas (max 500)
 * #8  Inline field validation (real-time)
 * #9  Cost diff previsto vs realizado (color-coded)
 * #10 "Iniciar" button → EM_ANDAMENTO (no modal)
 * #11 Task reorder via drag-and-drop
 * #13 Task templates (predefined titles)
 * #14 Image thumbnail preview in evidências
 * #15 Drag-and-drop upload zone for evidências
 * #19 Histórico pagination (load more)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { planoService } from '../../services/planos_acao/planoService';
import { tarefaService } from '../../services/tarefas/tarefaService';
import useLovStore from '../../stores/lovStore';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import { SkeletonPlanoDetail, SkeletonVincularList } from '../../components/SkeletonPlanos';
import '../../components/Modal.css';
import { UserAvatar, EmptyState } from '../../components/ui';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import './PlanoDetail.css';

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  PENDENTE:     { label: 'Aguardando',             color: '#d97706', bg: 'rgba(245, 158, 11, 0.15)' },
  EM_ANDAMENTO: { label: 'Em andamento',            color: 'var(--accent)', bg: 'rgba(59, 130, 246, 0.12)' },
  CONCLUIDO:    { label: 'Implementado',             color: '#16a34a', bg: 'rgba(34, 197, 94, 0.12)' },
  IMPLEMENTADO: { label: 'Implementado',             color: '#16a34a', bg: 'rgba(34, 197, 94, 0.12)' },
  CANCELADO:    { label: 'Cancelado',               color: 'var(--text-muted)', bg: 'rgba(107, 114, 128, 0.12)' },
  AVALIACAO:    { label: 'Ag. Avaliação Eficácia',  color: '#9333ea', bg: 'rgba(147, 51, 234, 0.12)' },
  ABERTO:       { label: 'Aberto',                  color: 'var(--accent)', bg: 'rgba(59, 130, 246, 0.12)' },
};

function diasAoPrazo(dtPrazo) {
  if (!dtPrazo) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const prazo = new Date(dtPrazo + 'T00:00:00');
  return Math.round((prazo - hoje) / 86400000);
}

function CountdownBadge({ dtPrazo, status }) {
  if (!dtPrazo || ['CONCLUIDO', 'IMPLEMENTADO', 'CANCELADO'].includes(status)) return null;
  const dias = diasAoPrazo(dtPrazo);
  if (dias === null) return null;
  if (dias < 0)
    return <span className="plano-countdown vencida">Atrasado há {Math.abs(dias)} dia{Math.abs(dias) !== 1 ? 's' : ''}</span>;
  if (dias === 0)
    return <span className="plano-countdown hoje">Vence hoje</span>;
  if (dias <= 3)
    return <span className="plano-countdown proximo">Vence em {dias} dia{dias !== 1 ? 's' : ''}</span>;
  return <span className="plano-countdown normal">Vence em {dias} dias</span>;
}

// Searchable user select with filter (#3)
function UserSearchSelect({ value, onChange, usuarios, disabled, placeholder = 'Selecione o responsável' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = usuarios.find(u => String(u.value) === String(value || ''));

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query
    ? usuarios.filter(u => u.label.toLowerCase().includes(query.toLowerCase())).slice(0, 30)
    : usuarios.slice(0, 30);

  if (disabled) return <input className="plano-input" value={selected?.label || ''} readOnly />;

  return (
    <div className="user-search-wrap" ref={ref}>
      <input
        className="plano-input"
        value={open ? query : (selected?.label || '')}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        placeholder={placeholder}
      />
      {open && (
        <div className="user-search-dropdown">
          <div className="user-search-item" onClick={() => { onChange(''); setOpen(false); setQuery(''); }}>
            — Nenhum —
          </div>
          {filtered.map(u => (
            <div key={u.value} className={`user-search-item ${String(u.value) === String(value || '') ? 'selected' : ''}`}
              onClick={() => { onChange(String(u.value)); setOpen(false); setQuery(''); }}>
              <UserAvatar name={u.label} size={20} />
              <span>{u.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Collapsible section (#23)
function Section({ title, icon, badge, defaultOpen = true, children, action }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="plano-section">
      <div className="plano-section-header" onClick={() => setOpen(o => !o)}>
        <div className="plano-section-header-left">
          {icon && <span className="plano-section-icon">{icon}</span>}
          <h3 className="plano-section-title">{title}</h3>
          {badge !== undefined && badge !== null && (
            <span className="plano-section-badge">{badge}</span>
          )}
        </div>
        <div className="plano-section-header-right">
          {action && <div onClick={e => e.stopPropagation()}>{action}</div>}
          <span className="plano-section-chevron">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && <div className="plano-section-body">{children}</div>}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PlanoDetail() {
  const { id } = useParams();
  const isNew = !id || id === 'novo';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const sourceParam = (searchParams.get('source') || '').toUpperCase() || null;

  // State
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [operating, setOperating] = useState(false); // #29 double-submit guard
  const [plano, setPlano] = useState(null);
  const [planoSource, setPlanoSource] = useState(sourceParam || (isNew ? 'GAC' : null));
  const activeSource = planoSource || sourceParam || (isNew ? 'GAC' : null);

  const [form, setForm] = useState({
    titulo: '', descricao: '', dt_prazo: '', origem_tipo: '', responsavel_id: '',
    status: 'PENDENTE', metodo: '', local: '', custo: '', tempo_execucao: '',
    dt_reagendamento: '', justificativa_reagendamento: '', percentual: 0,
  });

  // Features
  const [tarefas, setTarefas] = useState([]);
  const [equipe, setEquipe] = useState([]);
  const [evidencias, setEvidencias] = useState([]);
  const [historico, setHistorico] = useState([]);

  // Modal state
  const [modalImpl, setModalImpl] = useState(false);
  const [modalCancel, setModalCancel] = useState(false);
  const [modalTarefa, setModalTarefa] = useState(false);
  const [modalVincular, setModalVincular] = useState(false);
  const [modalMembro, setModalMembro] = useState(false);
  const [modalEvid, setModalEvid] = useState(false);

  const [implForm, setImplForm] = useState({ avaliacao: '', custo_realizado: '', criterio: '', aval_efic: '' });
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [tarefaForm, setTarefaForm] = useState({ titulo: '', descricao: '', dt_previsao: '' });
  const [vincularSearch, setVincularSearch] = useState('');
  const [vincularDisponiveis, setVincularDisponiveis] = useState([]);
  const [vincularSelecionados, setVincularSelecionados] = useState([]);
  const [vincularLoading, setVincularLoading] = useState(false);
  const [membroId, setMembroId] = useState('');
  const [evidForm, setEvidForm] = useState('');
  const [evidFile, setEvidFile] = useState(null);
  const [evidDragging, setEvidDragging] = useState(false); // #15 drag-drop zone

  // #8 Inline validation
  const [errors, setErrors] = useState({});

  // #11 Task drag-reorder
  const [tarefaDragId, setTarefaDragId] = useState(null);
  const [tarefaDragOver, setTarefaDragOver] = useState(null);

  // #19 Historico pagination
  const [histPage, setHistPage] = useState(1);
  const [histTotal, setHistTotal] = useState(0);
  const HIST_PER_PAGE = 20;

  // #7 Char counter helpers
  const MAX_CHARS = 500;

  // #6 Auto-save debounce ref
  const autoSaveTimer = useRef(null);

  // LOV cache (#22)
  const { getUsuarios, getFiliais } = useLovStore();
  const [usuarios, setUsuarios] = useState([]);

  const supportsTarefas = activeSource === 'GAC';
  const supportsEquipeEvidencias = activeSource === 'RQ80';

  useEffect(() => {
    getUsuarios().then(setUsuarios);
  }, []);

  useEffect(() => { if (!isNew) fetchData(); }, [id, sourceParam]);
  useEffect(() => { if (!isNew && id && activeSource) fetchFeatures(); }, [id, activeSource]);

  const fetchHistorico = useCallback(async (page = 1) => {
    try {
      const { data } = await planoService.listarHistorico(id, { page, per_page: HIST_PER_PAGE });
      if (page === 1) setHistorico(data.items || []);
      else setHistorico(prev => [...prev, ...(data.items || [])]);
      setHistTotal(data.total || 0);
      setHistPage(page);
    } catch { /* silent */ }
  }, [id]);

  const fetchData = async () => {
    try {
      const [{ data }, histRes] = await Promise.all([
        planoService.obter(id, { source: sourceParam || undefined }),
        planoService.listarHistorico(id, { page: 1, per_page: HIST_PER_PAGE }).catch(() => ({ data: { items: [], total: 0 } })),
      ]);
      setHistorico(histRes.data.items || []);
      setHistTotal(histRes.data.total || 0);
      setHistPage(1);
      const resolvedSource = data._source || sourceParam || 'GAC';
      setPlano(data);
      setPlanoSource(resolvedSource);
      setImplForm({
        avaliacao: data.aval_implementacao || '',
        custo_realizado: data.custo_realizado || '',
        criterio: data.criterio_aceitacao || '',
        aval_efic: data.aval_efic || '',
      });
      setCancelMotivo(data.motivo_cancelamento || '');
      setForm({
        titulo: data.titulo || '',
        descricao: data.descricao || data.motivo || '',
        metodo: data.metodo || '',
        local: data.local || '',
        custo: data.custo || '',
        tempo_execucao: data.tempo_execucao || '',
        dt_prazo: data.dt_prazo || '',
        dt_reagendamento: data.dt_reagendamento ? String(data.dt_reagendamento).substring(0, 10) : '',
        justificativa_reagendamento: data.justificativa_reagendamento || '',
        origem_tipo: data.origem_tipo || (data.sigla_codigo ? `${data.sigla_codigo} - ${data.sigla_descricao || ''}` : ''),
        responsavel_id: data.responsavel_id || '',
        status: data.status || 'PENDENTE',
        filial_nome: data.filial_nome || '',
        sequencia: data.sequencia || '',
        num_mestre: data.num_mestre || data.id || '',
        percentual: data.percentual || 0,
      });
      if (resolvedSource !== sourceParam) {
        navigate(`/planos-acao/${id}?source=${resolvedSource}`, { replace: true });
      }
    } catch { toast.error('Erro ao carregar'); navigate('/planos-acao'); }
    finally { setLoading(false); }
  };

  const fetchFeatures = async () => {
    try {
      if (activeSource === 'RQ80') {
        const [e, ev] = await Promise.all([
          planoService.listarEquipe(id, { source: activeSource }),
          planoService.listarEvidencias(id, { source: activeSource }),
        ]);
        setTarefas([]); setEquipe(e.data.items || []); setEvidencias(ev.data.items || []);
        return;
      }
      const { data } = await planoService.listarTarefas(id, { source: activeSource });
      const items = data.items || [];
      setTarefas(items); setEquipe([]); setEvidencias([]);
      // #27 — sugerir AVALIACAO quando todas as tarefas concluídas
      if (items.length > 0 && items.every(t => t.status === 'CONCLUIDA' || t.status === 'ENTREGUE')) {
        if (plano && !['CONCLUIDO', 'IMPLEMENTADO', 'CANCELADO', 'AVALIACAO'].includes(plano.status)) {
          toast.warn?.('Todas as tarefas concluídas — considere marcar como "Avaliação de Eficácia".');
        }
      }
    } catch (err) {
      /* recursos opcionais — falha silenciosa */
    }
  };

  const responsavelSelecionado = usuarios.find(u => String(u.value) === String(form.responsavel_id || ''));
  const responsavelNome = responsavelSelecionado?.label || plano?.responsavel_nome || '';

  const buildPlanoPayload = (f) => Object.fromEntries(
    Object.entries({
      titulo: f.titulo, descricao: f.descricao, metodo: f.metodo, local: f.local,
      custo: f.custo || undefined, tempo_execucao: f.tempo_execucao || undefined,
      dt_prazo: f.dt_prazo || undefined, dt_reagendamento: f.dt_reagendamento || undefined,
      justificativa_reagendamento: f.justificativa_reagendamento || undefined,
      origem_tipo: isNew ? f.origem_tipo || undefined : undefined,
      responsavel_id: f.responsavel_id || undefined,
      status: f.status || undefined,
      percentual: activeSource === 'RQ80' ? (Number(f.percentual) || 0) : undefined,
    }).filter(([, v]) => v !== undefined)
  );

  // #26 — warn if dt_prazo in the past
  const warnPastDate = (dtPrazo) => {
    if (!dtPrazo) return;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    if (new Date(dtPrazo + 'T00:00:00') < hoje) {
      toast.warn?.('Atenção: o prazo selecionado já está no passado.');
    }
  };

  // #8 validate fields
  const validate = (f) => {
    const errs = {};
    if (!f.titulo?.trim()) errs.titulo = 'Campo obrigatório';
    if (f.titulo && f.titulo.length > MAX_CHARS) errs.titulo = `Máximo ${MAX_CHARS} caracteres`;
    if (f.descricao && f.descricao.length > MAX_CHARS) errs.descricao = `Máximo ${MAX_CHARS} caracteres`;
    return errs;
  };

  // #6 auto-save on blur
  const scheduleAutoSave = (field, value) => {
    if (isNew || isFechado) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await planoService.atualizar(id, { [field]: value }, { source: activeSource });
      } catch { /* silent — user can still manually save */ }
    }, 2000);
  };

  // #10 Iniciar plano → EM_ANDAMENTO
  const handleIniciar = async () => {
    if (operating) return;
    setOperating(true);
    try {
      await planoService.atualizar(id, { status: 'EM_ANDAMENTO' }, { source: activeSource });
      toast.success('Plano iniciado');
      fetchData();
    } catch { toast.error('Erro ao iniciar'); }
    finally { setOperating(false); }
  };

  const handleSave = async () => {
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) { toast.error('Corrija os erros antes de salvar'); return; }
    if (!form.titulo.trim()) { toast.error('Campo "O quê?" é obrigatório'); return; }
    if (saving || operating) return; // #29
    setSaving(true);
    try {
      const payload = buildPlanoPayload(form);
      if (isNew) {
        const { data } = await planoService.criar(payload);
        toast.success('Plano criado');
        navigate(`/planos-acao/${data.id}?source=GAC`);
      } else {
        await planoService.atualizar(id, payload, { source: activeSource });
        toast.success('Salvo');
        fetchData();
      }
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleImplementar = async () => {
    if (!implForm.avaliacao.trim()) { toast.error('Informe a avaliação da implementação'); return; }
    if (!implForm.criterio.trim()) { toast.error('Informe o critério de aceitação (#14)'); return; }
    if (operating) return;
    setOperating(true);
    try {
      await planoService.atualizar(id, {
        status: 'CONCLUIDO',
        custo_realizado: implForm.custo_realizado || undefined,
        aval_implementacao: implForm.avaliacao,
        criterio_aceitacao: implForm.criterio,
        aval_efic: implForm.aval_efic || undefined,
      }, { source: activeSource });
      toast.success('Ação implementada');
      setModalImpl(false);
      fetchData();
    } catch { toast.error('Erro'); }
    finally { setOperating(false); }
  };

  const handleCancelar = async () => {
    if (!cancelMotivo.trim()) { toast.error('Informe o motivo do cancelamento'); return; }
    if (operating) return;
    setOperating(true);
    try {
      await planoService.atualizar(id, { status: 'CANCELADO', motivo_cancelamento: cancelMotivo }, { source: activeSource });
      toast.success('Ação cancelada');
      setModalCancel(false);
      fetchData();
    } catch { toast.error('Erro'); }
    finally { setOperating(false); }
  };

  // #15 — guard delete with dependency check
  const handleDelete = async () => {
    if (operating) return;
    const hasTarefas = tarefas.length > 0;
    const hasEvid = evidencias.length > 0;
    if (hasTarefas || hasEvid) {
      const msg = `Este plano possui${hasTarefas ? ` ${tarefas.length} tarefa(s)` : ''}${hasTarefas && hasEvid ? ' e' : ''}${hasEvid ? ` ${evidencias.length} evidência(s)` : ''}. Excluir tudo em cascata?`;
      if (!window.confirm(msg)) return;
      setOperating(true);
      try {
        await planoService.excluir(id, { source: activeSource, force: true });
        toast.success('Plano e dependências excluídos');
        navigate('/planos-acao');
      } catch (err) { toast.error(err?.response?.data?.detail || 'Erro ao excluir'); }
      finally { setOperating(false); }
      return;
    }
    if (!window.confirm('Excluir este plano de ação?')) return;
    setOperating(true);
    try {
      await planoService.excluir(id, { source: activeSource });
      toast.success('Plano excluído');
      navigate('/planos-acao');
    } catch (err) { toast.error(err?.response?.data?.detail || 'Erro ao excluir'); }
    finally { setOperating(false); }
  };

  // #11 — duplicate
  const handleDuplicar = async () => {
    if (operating) return;
    setOperating(true);
    try {
      const { data } = await planoService.duplicar(id);
      toast.success('Plano duplicado');
      navigate(`/planos-acao/${data.id}?source=GAC`);
    } catch { toast.error('Erro ao duplicar'); }
    finally { setOperating(false); }
  };

  // #9 — print
  const handlePrint = () => window.print();

  // #17 — search available tasks for multi-link
  const searchVincular = useCallback(async (q) => {
    setVincularLoading(true);
    try {
      const { data } = await planoService.tarefasDisponiveis(id, q || undefined, { source: activeSource });
      setVincularDisponiveis(data.items || []);
    } catch { setVincularDisponiveis([]); }
    finally { setVincularLoading(false); }
  }, [id, activeSource]);

  useEffect(() => {
    if (modalVincular) searchVincular('');
  }, [modalVincular]);

  // #11 task reorder drag-drop
  const handleTarefaDragStart = (linkId) => setTarefaDragId(linkId);
  const handleTarefaDragOver = (e, linkId) => { e.preventDefault(); setTarefaDragOver(linkId); };
  const handleTarefaDrop = async (targetLinkId) => {
    setTarefaDragOver(null);
    if (!tarefaDragId || tarefaDragId === targetLinkId) { setTarefaDragId(null); return; }
    const reordered = [...tarefas];
    const fromIdx = reordered.findIndex(t => t.link_id === tarefaDragId);
    const toIdx = reordered.findIndex(t => t.link_id === targetLinkId);
    if (fromIdx === -1 || toIdx === -1) { setTarefaDragId(null); return; }
    reordered.splice(toIdx, 0, reordered.splice(fromIdx, 1)[0]);
    setTarefas(reordered); // optimistic
    setTarefaDragId(null);
    try {
      await planoService.reordenarTarefas(id, reordered.map(t => t.link_id));
    } catch { fetchFeatures(); } // rollback on error
  };

  useDocumentTitle(plano ? (plano.titulo || `Plano #${plano.id}`) : 'Plano de Ação');

  const isFechado = plano && ['CONCLUIDO', 'CANCELADO', 'IMPLEMENTADO'].includes(plano.status);
  const statusCfg = STATUS_CONFIG[plano?.status] || STATUS_CONFIG.PENDENTE;
  const diasPrazo = diasAoPrazo(form.dt_prazo);
  const isProximoVencer = diasPrazo !== null && diasPrazo >= 0 && diasPrazo <= 3;

  // #7 — origin link
  const origemRoute = {
    RQ03: '/qualidade/rq03',
    RQ49: '/qualidade/rq49',
    RQ80: '/qualidade/rq80',
  }[plano?.origem_tipo];

  if (loading) return <div className="plano-detail"><SkeletonPlanoDetail /></div>;

  return (
    <div className="plano-detail plano-print-root">
      {/* ── Header card ── */}
      <div className="plano-header-card">
        <div className="plano-header-left">
          <span className="plano-breadcrumb-text">
            <a onClick={() => navigate('/planos-acao')}>Relação Planos de Ações</a>
            {' › '}
            {!isNew && plano?.origem_tipo && origemRoute
              ? <a onClick={() => navigate(`${origemRoute}/${plano.origem_id}`)}>{plano.origem_tipo}-{plano.num_mestre || id}</a>
              : 'Cadastro Plano de Ação'}
          </span>
          <div className="plano-title-row">
            <span className="plano-title-text">
              {isNew ? 'Novo Plano de Ação' : (form.titulo || 'Plano de Ação')}
            </span>
            {!isNew && plano && (
              <span className="plano-status-badge" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                {statusCfg.label}
              </span>
            )}
            {!isNew && <CountdownBadge dtPrazo={form.dt_prazo} status={plano?.status} />}
          </div>
        </div>
        <div className="plano-header-right no-print">
          <button className="plano-btn plano-btn-voltar" onClick={() => navigate('/planos-acao')}>
            <Icon width={14} height={14}><polyline points="15 18 9 12 15 6"/></Icon>
            Voltar
          </button>
          {!isNew && (
            <button className="plano-btn plano-btn-icon" onClick={handlePrint} title="Imprimir">
              <Icon width={14} height={14}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></Icon>
            </button>
          )}
          {!isNew && !isFechado && (
            <button className="plano-btn plano-btn-icon" onClick={handleDuplicar} disabled={operating} title="Duplicar plano">
              <Icon width={14} height={14}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></Icon>
            </button>
          )}
          {!isFechado && (
            <button className="plano-btn plano-btn-salvar" onClick={handleSave} disabled={saving || operating}>
              <Icon width={14} height={14}><polyline points="20 6 9 17 4 12"/></Icon>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          )}
          {!isNew && !isFechado && (
            <button className="plano-btn plano-btn-excluir" onClick={handleDelete} disabled={operating}>
              <Icon width={14} height={14}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></Icon>
            </button>
          )}
        </div>
      </div>

      {/* #18 near-deadline alert */}
      {isProximoVencer && !isFechado && (
        <div className="plano-alert-prazo">
          <Icon width={16} height={16}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></Icon>
          Prazo próximo: {diasPrazo === 0 ? 'vence hoje' : `vence em ${diasPrazo} dia${diasPrazo !== 1 ? 's' : ''}`}
        </div>
      )}

      {/* ── Meta chips ── */}
      {!isNew && (
        <div className="plano-meta-grid">
          <div className="plano-meta-chip">
            <span className="plano-meta-chip-icon">
              <Icon width={16} height={16}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></Icon>
            </span>
            <div className="plano-meta-chip-body">
              <span className="plano-meta-chip-label">Unidade</span>
              <span className="plano-meta-chip-value">{form.filial_nome || plano?.filial_nome || 'Higra'}</span>
            </div>
          </div>
          <div className="plano-meta-chip">
            <span className="plano-meta-chip-icon">
              <Icon width={16} height={16}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></Icon>
            </span>
            <div className="plano-meta-chip-body">
              <span className="plano-meta-chip-label">Sigla / Origem</span>
              <span className="plano-meta-chip-value">{form.origem_tipo || '—'}</span>
              {plano?.origem_tipo && origemRoute && (
                <span className="plano-meta-chip-link" onClick={() => navigate(`${origemRoute}/${plano.origem_id}`)}>
                  Abrir origem
                </span>
              )}
            </div>
          </div>
          <div className="plano-meta-chip">
            <span className="plano-meta-chip-icon">
              <Icon width={16} height={16}><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></Icon>
            </span>
            <div className="plano-meta-chip-body">
              <span className="plano-meta-chip-label">Número</span>
              <span className="plano-meta-chip-value">{form.num_mestre || plano?.id || '—'} / {form.sequencia || '1'}</span>
            </div>
          </div>
          <div className="plano-meta-chip">
            <span className="plano-meta-chip-icon">
              <Icon width={16} height={16}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>
            </span>
            <div className="plano-meta-chip-body">
              <span className="plano-meta-chip-label">Criação</span>
              <span className="plano-meta-chip-value">
                {plano?.created_at ? new Date(plano.created_at).toLocaleDateString('pt-BR') : '—'}
              </span>
            </div>
          </div>
          {plano?.dt_implementacao && (
            <div className="plano-meta-chip">
              <span className="plano-meta-chip-icon">
                <Icon width={16} height={16}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></Icon>
              </span>
              <div className="plano-meta-chip-body">
                <span className="plano-meta-chip-label">Implementação</span>
                <span className="plano-meta-chip-value">
                  {new Date(plano.dt_implementacao + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      {!isNew && activeSource === 'GAC' && plano?.tarefas_total > 0 && (
        <div className="plano-progress-wrap no-print">
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Progresso</span>
          <div className="plano-progress-bar">
            <div className="plano-progress-fill"
              style={{ width: `${Math.round((plano.tarefas_concluidas / plano.tarefas_total) * 100)}%` }} />
          </div>
          <span className="plano-progress-label">
            {plano.tarefas_concluidas}/{plano.tarefas_total} tarefas
            ({Math.round((plano.tarefas_concluidas / plano.tarefas_total) * 100)}%)
          </span>
        </div>
      )}

      {/* #13 manual % for RQ80 */}
      {!isNew && activeSource === 'RQ80' && !isFechado && (
        <div className="plano-progress-wrap no-print">
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Avanço manual</span>
          <input type="range" min="0" max="100" value={form.percentual || 0}
            onChange={e => setForm(f => ({ ...f, percentual: Number(e.target.value) }))}
            className="plano-slider" />
          <span className="plano-progress-label">{form.percentual || 0}%</span>
        </div>
      )}
      {!isNew && activeSource === 'RQ80' && isFechado && (plano?.percentual || 0) > 0 && (
        <div className="plano-progress-wrap">
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Progresso</span>
          <div className="plano-progress-bar">
            <div className="plano-progress-fill" style={{ width: `${plano.percentual}%` }} />
          </div>
          <span className="plano-progress-label">{plano.percentual}% concluído</span>
        </div>
      )}

      {/* ── 5W2H ── */}
      <div className="plano-section-static">
        <div className="plano-section-static-header">
          <Icon width={16} height={16} style={{ color: 'var(--text-muted)' }}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></Icon>
          <h3 className="plano-section-static-title">5W2H</h3>
        </div>
        <div className="plano-section-static-body">
          <div className="plano-5w2h">
            {/* Col 1 — Quem / Quanto / O quê */}
            <div className="plano-5w2h-col">
              <div className="plano-5w2h-col-header">
                <span className="plano-5w2h-letter">W</span>
                <div className="plano-5w2h-questions">Quem? · Quanto?<br />O quê?</div>
              </div>
              <div className="plano-field">
                <label className="plano-label"><span className="required">*</span> Quem?</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {responsavelNome && <UserAvatar name={responsavelNome} size={28} />}
                  <UserSearchSelect
                    value={form.responsavel_id}
                    onChange={v => setForm(f => ({ ...f, responsavel_id: v }))}
                    usuarios={usuarios}
                    disabled={isFechado}
                  />
                </div>
                <div className="plano-help">Quem irá realizar o plano de ação?</div>
              </div>
              <div className="plano-field">
                <label className="plano-label">Custo Previsto (R$)</label>
                <input type="number" className="plano-input" placeholder="0,00" value={form.custo || ''}
                  onChange={e => setForm(f => ({ ...f, custo: e.target.value }))} disabled={isFechado} />
                {/* #9 cost diff */}
                {form.custo && plano?.custo_realizado != null && (
                  (() => {
                    const diff = Number(plano.custo_realizado) - Number(form.custo);
                    const pct = form.custo > 0 ? ((diff / Number(form.custo)) * 100).toFixed(1) : null;
                    return (
                      <div className={`plano-cost-diff ${diff > 0 ? 'over' : diff < 0 ? 'under' : 'ok'}`}>
                        {diff > 0 ? '↑' : diff < 0 ? '↓' : '='} Realizado: R$ {Number(plano.custo_realizado).toFixed(2)}
                        {pct !== null && ` (${diff > 0 ? '+' : ''}${pct}%)`}
                      </div>
                    );
                  })()
                )}
              </div>
              <div className="plano-field">
                <label className="plano-label">
                  <span className="required">*</span> O quê?
                  {/* #7 char counter */}
                  <span className={`plano-char-count ${(form.titulo?.length || 0) > MAX_CHARS ? 'over' : ''}`}>
                    {form.titulo?.length || 0}/{MAX_CHARS}
                  </span>
                </label>
                <textarea
                  className={`plano-input ${errors.titulo ? 'input-error' : ''}`}
                  rows={6} value={form.titulo}
                  onChange={e => {
                    setForm(f => ({ ...f, titulo: e.target.value }));
                    setErrors(prev => ({ ...prev, titulo: e.target.value.trim() ? undefined : 'Campo obrigatório' }));
                  }}
                  onBlur={e => scheduleAutoSave('titulo', e.target.value)} // #6
                  readOnly={isFechado} placeholder="O que será feito no plano de ação?" />
                {errors.titulo && <span className="plano-field-error">{errors.titulo}</span>}
              </div>
            </div>

            {/* Col 2 — Quando / Tempo / Por quê */}
            <div className="plano-5w2h-col">
              <div className="plano-5w2h-col-header">
                <span className="plano-5w2h-letter">W</span>
                <div className="plano-5w2h-questions">Quando? · Tempo<br />Por quê?</div>
              </div>
              <div className="plano-field">
                <label className="plano-label"><span className="required">*</span> Quando?</label>
                <input type="date" className="plano-input" value={form.dt_prazo}
                  onChange={e => { setForm(f => ({ ...f, dt_prazo: e.target.value })); warnPastDate(e.target.value); }}
                  onBlur={e => scheduleAutoSave('dt_prazo', e.target.value)} // #6
                  readOnly={isFechado} />
              </div>
              <div className="plano-field">
                <label className="plano-label">Tempo de Execução (horas)</label>
                <input type="number" className="plano-input" placeholder="0" value={form.tempo_execucao || ''}
                  onChange={e => setForm(f => ({ ...f, tempo_execucao: e.target.value }))} disabled={isFechado} />
              </div>
              <div className="plano-field">
                <label className="plano-label">
                  <span className="required">*</span> Por quê?
                  <span className={`plano-char-count ${(form.descricao?.length || 0) > MAX_CHARS ? 'over' : ''}`}>
                    {form.descricao?.length || 0}/{MAX_CHARS}
                  </span>
                </label>
                <textarea className="plano-input" rows={6} value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  readOnly={isFechado} placeholder="Por que o plano de ação será executado?" />
              </div>
            </div>

            {/* Col 3 — Onde / Como */}
            <div className="plano-5w2h-col">
              <div className="plano-5w2h-col-header">
                <span className="plano-5w2h-letter">H</span>
                <div className="plano-5w2h-questions">Onde?<br />Como?</div>
              </div>
              <div className="plano-field">
                <label className="plano-label">Onde?</label>
                <input className="plano-input" placeholder="Onde o plano será executado?" value={form.local || ''}
                  onChange={e => setForm(f => ({ ...f, local: e.target.value }))} disabled={isFechado} />
              </div>
              <div className="plano-field">
                <label className="plano-label">Como?</label>
                <textarea className="plano-input" rows={9} placeholder="Como o plano de ação será executado?"
                  value={form.metodo || ''} onChange={e => setForm(f => ({ ...f, metodo: e.target.value }))}
                  disabled={isFechado} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Equipe Envolvida ── */}
      {!isNew && supportsEquipeEvidencias && (
        <Section title="Equipe Envolvida" icon={<Icon width={15} height={15}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Icon>} badge={equipe.length || undefined} defaultOpen
          action={!isFechado && <button className="plano-btn-participante" onClick={() => setModalMembro(true)}>+ Novo Participante</button>}>
          <div className="plano-equipe-grid">
            {equipe.map(m => (
              <div key={m.id} className="plano-equipe-card">
                <UserAvatar name={m.nome} size={28} />
                <span className="plano-equipe-nome">{m.nome || '—'}</span>
                {!isFechado && <button onClick={async () => {
                  if (!window.confirm(`Remover ${m.nome} da equipe?`)) return;
                  try { await planoService.removerMembro(id, m.id, { source: activeSource }); toast.success('Removido'); fetchFeatures(); } catch { toast.error('Erro'); }
                }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>}
              </div>
            ))}
            {responsavelNome && equipe.length === 0 && (
              <div className="plano-equipe-card">
                <UserAvatar name={responsavelNome} size={28} />
                <span className="plano-equipe-nome">{responsavelNome} (responsável)</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ── Reagendamento ── */}
      {!isNew && (
        <Section title="Reagendamento" icon={<Icon width={15} height={15}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></Icon>} defaultOpen={!!(form.dt_reagendamento)}>
          <div className="plano-field" style={{ maxWidth: 250 }}>
            <label className="plano-label">Data de Reagendamento</label>
            <input type="date" className="plano-input" value={form.dt_reagendamento || ''}
              onChange={e => setForm(f => ({ ...f, dt_reagendamento: e.target.value }))} disabled={isFechado} />
          </div>
          <div className="plano-field">
            <label className="plano-label">Justificativa</label>
            <textarea className="plano-input" rows={3} value={form.justificativa_reagendamento || ''}
              onChange={e => setForm(f => ({ ...f, justificativa_reagendamento: e.target.value }))}
              placeholder="Justifique o porquê do reagendamento." disabled={isFechado} />
          </div>
        </Section>
      )}

      {/* ── Tarefas ── */}
      {!isNew && supportsTarefas && (
        <Section title="Tarefas" icon={<Icon width={15} height={15}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></Icon>} badge={tarefas.length || undefined} defaultOpen
          action={!isFechado && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setModalVincular(true)} className="plano-btn-participante" style={{ background: 'var(--accent)', fontSize: '0.78rem', padding: '5px 12px' }}>Vincular Tarefa</button>
              <button onClick={() => setModalTarefa(true)} className="plano-btn-participante" style={{ background: '#4caf50', fontSize: '0.78rem', padding: '5px 12px' }}>+ Nova</button>
            </div>
          )}>
          {tarefas.length === 0 ? <EmptyState title="Nenhuma tarefa vinculada." /> : tarefas.map(t => {
            const isAtrasada = t.dt_previsao && new Date(t.dt_previsao) < new Date() && t.status !== 'CONCLUIDA';
            const isDragTarget = tarefaDragOver === t.link_id;
            return (
              <div key={t.id}
                className={`plano-tarefa-item ${isDragTarget ? 'tarefa-drag-over' : ''}`}
                draggable={!isFechado}
                onDragStart={() => handleTarefaDragStart(t.link_id)}
                onDragOver={e => handleTarefaDragOver(e, t.link_id)}
                onDragLeave={() => setTarefaDragOver(null)}
                onDrop={() => handleTarefaDrop(t.link_id)}>
                {!isFechado && (
                  <span className="plano-tarefa-drag-handle" title="Arrastar para reordenar">
                    <Icon width={12} height={12}><line x1="9" y1="5" x2="15" y2="5"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></Icon>
                  </span>
                )}
                <button className="plano-tarefa-edit" onClick={() => navigate(`/tarefas/${t.id}`)}>
                  <Icon width={12} height={12}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Icon>
                </button>
                <UserAvatar name={t.responsavel_nome} size={28} />
                <div className="plano-tarefa-info">
                  <div className="plano-tarefa-titulo">{t.titulo}</div>
                  {t.feedback && <div className="plano-tarefa-feedback">Feedback: {t.feedback}</div>}
                  <div className="plano-tarefa-meta">
                    <span>{t.responsavel_nome || '—'}</span>
                    {t.dt_previsao && <span>· {new Date(t.dt_previsao).toLocaleDateString('pt-BR')}</span>}
                    <span className={`plano-tarefa-status ${isAtrasada ? 'atrasada' : t.status === 'CONCLUIDA' ? 'concluida' : 'aberta'}`}>
                      {isAtrasada ? 'ATRASADA' : t.status}
                    </span>
                  </div>
                </div>
                <div className="plano-tarefa-actions">
                  {t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA' && <>
                    <button className="btn-play" title="Iniciar" onClick={async e => { e.stopPropagation(); try { await tarefaService.iniciar(t.id); toast.success('Iniciado'); fetchFeatures(); } catch (err) { toast.error(err?.response?.data?.detail || 'Erro'); } }}>
                      <Icon width={10} height={10}><polygon points="5 3 19 12 5 21 5 3"/></Icon>
                    </button>
                    <button className="btn-pause" title="Pausar" onClick={async e => { e.stopPropagation(); try { await tarefaService.pausar(t.id); toast.success('Pausado'); fetchFeatures(); } catch (err) { toast.error(err?.response?.data?.detail || 'Erro'); } }}>
                      <Icon width={10} height={10}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></Icon>
                    </button>
                    <button className="btn-check" title="Concluir" onClick={async e => { e.stopPropagation(); if (!window.confirm('Concluir esta tarefa?')) return; try { await tarefaService.entregar(t.id); toast.success('Tarefa entregue!'); fetchFeatures(); } catch (err) { toast.error(err?.response?.data?.detail || 'Erro'); } }}>
                      <Icon width={10} height={10}><polyline points="20 6 9 17 4 12"/></Icon>
                    </button>
                  </>}
                  {!isFechado && <button title="Desvincular" onClick={async () => {
                    if (!window.confirm('Desvincular esta tarefa?')) return;
                    try { await planoService.desvincularTarefa(id, t.link_id, { source: activeSource }); toast.success('Desvinculada'); fetchFeatures(); } catch { toast.error('Erro'); }
                  }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem' }}>✕</button>}
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {/* ── Evidências ── */}
      {!isNew && (
        <Section title="Evidências" icon={<Icon width={15} height={15}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></Icon>} badge={evidencias.length || undefined}
          defaultOpen={evidencias.length > 0 || supportsEquipeEvidencias}
          action={!isFechado && <button onClick={() => setModalEvid(true)} className="plano-btn-participante" style={{ fontSize: '0.78rem', padding: '5px 12px' }}>+ Adicionar</button>}>
          {evidencias.length === 0 ? <EmptyState title="Nenhuma evidência registrada." /> : (
            <table className="plano-evid-table">
              <thead><tr><th>Data</th><th>Descrição</th><th>Anexo</th><th style={{ width: 40 }}></th></tr></thead>
              <tbody>
                {evidencias.map(ev => (
                  <tr key={ev.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{ev.dt_cad_evid ? new Date(ev.dt_cad_evid).toLocaleDateString('pt-BR') : '—'}</td>
                    <td>{ev.observacoes || '—'}</td>
                    <td>{ev.tem_anexo ? (
                      <button className="plano-anexo-btn" onClick={async () => {
                        try {
                          const res = await planoService.baixarAnexo(id, ev.id);
                          const url = URL.createObjectURL(res.data);
                          // #14 inline image preview for image/* types
                          if (ev.mimetype?.startsWith('image/')) {
                            const win = window.open(); win.document.write(`<img src="${url}" style="max-width:100%;height:auto">`);
                          } else {
                            const a = document.createElement('a'); a.href = url; a.download = ev.filename || 'anexo'; a.click();
                          }
                          URL.revokeObjectURL(url);
                        } catch { toast.error('Erro ao baixar anexo'); }
                      }}>
                      {/* #14 image icon vs download icon */}
                      {ev.mimetype?.startsWith('image/')
                        ? <Icon width={12} height={12}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></Icon>
                        : <Icon width={12} height={12}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></Icon>}
                      {ev.filename || 'Baixar'}
                    </button>
                    ) : '—'}</td>
                    <td>{!isFechado && <button onClick={async () => {
                      if (!window.confirm('Excluir evidência?')) return;
                      try { await planoService.excluirEvidencia(id, ev.id, { source: activeSource }); toast.success('Excluída'); fetchFeatures(); } catch { toast.error('Erro'); }
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>🗑️</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      )}

      {/* ── Histórico ── */}
      {!isNew && (historico.length > 0 || histTotal > 0) && (
        <Section title="Histórico" icon={<Icon width={15} height={15}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Icon>} badge={histTotal || historico.length} defaultOpen={false}>
          <div className="plano-historico-list">
            {historico.map(h => (
              <div key={h.id} className="plano-historico-item">
                <div className="plano-historico-dot" />
                <div className="plano-historico-content">
                  <span className="plano-historico-acao">
                    {h.acao === 'CRIACAO' ? 'Criação'
                      : h.acao === 'ATUALIZACAO' ? 'Atualização'
                      : h.acao === 'REAGENDAMENTO' ? 'Reagendamento'
                      : h.acao === 'EXCLUSAO' ? 'Exclusão'
                      : h.acao === 'RESTAURACAO' ? 'Restauração'
                      : h.acao}
                  </span>
                  {h.detalhes && <span className="plano-historico-detalhe"> — {h.detalhes}</span>}
                  <div className="plano-historico-meta">
                    <span>{h.usuario_nome || 'Sistema'}</span>
                    <span>· {new Date(h.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* #19 load more */}
          {historico.length < histTotal && (
            <button className="plano-hist-load-more"
              onClick={() => fetchHistorico(histPage + 1)}>
              Ver mais ({histTotal - historico.length} restantes)
            </button>
          )}
        </Section>
      )}

      {/* ── Footer ── */}
      {!isNew && !isFechado && (
        <div className="plano-footer no-print">
          <button className="plano-footer-btn cancelar" onClick={() => setModalCancel(true)} disabled={operating}>
            <Icon width={15} height={15}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Icon>
            Cancelar Ação
          </button>
          <button className="plano-footer-btn implementar" onClick={() => setModalImpl(true)} disabled={operating}>
            <Icon width={15} height={15}><polyline points="20 6 9 17 4 12"/></Icon>
            Implementar Ação
          </button>
        </div>
      )}

      {/* ── Modal Nova Tarefa ── */}
      {/* ── Modal Nova Tarefa (#13 templates) ── */}
      <Modal open={modalTarefa} onClose={() => setModalTarefa(false)} title="Nova Tarefa" size="small"
        footer={<><button className="btn-secondary" onClick={() => setModalTarefa(false)}>Cancelar</button><button className="btn-primary" onClick={async () => {
          if (!tarefaForm.titulo.trim()) { toast.error('Título obrigatório'); return; }
          try { await planoService.criarTarefa(id, tarefaForm, { source: activeSource }); toast.success('Tarefa criada'); setModalTarefa(false); setTarefaForm({ titulo: '', descricao: '', dt_previsao: '' }); fetchFeatures(); }
          catch { toast.error('Erro'); }
        }}>Criar</button></>}>
        {/* #13 Templates */}
        <div className="form-group">
          <label>Modelo</label>
          <select className="form-control" value=""
            onChange={e => {
              const tpl = e.target.value;
              if (tpl) setTarefaForm(f => ({ ...f, titulo: tpl }));
            }}>
            <option value="">— Escolher modelo —</option>
            {[
              'Investigar causa raiz',
              'Implementar ação corretiva',
              'Verificar eficácia da ação',
              'Treinar equipe envolvida',
              'Atualizar documentação',
              'Registrar evidência de conclusão',
              'Comunicar partes interessadas',
            ].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Título *</label><input className="form-control" value={tarefaForm.titulo} onChange={e => setTarefaForm(f => ({ ...f, titulo: e.target.value }))} /></div>
        <div className="form-group"><label>Descrição</label><textarea className="form-control" rows={3} value={tarefaForm.descricao} onChange={e => setTarefaForm(f => ({ ...f, descricao: e.target.value }))} /></div>
        <div className="form-group"><label>Prazo</label><input type="date" className="form-control" value={tarefaForm.dt_previsao} onChange={e => setTarefaForm(f => ({ ...f, dt_previsao: e.target.value }))} /></div>
      </Modal>

      {/* ── Modal Vincular Tarefas (multi-select, #17) ── */}
      <Modal open={modalVincular} onClose={() => { setModalVincular(false); setVincularSelecionados([]); setVincularSearch(''); }}
        title="Vincular Tarefas ao Plano"
        footer={<>
          <button className="btn-secondary" onClick={() => { setModalVincular(false); setVincularSelecionados([]); }}>Cancelar</button>
          <button className="btn-primary" disabled={vincularSelecionados.length === 0} onClick={async () => {
            try {
              await planoService.vincularMultiplasTarefas(id, vincularSelecionados, { source: activeSource });
              toast.success(`${vincularSelecionados.length} tarefa(s) vinculada(s)`);
              setModalVincular(false); setVincularSelecionados([]); setVincularSearch('');
              fetchFeatures();
            } catch { toast.error('Erro ao vincular'); }
          }}>Vincular {vincularSelecionados.length > 0 ? `(${vincularSelecionados.length})` : ''}</button>
        </>}>
        <div className="form-group">
          <input className="form-control" placeholder="Buscar tarefas..." value={vincularSearch}
            onChange={e => { setVincularSearch(e.target.value); searchVincular(e.target.value); }} />
        </div>
        <div className="vincular-task-list">
          {vincularLoading ? <SkeletonVincularList rows={5} />
            : vincularDisponiveis.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: 8 }}>Nenhuma tarefa disponível</div>
            : vincularDisponiveis.map(t => (
              <label key={t.id} className="vincular-task-item">
                <input type="checkbox" checked={vincularSelecionados.includes(t.id)}
                  onChange={e => setVincularSelecionados(prev =>
                    e.target.checked ? [...prev, t.id] : prev.filter(x => x !== t.id)
                  )} />
                <div className="vincular-task-info">
                  <span className="vincular-task-titulo">{t.titulo}</span>
                  <span className="vincular-task-meta">{t.responsavel_nome || '—'} · {t.status}</span>
                </div>
              </label>
            ))}
        </div>
      </Modal>

      {/* ── Modal Adicionar Membro ── */}
      <Modal open={modalMembro} onClose={() => { setModalMembro(false); setMembroId(''); }} title="Adicionar Participante"
        footer={<><button className="btn-secondary" onClick={() => { setModalMembro(false); setMembroId(''); }}>Cancelar</button><button className="btn-primary" disabled={!membroId} onClick={async () => {
          try { await planoService.adicionarMembro(id, membroId, { source: activeSource }); toast.success('Membro adicionado'); setModalMembro(false); setMembroId(''); fetchFeatures(); }
          catch { toast.error('Erro ao adicionar'); }
        }}>Adicionar</button></>}>
        <div className="form-group">
          <label>Participante</label>
          <select className="form-control" value={membroId} onChange={e => setMembroId(e.target.value)}>
            <option value="">Selecione um usuário...</option>
            {usuarios.filter(u => !equipe.some(m => String(m.usuario_id) === String(u.value))).map(u => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </Modal>

      {/* ── Modal Evidência ── */}
      {/* ── Modal Evidência (#15 drag-drop) ── */}
      <Modal open={modalEvid} onClose={() => { setModalEvid(false); setEvidForm(''); setEvidFile(null); setEvidDragging(false); }} title="Incluir Evidência"
        footer={<><button className="btn-secondary" onClick={() => { setModalEvid(false); setEvidForm(''); setEvidFile(null); }}>Cancelar</button><button className="btn-primary" onClick={async () => {
          if (!evidForm.trim()) { toast.error('Descrição obrigatória'); return; }
          try {
            const fd = new FormData(); fd.append('observacoes', evidForm); if (evidFile) fd.append('arquivo', evidFile);
            await planoService.criarEvidencia(id, fd, { source: activeSource });
            toast.success('Evidência registrada'); setModalEvid(false); setEvidForm(''); setEvidFile(null); fetchFeatures();
          } catch { toast.error('Erro'); }
        }}>Gravar</button></>}>
        <div className="form-group"><label>Descrição *</label><textarea className="form-control" rows={4} value={evidForm} onChange={e => setEvidForm(e.target.value)} placeholder="Faça uma descrição resumida da evidência..." /></div>
        {/* #15 Drag-and-drop upload zone */}
        <div className="form-group">
          <label>Anexo (opcional)</label>
          <div
            className={`evid-dropzone ${evidDragging ? 'dragging' : ''} ${evidFile ? 'has-file' : ''}`}
            onDragOver={e => { e.preventDefault(); setEvidDragging(true); }}
            onDragLeave={() => setEvidDragging(false)}
            onDrop={e => { e.preventDefault(); setEvidDragging(false); const f = e.dataTransfer.files[0]; if (f) setEvidFile(f); }}>
            {evidFile ? (
              <div className="evid-dropzone-file">
                <Icon width={14} height={14}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></Icon>
                <span>{evidFile.name}</span>
                <button type="button" onClick={() => setEvidFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
              </div>
            ) : (
              <>
                <Icon width={20} height={20}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></Icon>
                <span>Arraste um arquivo aqui ou </span>
                <label style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 500 }}>
                  clique para selecionar
                  <input type="file" style={{ display: 'none' }} onChange={e => setEvidFile(e.target.files[0] || null)} />
                </label>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Modal Implementar (#12 aval_efic, #14 criterio) ── */}
      <Modal open={modalImpl} onClose={() => setModalImpl(false)} title="Avaliação de Implementação"
        footer={<><button className="btn-secondary" onClick={() => setModalImpl(false)}>Voltar</button><button className="btn-primary" style={{ background: '#4caf50' }} onClick={handleImplementar} disabled={operating}>✓ Confirmar</button></>}>
        <div className="form-group"><label>O quê?</label><div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6, fontSize: '0.85rem' }}>{form.titulo || '—'}</div></div>
        <div className="form-group"><label>Custo realizado (R$)</label><input type="number" className="form-control" value={implForm.custo_realizado} onChange={e => setImplForm(f => ({ ...f, custo_realizado: e.target.value }))} /></div>
        <div className="form-group"><label>Avaliação da implementação *</label><textarea className="form-control" rows={3} value={implForm.avaliacao} onChange={e => setImplForm(f => ({ ...f, avaliacao: e.target.value }))} /></div>
        <div className="form-group"><label>Critério de aceitação *</label><textarea className="form-control" rows={2} placeholder="Como verificar que a ação foi efetiva?" value={implForm.criterio} onChange={e => setImplForm(f => ({ ...f, criterio: e.target.value }))} /></div>
        <div className="form-group"><label>Avaliação de eficácia (#12)</label><textarea className="form-control" rows={2} placeholder="A ação resolveu o problema?" value={implForm.aval_efic} onChange={e => setImplForm(f => ({ ...f, aval_efic: e.target.value }))} /></div>
      </Modal>

      {/* ── Modal Cancelar ── */}
      <Modal open={modalCancel} onClose={() => setModalCancel(false)} title="Motivo do Cancelamento"
        footer={<><button className="btn-secondary" onClick={() => setModalCancel(false)}>Voltar</button><button className="btn-primary" style={{ background: '#f0c040', color: '#333' }} onClick={handleCancelar} disabled={operating}>Confirmar Cancelamento</button></>}>
        <div className="form-group"><label>O quê?</label><div style={{ background: 'var(--bg-surface)', padding: 10, borderRadius: 6, fontSize: '0.85rem' }}>{form.titulo || '—'}</div></div>
        <div className="form-group"><label>Motivo *</label><textarea className="form-control" rows={4} value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)} /></div>
      </Modal>
    </div>
  );
}

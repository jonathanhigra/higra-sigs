/**
 * Tarefa Detail/Form — padrão PlanoDetail
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { tarefaService } from '../../services/tarefas/tarefaService';
import { EmptyState, DetailSection } from '../../components/ui';
import Icon from '../../components/Icon';
import { SkeletonTarefaDetail } from '../../components/SkeletonPlanos';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useKeyboardShortcut from '../../hooks/useKeyboardShortcut';
import '../planos_acao/PlanoDetail.css';

const MAX_CHARS = 500;

function diasParaPrazo(dt) {
  if (!dt) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const prazo = new Date(dt + 'T00:00:00');
  return Math.round((prazo - hoje) / 86400000);
}

const STATUS_LABELS = { ABERTA: 'Aberta', EM_ANDAMENTO: 'Em Andamento', EM_ESPERA: 'Em Espera', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada' };
const PRIO_LABELS   = { URGENTE: 'Urgente', ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' };
const STATUS_COLORS = { ABERTA: '#3b82f6', EM_ANDAMENTO: '#f59e0b', EM_ESPERA: '#8b5cf6', CONCLUIDA: '#22c55e', CANCELADA: '#ef4444' };

export default function TarefaForm() {
  const { id } = useParams();
  const isNew = !id || id === 'nova';
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    titulo: '', descricao: '', prioridade: 'MEDIA',
    status: 'ABERTA', dt_inicio: '', dt_previsao: '', tempo_estimado: '',
  });
  const [apto, setApto] = useState({ tempo_minutos: '', descricao: '', dt_apontamento: '' });
  const [tarefa, setTarefa] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [operating, setOperating] = useState(false);
  const [errors, setErrors] = useState({});
  const autoSaveTimer = useRef(null);
  // Subtarefas
  const [subtarefas, setSubtarefas] = useState([]);
  const [novaSubtarefa, setNovaSubtarefa] = useState('');
  const [addingSub, setAddingSub] = useState(false);
  // Dependências
  const [dependencias, setDependencias] = useState([]);
  const [novaDep, setNovaDep] = useState('');

  useDocumentTitle(isNew ? 'Nova Tarefa' : (form.titulo || 'Tarefa'));

  useEffect(() => { if (!isNew) fetchData(); }, [id]);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await tarefaService.obter(id);
      setTarefa(data);
      setSubtarefas(data.subtarefas || []);
      setDependencias(data.dependencias || []);
      const st = data._status || data.status || 'ABERTA';
      const prazo = data._dt_previsao || data.dt_previsao || '';
      setForm({
        titulo:      data.titulo || '',
        descricao:   data.descricao || '',
        prioridade:  data.prioridade || 'MEDIA',
        status:      st,
        dt_inicio:   data.dt_inicio || '',
        dt_previsao: typeof prazo === 'string' ? prazo.substring(0, 10) : '',
        tempo_estimado: data.tempo_estimado ? String(data.tempo_estimado) : '',
      });
    } catch { toast.error('Erro ao carregar tarefa'); navigate('/tarefas'); }
    finally { setLoading(false); }
  }, [id]);

  const validate = (f) => {
    const e = {};
    if (!f.titulo.trim()) e.titulo = 'Título é obrigatório';
    else if (f.titulo.length > 200) e.titulo = 'Título muito longo (máx. 200)';
    if (f.descricao.length > MAX_CHARS) e.descricao = `Máximo ${MAX_CHARS} caracteres`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const scheduleAutoSave = useCallback((field, value) => {
    if (isNew) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try { await tarefaService.atualizar(id, { [field]: value }); }
      catch { /* silent */ }
    }, 2000);
  }, [id, isNew]);

  const handleSave = async () => {
    if (!validate(form) || operating) return;
    setOperating(true);
    try {
      const payload = { ...form };
      if (!payload.dt_inicio)   delete payload.dt_inicio;
      if (!payload.dt_previsao) delete payload.dt_previsao;
      if (isNew) {
        const { data } = await tarefaService.criar(payload);
        toast.success('Tarefa criada');
        navigate(`/tarefas/${data.id}`);
      } else {
        await tarefaService.atualizar(id, payload);
        toast.success('Salvo');
        fetchData();
      }
    } catch { toast.error('Erro ao salvar'); }
    finally { setOperating(false); }
  };

  // Ctrl+S salva o formulário (se não estiver fechado)
  useKeyboardShortcut('mod+s', () => {
    const st = form.status || 'ABERTA';
    if (!['CONCLUIDA', 'CANCELADA'].includes(st)) handleSave();
  }, { allowInInput: true });

  const handleAction = async (action) => {
    if (operating) return;
    if (action === 'entregar' && !window.confirm('Entregar esta tarefa como concluída?')) return;
    setOperating(true);
    try {
      if (action === 'iniciar')  { await tarefaService.iniciar(id);   toast.success('Cronômetro iniciado'); }
      if (action === 'pausar')   { await tarefaService.pausar(id);    toast.success('Cronômetro pausado'); }
      if (action === 'entregar') { await tarefaService.entregar(id);  toast.success('Tarefa entregue!'); }
      fetchData();
    } catch (e) { toast.error(e?.response?.data?.detail || `Erro ao ${action}`); }
    finally { setOperating(false); }
  };

  const handleApontar = async () => {
    if (!apto.tempo_minutos || Number(apto.tempo_minutos) <= 0) { toast.error('Informe o tempo'); return; }
    if (operating) return;
    setOperating(true);
    try {
      await tarefaService.apontar(id, {
        tempo_minutos:   Number(apto.tempo_minutos),
        descricao:       apto.descricao,
        dt_apontamento:  apto.dt_apontamento || undefined,
      });
      toast.success('Apontamento registrado');
      setApto({ tempo_minutos: '', descricao: '', dt_apontamento: '' });
      fetchData();
    } catch { toast.error('Erro ao apontar'); }
    finally { setOperating(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Excluir esta tarefa?') || operating) return;
    setOperating(true);
    try { await tarefaService.excluir(id); toast.success('Excluída'); navigate('/tarefas'); }
    catch { toast.error('Erro'); setOperating(false); }
  };

  const handleAddSubtarefa = async () => {
    if (!novaSubtarefa.trim() || addingSub) return;
    setAddingSub(true);
    try {
      const { data } = await tarefaService.criarSubtarefa(id, { titulo: novaSubtarefa.trim() });
      setSubtarefas(prev => [...prev, data]);
      setNovaSubtarefa('');
    } catch { toast.error('Erro ao criar subtarefa'); }
    finally { setAddingSub(false); }
  };

  const handleAddDep = async () => {
    const predId = parseInt(novaDep.trim(), 10);
    if (isNaN(predId) || predId <= 0) { toast.error('Informe o ID da tarefa predecessora'); return; }
    try {
      const { data } = await tarefaService.adicionarDep(id, { predecessora_id: predId });
      setDependencias(prev => [...prev, data]);
      setNovaDep('');
    } catch { toast.error('Erro ao adicionar dependência'); }
  };

  const handleRemoveDep = async (depId) => {
    try {
      await tarefaService.removerDep(id, depId);
      setDependencias(prev => prev.filter(d => d.dep_id !== depId));
    } catch { toast.error('Erro ao remover dependência'); }
  };

  if (loading) return <SkeletonTarefaDetail />;

  const st = form.status || 'ABERTA';
  const isFechada     = ['CONCLUIDA', 'CANCELADA'].includes(st);
  const totalMinutos  = (tarefa?.apontamentos || []).reduce((s, a) => s + (a.tempo_minutos || 0), 0);
  const respNome      = tarefa?.responsavel_nome || '';
  const diasRestantes = diasParaPrazo(form.dt_previsao);
  const isAtrasada    = diasRestantes !== null && diasRestantes < 0 && !isFechada;

  return (
    <div className="plano-detail">

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div className="plano-header-card">
        <div className="plano-header-left">
          <div className="plano-breadcrumb-text">
            <a onClick={() => navigate('/tarefas')} style={{ cursor: 'pointer' }}>Tarefas</a>
            {' › '}
            {isNew ? 'Nova Tarefa' : (tarefa?.titulo || 'Editar')}
          </div>
          <div className="plano-header-title-row">
            <h2 className="plano-title">{isNew ? 'Nova Tarefa' : (tarefa?.titulo || '—')}</h2>
            {!isNew && (
              <span
                className="plano-status-badge"
                style={{ background: STATUS_COLORS[st] || '#3b82f6', color: '#fff', borderRadius: 12, padding: '3px 12px', fontSize: '0.78rem', fontWeight: 700 }}
              >
                {STATUS_LABELS[st] || st}
              </span>
            )}
            {!isNew && diasRestantes !== null && (
              <span className={`plano-countdown-badge${isAtrasada ? ' over' : diasRestantes <= 3 ? ' soon' : ''}`}>
                {isAtrasada
                  ? `${Math.abs(diasRestantes)}d atrasada`
                  : diasRestantes === 0 ? 'Vence hoje'
                  : `${diasRestantes}d restantes`}
              </span>
            )}
          </div>
        </div>

        <div className="plano-header-right">
          {!isNew && !isFechada && (
            <>
              <button
                className="plano-btn"
                style={{ background: '#4caf50', color: '#fff' }}
                onClick={() => handleAction('iniciar')}
                disabled={operating}
                title="Iniciar cronômetro"
              >
                <Icon><polygon points="5 3 19 12 5 21 5 3"/></Icon>
              </button>
              <button
                className="plano-btn"
                style={{ background: '#555', color: '#fff' }}
                onClick={() => handleAction('pausar')}
                disabled={operating}
                title="Pausar"
              >
                <Icon><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></Icon>
              </button>
              <button
                className="plano-btn"
                style={{ background: 'var(--accent)', color: '#fff' }}
                onClick={() => handleAction('entregar')}
                disabled={operating}
                title="Entregar"
              >
                <Icon><polyline points="20 6 9 17 4 12"/></Icon>
              </button>
            </>
          )}
          <button className="plano-btn plano-btn-voltar" onClick={() => navigate('/tarefas')}>
            <Icon><polyline points="15 18 9 12 15 6"/></Icon> Voltar
          </button>
          {!isFechada && (
            <button className="plano-btn plano-btn-salvar" onClick={handleSave} disabled={operating}>
              {operating
                ? '...'
                : <><Icon><polyline points="20 6 9 17 4 12"/></Icon> Salvar</>}
            </button>
          )}
          {!isNew && (
            <button className="plano-btn plano-btn-excluir" onClick={handleDelete} disabled={operating} title="Excluir">
              <Icon>
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </Icon>
            </button>
          )}
        </div>
      </div>

      {/* ── Meta chips ──────────────────────────────────────────────────── */}
      {!isNew && (
        <div className="plano-meta-chips">
          <div className="plano-meta-chip">
            <span className="plano-meta-chip-icon">
              <Icon width={16} height={16}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></Icon>
            </span>
            <div className="plano-meta-chip-body">
              <span className="plano-meta-chip-label">Prioridade</span>
              <span className="plano-meta-chip-value">{PRIO_LABELS[form.prioridade] || form.prioridade}</span>
            </div>
          </div>
          {respNome && (
            <div className="plano-meta-chip">
              <span className="plano-meta-chip-icon">
                <Icon width={16} height={16}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></Icon>
              </span>
              <div className="plano-meta-chip-body">
                <span className="plano-meta-chip-label">Responsável</span>
                <span className="plano-meta-chip-value">{respNome}</span>
              </div>
            </div>
          )}
          {form.dt_previsao && (
            <div className="plano-meta-chip">
              <span className="plano-meta-chip-icon">
                <Icon width={16} height={16}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Icon>
              </span>
              <div className="plano-meta-chip-body">
                <span className="plano-meta-chip-label">Previsão</span>
                <span className="plano-meta-chip-value">{new Date(form.dt_previsao + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          )}
          {totalMinutos > 0 && (
            <div className="plano-meta-chip">
              <span className="plano-meta-chip-icon">
                <Icon width={16} height={16}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Icon>
              </span>
              <div className="plano-meta-chip-body">
                <span className="plano-meta-chip-label">Apontado</span>
                <span className="plano-meta-chip-value">{Math.floor(totalMinutos/60)}h{String(totalMinutos%60).padStart(2,'0')}m</span>
              </div>
            </div>
          )}
          {isAtrasada && (
            <div className="plano-meta-chip" style={{ borderColor: '#ef4444' }}>
              <span className="plano-meta-chip-icon" style={{ color: '#ef4444' }}>
                <Icon width={16} height={16}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></Icon>
              </span>
              <div className="plano-meta-chip-body">
                <span className="plano-meta-chip-label" style={{ color: '#ef4444' }}>Atrasada</span>
                <span className="plano-meta-chip-value" style={{ color: '#ef4444' }}>{Math.abs(diasRestantes)} dias</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Form fields ─────────────────────────────────────────────────── */}
      <div className="plano-section">
        <div className="plano-section-body">
        <div className="plano-field">
          <label className="plano-label">
            <span className="required">*</span> Título
            <span className="plano-char-count">{form.titulo.length}/200</span>
          </label>
          <input
            className={`plano-input${errors.titulo ? ' input-error' : ''}`}
            value={form.titulo}
            onChange={e => {
              setForm(f => ({ ...f, titulo: e.target.value }));
              if (errors.titulo) setErrors(prev => ({ ...prev, titulo: undefined }));
            }}
            onBlur={e => scheduleAutoSave('titulo', e.target.value)}
            readOnly={isFechada}
            placeholder="O que precisa ser feito?"
            maxLength={200}
          />
          {errors.titulo && <span className="plano-field-error">{errors.titulo}</span>}
        </div>

        <div className="plano-field">
          <label className="plano-label">
            Descrição
            <span className={`plano-char-count${form.descricao.length > MAX_CHARS ? ' over' : ''}`}>
              {form.descricao.length}/{MAX_CHARS}
            </span>
          </label>
          <textarea
            className={`plano-input${errors.descricao ? ' input-error' : ''}`}
            rows={4}
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            onBlur={e => scheduleAutoSave('descricao', e.target.value)}
            readOnly={isFechada}
            placeholder="Detalhes da tarefa..."
          />
          {errors.descricao && <span className="plano-field-error">{errors.descricao}</span>}
        </div>

        <div className="plano-row">
          <div className="plano-field">
            <label className="plano-label">Prioridade</label>
            <select className="plano-input" value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value }))} disabled={isFechada}>
              <option value="URGENTE">Urgente</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Média</option>
              <option value="BAIXA">Baixa</option>
            </select>
          </div>
          {!isNew && (
            <div className="plano-field">
              <label className="plano-label">Status</label>
              <select className="plano-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} disabled={isFechada}>
                <option value="ABERTA">Aberta</option>
                <option value="EM_ANDAMENTO">Em Andamento</option>
                <option value="EM_ESPERA">Em Espera</option>
                <option value="CONCLUIDA">Concluída</option>
                <option value="CANCELADA">Cancelada</option>
              </select>
            </div>
          )}
        </div>

        <div className="plano-row">
          <div className="plano-field">
            <label className="plano-label">Data Início</label>
            <input type="date" className="plano-input" value={form.dt_inicio} onChange={e => setForm(f => ({ ...f, dt_inicio: e.target.value }))} readOnly={isFechada} />
          </div>
          <div className="plano-field">
            <label className="plano-label">Previsão</label>
            <input type="date" className="plano-input" value={form.dt_previsao} onChange={e => setForm(f => ({ ...f, dt_previsao: e.target.value }))} readOnly={isFechada} />
          </div>
          <div className="plano-field" style={{ maxWidth: 140 }}>
            <label className="plano-label" title="Tempo estimado em minutos">Estimado (min)</label>
            <input type="number" className="plano-input" min="0" value={form.tempo_estimado}
              onChange={e => setForm(f => ({ ...f, tempo_estimado: e.target.value }))}
              onBlur={e => scheduleAutoSave('tempo_estimado', e.target.value ? Number(e.target.value) : null)}
              readOnly={isFechada} placeholder="Ex: 120" />
          </div>
        </div>
        </div>
      </div>

      {/* ── Apontamento de horas ────────────────────────────────────────── */}
      {!isNew && (
        <DetailSection title="Apontamento de Horas">
          {!isFechada && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="plano-field" style={{ width: 110 }}>
                <label className="plano-label">Minutos</label>
                <input type="number" className="plano-input" min="1" value={apto.tempo_minutos} onChange={e => setApto(a => ({ ...a, tempo_minutos: e.target.value }))} placeholder="0" />
              </div>
              <div className="plano-field" style={{ width: 150 }}>
                <label className="plano-label">Data</label>
                <input type="date" className="plano-input" value={apto.dt_apontamento} onChange={e => setApto(a => ({ ...a, dt_apontamento: e.target.value }))} />
              </div>
              <div className="plano-field" style={{ flex: 1, minWidth: 150 }}>
                <label className="plano-label">Descrição</label>
                <input className="plano-input" value={apto.descricao} onChange={e => setApto(a => ({ ...a, descricao: e.target.value }))} placeholder="O que foi feito?" />
              </div>
              <button className="plano-btn plano-btn-salvar" onClick={handleApontar} disabled={operating} style={{ marginBottom: 0 }}>
                <Icon><polyline points="20 6 9 17 4 12"/></Icon> Apontar
              </button>
            </div>
          )}
          {(tarefa?.apontamentos || []).length === 0 ? (
            <EmptyState title="Nenhum apontamento registrado." />
          ) : (
            <div className="planos-table-wrapper">
              <table className="planos-table">
                <thead><tr><th>Data</th><th>Tempo</th><th>Usuário</th><th>Descrição</th></tr></thead>
                <tbody>
                  {(tarefa.apontamentos || []).map(a => (
                    <tr key={a.id} className="planos-row">
                      <td className="col-mono" style={{ whiteSpace: 'nowrap' }}>
                        {a.dt_apontamento ? new Date(a.dt_apontamento).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td style={{ fontWeight: 700 }}>{a.tempo_minutos}min</td>
                      <td>{a.usuario_nome || '—'}</td>
                      <td>{a.descricao || '—'}</td>
                    </tr>
                  ))}
                  <tr className="planos-row" style={{ fontWeight: 700 }}>
                    <td>Total</td>
                    <td>{Math.floor(totalMinutos/60)}h{String(totalMinutos%60).padStart(2,'0')}m</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </DetailSection>
      )}

      {/* ── Equipe de apoio ─────────────────────────────────────────────── */}
      {!isNew && (tarefa?.equipe_apoio || []).length > 0 && (
        <DetailSection title="Equipe de Apoio">
          <div className="plano-equipe-grid">
            {(tarefa.equipe_apoio || []).map(m => (
              <div key={m.id} className="plano-equipe-card">
                <span className="plano-equipe-avatar" style={{ background: '#3b82f6' }}>
                  {(m.usuario_nome || '?')[0]?.toUpperCase()}
                </span>
                <span className="plano-equipe-nome">{m.usuario_nome || '—'}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {/* ── Dependências (predecessora → sucessora) ─────────────────────── */}
      {!isNew && (
        <DetailSection title={`Dependências — Predecessoras (${dependencias.length})`}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            Esta tarefa só pode ser iniciada após as predecessoras serem concluídas.
          </div>
          {!isFechada && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                className="plano-input"
                type="number"
                min="1"
                style={{ width: 160 }}
                placeholder="ID da predecessora"
                value={novaDep}
                onChange={e => setNovaDep(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddDep()}
              />
              <button className="plano-btn plano-btn-salvar" onClick={handleAddDep}>+ Vincular</button>
            </div>
          )}
          {dependencias.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhuma predecessora</div>
          ) : (
            dependencias.map(d => {
              const pSt = (d.predecessora_status || '').toUpperCase();
              const concluida = ['CONCLUIDA','CONCLUIDO'].includes(pSt);
              return (
                <div key={d.dep_id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                  borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: concluida ? '#22c55e' : '#f59e0b' }} />
                  <span style={{ flex: 1, fontSize: '0.85rem' }}>
                    #{d.predecessora_id} — {d.predecessora_titulo || '(sem título)'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: concluida ? '#22c55e' : '#f59e0b', flexShrink: 0 }}>
                    {concluida ? 'Concluída' : 'Pendente'}
                  </span>
                  {!isFechada && (
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0 4px' }}
                      onClick={() => handleRemoveDep(d.dep_id)} title="Remover dependência">✕</button>
                  )}
                </div>
              );
            })
          )}
        </DetailSection>
      )}

      {/* ── Subtarefas (hierarquia pai-filho) ───────────────────────────── */}
      {!isNew && (
        <DetailSection title={`Subtarefas (${subtarefas.length})`}>
          {!isFechada && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                className="plano-input"
                style={{ flex: 1 }}
                placeholder="Nova subtarefa..."
                value={novaSubtarefa}
                onChange={e => setNovaSubtarefa(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSubtarefa()}
              />
              <button className="plano-btn plano-btn-salvar" onClick={handleAddSubtarefa} disabled={addingSub}>
                {addingSub ? '...' : '+ Adicionar'}
              </button>
            </div>
          )}
          {subtarefas.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhuma subtarefa</div>
          ) : (
            <div>
              {subtarefas.map(sub => {
                const subSt = (sub.status || 'ABERTA').toUpperCase();
                const stColor = ['CONCLUIDA','CONCLUIDO'].includes(subSt) ? '#22c55e'
                  : subSt === 'EM_ANDAMENTO' ? '#f59e0b' : '#3b82f6';
                return (
                  <div key={sub.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: stColor, flexShrink: 0 }} />
                    <span
                      style={{ flex: 1, fontSize: '0.85rem', cursor: 'pointer', color: 'var(--accent)' }}
                      onClick={() => navigate(`/tarefas/${sub.id}`)}
                      title="Abrir subtarefa"
                    >
                      {sub.titulo}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {STATUS_LABELS[subSt] || subSt}
                    </span>
                    {sub.dt_previsao && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {new Date(sub.dt_previsao).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DetailSection>
      )}
    </div>
  );
}

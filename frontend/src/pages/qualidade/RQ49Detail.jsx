/**
 * APEX pg 319 — RQ49 Visao Geral NO
 * Layout: PlanoDetail pattern with plano-* CSS classes
 * Sections: Info, Descricao, Analise Significancia, Equipe, Anotacoes, Avaliacoes
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { rq49Service } from '../../services/qualidade/rq49Service';
import Modal from '../../components/Modal';
import { StatusBadge, DetailSection, EmptyState } from '../../components/ui';
import { SkeletonPlanoDetail } from '../../components/SkeletonPlanos';
import '../../components/Modal.css';
import '../planos_acao/PlanoDetail.css';
import './RQ49Detail.css';

const AVATAR_COLORS = ['#00A0DF','#4caf50','#ff9800','#9c27b0','#ef4444','#3f51b5','#009688','#795548','#e91e63','#607d8b'];
function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function fmtDate(d) {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString('pt-BR');
}

const STATUS_MAP = {
  ABERTA:       { label: 'Aberta',       bg: 'var(--accent)', color: '#fff' },
  EM_ANALISE:   { label: 'Em An\u00e1lise',  bg: '#ff9800',       color: '#fff' },
  PROCEDENTE:   { label: 'Procedente',   bg: '#4caf50',       color: '#fff' },
  IMPROCEDENTE: { label: 'Improcedente', bg: '#ef4444',       color: '#fff' },
  FECHADA:      { label: 'Fechada',      bg: '#6b7280',       color: '#fff' },
};

const RESULTADO_COLORS = {
  CRITICO:       '#ef4444',
  SIGNIFICATIVO: '#ff9800',
  MODERADO:      '#eab308',
  MENOR:         '#84cc16',
  DESPREZIVEL:   '#6b7280',
};

// Matriz idêntica ao backend APEX FNC_P2_DYNAC_RES_MAT
const MATRIZ = {
  '1,1': 'DESPREZIVEL', '1,2': 'DESPREZIVEL', '1,3': 'MENOR',        '1,4': 'MODERADO',      '1,5': 'SIGNIFICATIVO',
  '2,1': 'DESPREZIVEL', '2,2': 'MENOR',        '2,3': 'MODERADO',     '2,4': 'SIGNIFICATIVO', '2,5': 'SIGNIFICATIVO',
  '3,1': 'MENOR',       '3,2': 'MODERADO',     '3,3': 'MODERADO',     '3,4': 'SIGNIFICATIVO', '3,5': 'CRITICO',
  '4,1': 'MODERADO',    '4,2': 'SIGNIFICATIVO','4,3': 'SIGNIFICATIVO', '4,4': 'CRITICO',       '4,5': 'CRITICO',
  '5,1': 'SIGNIFICATIVO','5,2': 'SIGNIFICATIVO','5,3': 'CRITICO',      '5,4': 'CRITICO',       '5,5': 'CRITICO',
};

const NIVEL_LABELS = ['', 'Muito Baixo', 'Baixo', 'Médio', 'Alto', 'Muito Alto'];

function SignificanciaMatrix({ gravidade, ocorrencia, onSelect, readOnly }) {
  return (
    <div className="sig-matrix-wrap">
      {/* Y-axis label */}
      <div className="sig-axis-y-label">Ocorrência</div>
      <div className="sig-matrix-inner">
        {/* Y-axis ticks */}
        <div className="sig-axis-y">
          {[5,4,3,2,1].map(o => (
            <div key={o} className="sig-axis-tick">{o}</div>
          ))}
        </div>
        {/* Grid */}
        <div className="sig-grid">
          {[5,4,3,2,1].map(o => (
            <div key={o} className="sig-grid-row">
              {[1,2,3,4,5].map(g => {
                const res = MATRIZ[`${g},${o}`] || 'DESPREZIVEL';
                const bg = RESULTADO_COLORS[res];
                const isSelected = g === Number(gravidade) && o === Number(ocorrencia);
                return (
                  <button
                    key={g}
                    className={`sig-cell${isSelected ? ' sig-cell-selected' : ''}`}
                    style={{ background: bg + (isSelected ? '' : 'aa') }}
                    title={`Gravidade ${g} × Ocorrência ${o} = ${res}`}
                    onClick={() => !readOnly && onSelect(g, o)}
                    type="button"
                  >
                    {isSelected && <span className="sig-cell-dot" />}
                  </button>
                );
              })}
            </div>
          ))}
          {/* X-axis ticks */}
          <div className="sig-axis-x">
            {[1,2,3,4,5].map(g => (
              <div key={g} className="sig-axis-tick">{g}</div>
            ))}
          </div>
        </div>
      </div>
      {/* X-axis label */}
      <div className="sig-axis-x-label">Gravidade</div>
      {/* Legend */}
      <div className="sig-legend">
        {Object.entries(RESULTADO_COLORS).map(([label, color]) => (
          <span key={label} className="sig-legend-item">
            <span className="sig-legend-dot" style={{ background: color }} />
            {label.charAt(0) + label.slice(1).toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RQ49Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [rq, setRq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newAnot, setNewAnot] = useState('');
  const [anotError, setAnotError] = useState(false);
  const [operating, setOperating] = useState(false);
  // Modal avaliacao (pg 331)
  const [modalAval, setModalAval] = useState(false);
  const [avalForm, setAvalForm] = useState({ avaliacao: '', nota: '', eficaz: '', acao_tomada: '' });
  const [analiseTexto, setAnaliseTexto] = useState('');
  const [analiseEditing, setAnaliseEditing] = useState(false);
  const [savingAnalise, setSavingAnalise] = useState(false);
  const [projetos, setProjetos] = useState([]);
  const [modalPrj, setModalPrj] = useState(false);
  const [prjSearch, setPrjSearch] = useState('');
  const [prjResults, setPrjResults] = useState([]);
  const [tarefas, setTarefas] = useState([]);
  const [modalTar, setModalTar] = useState(false);
  const [tarSearch, setTarSearch] = useState('');
  const [tarResults, setTarResults] = useState([]);
  const [anexos, setAnexos] = useState([]);
  const [uploadingAnx, setUploadingAnx] = useState(false);
  const [anxLegenda, setAnxLegenda] = useState('');
  const [implTexto, setImplTexto] = useState('');
  const [implEditing, setImplEditing] = useState(false);
  const [savingImpl, setSavingImpl] = useState(false);
  const [verifTexto, setVerifTexto] = useState('');
  const [verifEditing, setVerifEditing] = useState(false);
  const [savingVerif, setSavingVerif] = useState(false);

  const fetchData = async () => {
    try {
      const { data } = await rq49Service.obter(id);
      setRq(data);
    } catch { toast.error('Erro ao carregar RQ49'); navigate('/qualidade/rq49'); }
    finally { setLoading(false); }
  };

  const fetchProjetos = async () => {
    try { const { data } = await rq49Service.listarProjetos(id); setProjetos(data.items || []); }
    catch {}
  };

  const handleSearchPrj = async (q) => {
    setPrjSearch(q);
    if (q.length < 2) { setPrjResults([]); return; }
    try { const { data } = await rq49Service.buscarProjetos(q); setPrjResults(data); }
    catch {}
  };

  const handleAssociarPrj = async (prjId) => {
    try {
      await rq49Service.associarProjeto(id, { hgr_prj_cad_prj_id: prjId });
      toast.success('Projeto associado');
      setModalPrj(false);
      setPrjSearch('');
      setPrjResults([]);
      fetchProjetos();
    } catch { toast.error('Erro ao associar projeto'); }
  };

  const handleDesassociarPrj = async (regId) => {
    try {
      await rq49Service.desassociarProjeto(id, regId);
      toast.success('Projeto desassociado');
      fetchProjetos();
    } catch { toast.error('Erro ao desassociar'); }
  };

  const fetchTarefas = async () => {
    try { const { data } = await rq49Service.listarTarefas(id); setTarefas(data.items || []); }
    catch {}
  };

  const handleSearchTar = async (q) => {
    setTarSearch(q);
    if (q.length < 2) { setTarResults([]); return; }
    try { const { data } = await rq49Service.buscarTarefas(q); setTarResults(data); }
    catch {}
  };

  const handleAssociarTar = async (tarId) => {
    try {
      await rq49Service.associarTarefa(id, { sth_com_reg_tar_id: tarId });
      toast.success('Tarefa associada');
      setModalTar(false);
      setTarSearch('');
      setTarResults([]);
      fetchTarefas();
    } catch { toast.error('Erro ao associar tarefa'); }
  };

  const handleDesassociarTar = async (regId) => {
    try {
      await rq49Service.desassociarTarefa(id, regId);
      toast.success('Tarefa desassociada');
      fetchTarefas();
    } catch { toast.error('Erro ao desassociar'); }
  };

  const fetchAnexos = async () => {
    try { const { data } = await rq49Service.listarAnexos(id, 'GRAFICO'); setAnexos(data.items || []); }
    catch {}
  };

  const handleUploadGrafico = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tipo', 'GRAFICO');
    fd.append('titulo', file.name);
    fd.append('legenda', anxLegenda);
    setUploadingAnx(true);
    try {
      await rq49Service.uploadAnexo(id, fd);
      toast.success('Gráfico enviado');
      setAnxLegenda('');
      fetchAnexos();
    } catch { toast.error('Erro ao enviar gráfico'); }
    finally { setUploadingAnx(false); e.target.value = ''; }
  };

  const handleDeleteAnexo = async (anxId) => {
    try {
      await rq49Service.deleteAnexo(id, anxId);
      toast.success('Gráfico removido');
      fetchAnexos();
    } catch { toast.error('Erro ao remover'); }
  };

  useEffect(() => { fetchData(); fetchProjetos(); fetchTarefas(); fetchAnexos(); }, [id]);

  if (loading) return <SkeletonPlanoDetail />;
  if (!rq) return null;

  const handleAddAnot = async () => {
    if (!newAnot.trim()) { setAnotError(true); return; }
    if (operating) return;
    setOperating(true);
    try {
      await rq49Service.addAnotacao(id, { descricao: newAnot });
      setNewAnot(''); setAnotError(false); fetchData();
    } catch { toast.error('Erro ao adicionar anotação'); }
    finally { setOperating(false); }
  };

  const handleAddAval = async () => {
    try {
      await rq49Service.addAvaliacao(id, {
        ...avalForm,
        nota: avalForm.nota ? Number(avalForm.nota) : null,
        dt_avaliacao: new Date().toISOString().split('T')[0],
      });
      toast.success('Avalia\u00e7\u00e3o registrada');
      setModalAval(false);
      setAvalForm({ avaliacao: '', nota: '', eficaz: '', acao_tomada: '' });
      fetchData();
    } catch { toast.error('Erro ao salvar avalia\u00e7\u00e3o'); }
  };

  const handleSaveAnalise = async () => {
    setSavingAnalise(true);
    try {
      await rq49Service.atualizar(id, { analise: analiseTexto });
      toast.success('Análise salva');
      setAnaliseEditing(false);
      fetchData();
    } catch { toast.error('Erro ao salvar análise'); }
    finally { setSavingAnalise(false); }
  };

  const handleStatusChange = async (novoStatus) => {
    try {
      await rq49Service.atualizar(id, { status: novoStatus });
      toast.success(`Status alterado para ${novoStatus}`);
      fetchData();
    } catch { toast.error('Erro ao alterar status'); }
  };

  const handleSaveImpl = async () => {
    setSavingImpl(true);
    try {
      await rq49Service.atualizar(id, { implementacao: implTexto });
      toast.success('Implementação salva');
      setImplEditing(false);
      fetchData();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSavingImpl(false); }
  };

  const handleSaveVerif = async () => {
    setSavingVerif(true);
    try {
      await rq49Service.atualizar(id, { verificacao_final: verifTexto });
      toast.success('Verificação final salva');
      setVerifEditing(false);
      fetchData();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSavingVerif(false); }
  };

  const handleSignificancia = async (g, o) => {
    try {
      await rq49Service.analiseSignificancia(id, { gravidade: g, ocorrencia: o });
      fetchData();
    } catch { toast.error('Erro ao salvar análise de significância'); }
  };

  const statusKey = (rq.status || 'ABERTA').toUpperCase().replace('-', '_');
  const statusInfo = STATUS_MAP[statusKey] || STATUS_MAP.ABERTA;

  return (
    <div className="plano-detail">
      {/* Header */}
      <div className="plano-header-card">
        <div className="plano-header-left">
          <div className="plano-breadcrumb-text">
            <a onClick={() => navigate('/qualidade/rq49')} style={{ cursor: 'pointer' }}>Notas de Oportunidade</a>
            {' / '}{rq.codigo || `NO-${rq.id}`}
          </div>
          <div className="plano-header-title-row">
            <h2 className="plano-title">{rq.codigo || `NO-${rq.id}`}</h2>
            <span className="plano-status-badge" style={{ background: statusInfo.bg, color: statusInfo.color, borderRadius: 12, padding: '3px 12px', fontSize: '0.78rem', fontWeight: 700 }}>
              {statusInfo.label}
            </span>
          </div>
        </div>
        <div className="plano-header-right">
          <button className="plano-btn plano-btn-voltar" onClick={() => navigate('/qualidade/rq49')}>
            ← Voltar
          </button>
        </div>
      </div>

      {/* Info section */}
      <DetailSection title="Informações">
        <div className="plano-row" style={{ flexWrap: 'wrap' }}>
          <div className="plano-field">
            <label className="plano-label">C\u00f3digo</label>
            <input className="plano-input" readOnly value={rq.codigo || `NO-${rq.id}`} />
          </div>
          <div className="plano-field">
            <label className="plano-label">Data Abertura</label>
            <input className="plano-input" readOnly value={fmtDate(rq.dt_abertura)} />
          </div>
          <div className="plano-field">
            <label className="plano-label">Origem</label>
            <input className="plano-input" readOnly value={rq.origem || '\u2014'} />
          </div>
        </div>
        <div className="plano-row" style={{ flexWrap: 'wrap' }}>
          <div className="plano-field">
            <label className="plano-label">Classifica\u00e7\u00e3o</label>
            <input className="plano-input" readOnly value={rq.classificacao || '\u2014'} />
          </div>
          <div className="plano-field">
            <label className="plano-label">Resultado An\u00e1lise</label>
            <input className="plano-input" readOnly value={rq.result_analise || '\u2014'} />
          </div>
          <div className="plano-field">
            <label className="plano-label">Respons\u00e1vel</label>
            <input className="plano-input" readOnly value={rq.responsavel_nome || '\u2014'} />
          </div>
        </div>
        <div className="plano-field" style={{ marginTop: 4 }}>
          <label className="plano-label">Status</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={statusKey} label={statusInfo.label} />
            <select
              className="plano-input"
              style={{ maxWidth: 180, fontSize: '0.82rem' }}
              value={statusKey}
              onChange={e => handleStatusChange(e.target.value)}
            >
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
      </DetailSection>

      {/* Descricao section */}
      {rq.descricao && (
        <DetailSection title="Descrição">
          <textarea className="plano-input" readOnly rows={4} value={rq.descricao} />
        </DetailSection>
      )}

      {/* Análise da NO */}
      <DetailSection title="Análise" actions={
        !analiseEditing ? (
          <button className="plano-btn-participante" onClick={() => { setAnaliseTexto(rq.analise || ''); setAnaliseEditing(true); }}>Editar</button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="plano-btn-participante" onClick={handleSaveAnalise} disabled={savingAnalise}>{savingAnalise ? '...' : 'Salvar'}</button>
            <button className="plano-btn plano-btn-voltar" onClick={() => setAnaliseEditing(false)} style={{ fontSize: '0.78rem' }}>Cancelar</button>
          </div>
        )
      }>
        {analiseEditing ? (
          <textarea
            className="plano-input"
            rows={6}
            value={analiseTexto}
            onChange={e => setAnaliseTexto(e.target.value)}
            placeholder="Descreva a análise da nota de oportunidade..."
            autoFocus
          />
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem', color: rq.analise ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: rq.analise ? 'normal' : 'italic', minHeight: 40, padding: '8px 0' }}>
            {rq.analise || 'Nenhuma análise registrada. Clique em "Editar" para adicionar.'}
          </div>
        )}
      </DetailSection>

      {/* Analise de Significancia */}
      <DetailSection title="Análise de Significância">
        <SignificanciaMatrix
          gravidade={rq.gravidade}
          ocorrencia={rq.ocorrencia}
          onSelect={handleSignificancia}
        />
        {rq.result_analise && (
          <div style={{
            marginTop: 12, padding: '8px 16px', borderRadius: 8, textAlign: 'center',
            fontWeight: 700, fontSize: '0.88rem', display: 'inline-block',
            background: RESULTADO_COLORS[rq.result_analise] || '#6b7280', color: '#fff',
          }}>
            Resultado: {rq.result_analise.charAt(0) + rq.result_analise.slice(1).toLowerCase()}
          </div>
        )}
      </DetailSection>

      {/* Implementação (tarefa 278) */}
      <DetailSection title="Implementação" actions={
        !implEditing ? (
          <button className="plano-btn-participante" onClick={() => { setImplTexto(rq.implementacao || ''); setImplEditing(true); }}>Editar</button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="plano-btn-participante" onClick={handleSaveImpl} disabled={savingImpl}>{savingImpl ? '...' : 'Salvar'}</button>
            <button className="plano-btn plano-btn-voltar" onClick={() => setImplEditing(false)} style={{ fontSize: '0.78rem' }}>Cancelar</button>
          </div>
        )
      }>
        {implEditing ? (
          <textarea className="plano-input" rows={5} value={implTexto} onChange={e => setImplTexto(e.target.value)} placeholder="Descreva a implementação da oportunidade de melhoria..." autoFocus />
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem', color: rq.implementacao ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: rq.implementacao ? 'normal' : 'italic', minHeight: 40, padding: '8px 0' }}>
            {rq.implementacao || 'Nenhuma implementação registrada.'}
          </div>
        )}
      </DetailSection>

      {/* Verificação Final (tarefa 278) */}
      <DetailSection title="Verificação de Eficácia" actions={
        !verifEditing ? (
          <button className="plano-btn-participante" onClick={() => { setVerifTexto(rq.verificacao_final || ''); setVerifEditing(true); }}>Editar</button>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="plano-btn-participante" onClick={handleSaveVerif} disabled={savingVerif}>{savingVerif ? '...' : 'Salvar'}</button>
            <button className="plano-btn plano-btn-voltar" onClick={() => setVerifEditing(false)} style={{ fontSize: '0.78rem' }}>Cancelar</button>
          </div>
        )
      }>
        {verifEditing ? (
          <textarea className="plano-input" rows={5} value={verifTexto} onChange={e => setVerifTexto(e.target.value)} placeholder="Descreva a verificação de eficácia..." autoFocus />
        ) : (
          <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem', color: rq.verificacao_final ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: rq.verificacao_final ? 'normal' : 'italic', minHeight: 40, padding: '8px 0' }}>
            {rq.verificacao_final || 'Nenhuma verificação registrada.'}
          </div>
        )}
      </DetailSection>

      {/* Gráficos / Anexos (tarefa 277) */}
      <DetailSection title={`Gráficos (${anexos.length})`}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Legenda</label>
            <input className="plano-input" placeholder="Legenda do gráfico (opcional)" value={anxLegenda} onChange={e => setAnxLegenda(e.target.value)} />
          </div>
          <label htmlFor="grafico-upload" style={{ fontSize: 12, padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', cursor: uploadingAnx ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            {uploadingAnx ? 'Enviando...' : '+ Upload Gráfico'}
          </label>
          <input id="grafico-upload" type="file" accept="image/png,image/svg+xml,image/jpeg,application/pdf" style={{ display: 'none' }} onChange={handleUploadGrafico} disabled={uploadingAnx} />
        </div>
        {anexos.length === 0 ? (
          <EmptyState title="Nenhum gráfico anexado." />
        ) : (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {anexos.map(anx => (
              <div key={anx.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10, minWidth: 180, maxWidth: 260 }}>
                {anx.mimetype?.startsWith('image/') ? (
                  <img src={rq49Service.anexoImagemUrl(id, anx.id)} alt={anx.titulo} style={{ width: '100%', borderRadius: 5, marginBottom: 6, maxHeight: 160, objectFit: 'contain', background: '#fff' }} />
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, padding: 12, textAlign: 'center' }}>📄 {anx.filename}</div>
                )}
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{anx.titulo || anx.filename}</div>
                {anx.legenda && <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: 3 }}>{anx.legenda}</div>}
                <button onClick={() => handleDeleteAnexo(anx.id)} style={{ marginTop: 6, fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Remover</button>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      {/* Projetos associados (tarefa 275) */}
      <DetailSection title={`Projetos (${projetos.length})`} actions={<button className="plano-btn-participante" onClick={() => setModalPrj(true)}>+ Associar Projeto</button>}>
        {projetos.length === 0 ? (
          <EmptyState title="Nenhum projeto associado." />
        ) : (
          projetos.map(p => (
            <div key={p.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 8,
            }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{p.codigo || `PRJ-${p.hgr_prj_cad_prj_id}`}</span>
                <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>—</span>
                <span style={{ fontSize: '0.85rem' }}>{p.titulo || ''}</span>
                {p.status && <span style={{ marginLeft: 8, fontSize: '0.75rem', padding: '2px 8px', borderRadius: 10, background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>{p.status}</span>}
              </div>
              <button onClick={() => handleDesassociarPrj(p.id)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Remover</button>
            </div>
          ))
        )}
      </DetailSection>

      {/* Modal buscar projeto */}
      <Modal open={modalPrj} onClose={() => { setModalPrj(false); setPrjSearch(''); setPrjResults([]); }} title="Associar Projeto">
        <div className="form-group">
          <label>Buscar projeto</label>
          <input className="form-control" placeholder="Digite titulo ou codigo..." value={prjSearch} onChange={e => handleSearchPrj(e.target.value)} autoFocus />
        </div>
        {prjResults.length > 0 && (
          <div style={{ maxHeight: 250, overflowY: 'auto' }}>
            {prjResults.map(p => (
              <div key={p.id} onClick={() => handleAssociarPrj(p.id)} style={{
                padding: '10px 12px', cursor: 'pointer', borderRadius: 6, marginBottom: 4,
                border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
              }}>
                <span style={{ fontWeight: 600 }}>{p.codigo || `PRJ-${p.id}`}</span>
                <span style={{ margin: '0 8px', color: 'var(--text-muted)' }}>—</span>
                <span>{p.titulo}</span>
              </div>
            ))}
          </div>
        )}
        {prjSearch.length >= 2 && prjResults.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 8 }}>Nenhum projeto encontrado.</div>
        )}
      </Modal>

      {/* Tarefas associadas (tarefa 276) */}
      <DetailSection title={`Tarefas (${tarefas.length})`} actions={<button className="plano-btn-participante" onClick={() => setModalTar(true)}>+ Associar Tarefa</button>}>
        {tarefas.length === 0 ? (
          <EmptyState title="Nenhuma tarefa associada." />
        ) : (
          tarefas.map(t => (
            <div key={t.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 8,
            }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t.titulo}</span>
                {t.status && <span style={{ marginLeft: 8, fontSize: '0.75rem', padding: '2px 8px', borderRadius: 10, background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>{t.status}</span>}
                {t.responsavel_nome && <span style={{ marginLeft: 8, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t.responsavel_nome}</span>}
                {t.dt_prazo && <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Prazo: {fmtDate(t.dt_prazo)}</span>}
              </div>
              <button onClick={() => handleDesassociarTar(t.id)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Remover</button>
            </div>
          ))
        )}
      </DetailSection>

      {/* Modal buscar tarefa */}
      <Modal open={modalTar} onClose={() => { setModalTar(false); setTarSearch(''); setTarResults([]); }} title="Associar Tarefa">
        <div className="form-group">
          <label>Buscar tarefa</label>
          <input className="form-control" placeholder="Digite titulo..." value={tarSearch} onChange={e => handleSearchTar(e.target.value)} autoFocus />
        </div>
        {tarResults.length > 0 && (
          <div style={{ maxHeight: 250, overflowY: 'auto' }}>
            {tarResults.map(t => (
              <div key={t.id} onClick={() => handleAssociarTar(t.id)} style={{
                padding: '10px 12px', cursor: 'pointer', borderRadius: 6, marginBottom: 4,
                border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
              }}>
                <span style={{ fontWeight: 600 }}>{t.titulo}</span>
                {t.status && <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.status}</span>}
                {t.responsavel_nome && <span style={{ marginLeft: 8, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t.responsavel_nome}</span>}
              </div>
            ))}
          </div>
        )}
        {tarSearch.length >= 2 && tarResults.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 8 }}>Nenhuma tarefa encontrada.</div>
        )}
      </Modal>

      {/* Equipe section */}
      <DetailSection title={`Equipe (${(rq.equipe || []).length})`}>
        <div className="plano-equipe-grid">
          {(rq.equipe || []).length === 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>Nenhum participante</span>
          )}
          {(rq.equipe || []).map(p => (
            <div key={p.id} className="plano-equipe-card">
              <span className="plano-equipe-avatar" style={{ background: avatarColor(p.usuario_nome) }}>
                {(p.usuario_nome || '?')[0].toUpperCase()}
              </span>
              <span className="plano-equipe-nome">{p.usuario_nome || `User #${p.usuario_id}`}</span>
            </div>
          ))}
        </div>
      </DetailSection>

      {/* Anotacoes section */}
      <DetailSection title={`Anotações (${(rq.anotacoes || []).length})`}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className={`plano-input${anotError ? ' input-error' : ''}`}
              placeholder="Nova anotação..."
              value={newAnot}
              onChange={e => { setNewAnot(e.target.value); if (anotError) setAnotError(false); }}
              onKeyDown={e => e.key === 'Enter' && handleAddAnot()}
              style={{ flex: 1 }}
            />
            <button className="plano-btn-participante" onClick={handleAddAnot} disabled={operating}>
              {operating ? '...' : 'Adicionar'}
            </button>
          </div>
          {anotError && <span className="plano-field-error">Digite o texto da anotação</span>}
        </div>
        {(rq.anotacoes || []).length === 0 && (
          <EmptyState title="Nenhuma anotação registrada." />
        )}
        {(rq.anotacoes || []).map(a => (
          <div key={a.id} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 8, padding: 12, marginBottom: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span>{a.autor || '\u2014'}</span>
              <span>{fmtDate(a.created_at)}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{a.descricao}</div>
          </div>
        ))}
      </DetailSection>

      {/* Avaliacoes section */}
      <DetailSection title={`Avaliações (${(rq.avaliacoes || []).length})`} actions={<button className="plano-btn-participante" onClick={() => setModalAval(true)}>+ Nova Avaliação</button>}>
        {(rq.avaliacoes || []).length === 0 && (
          <EmptyState title="Nenhuma avaliação registrada." />
        )}
        {(rq.avaliacoes || []).map(a => (
          <div key={a.id} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 8, padding: 12, marginBottom: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Nota: {a.nota || '\u2014'}/10</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{fmtDate(a.dt_avaliacao)}</span>
            </div>
            <div style={{ fontSize: '0.85rem', marginBottom: 4 }}>{a.avaliacao || '\u2014'}</div>
            {a.acao_tomada && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>A\u00e7\u00e3o tomada: {a.acao_tomada}</div>}
            <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
              Eficaz: <span style={{ fontWeight: 600, color: a.eficaz === 'S' ? '#4caf50' : a.eficaz === 'N' ? '#ef4444' : 'var(--text-muted)' }}>
                {a.eficaz === 'S' ? 'Sim' : a.eficaz === 'N' ? 'N\u00e3o' : '\u2014'}
              </span>
            </div>
          </div>
        ))}
      </DetailSection>

      {/* Modal Avaliacao - APEX pg 331 */}
      <Modal open={modalAval} onClose={() => setModalAval(false)} title="Avalia\u00e7\u00e3o de Efic\u00e1cia"
        footer={<><button className="btn-secondary" onClick={() => setModalAval(false)}>Cancelar</button><button className="btn-primary" onClick={handleAddAval}>Salvar</button></>}>
        <div className="form-group"><label>Avalia\u00e7\u00e3o</label><textarea className="form-control" rows={4} value={avalForm.avaliacao} onChange={e => setAvalForm(f => ({ ...f, avaliacao: e.target.value }))} /></div>
        <div className="form-row">
          <div className="form-group"><label>Nota (1-10)</label><input type="number" min="1" max="10" className="form-control" value={avalForm.nota} onChange={e => setAvalForm(f => ({ ...f, nota: e.target.value }))} /></div>
          <div className="form-group"><label>Eficaz?</label>
            <select className="form-control" value={avalForm.eficaz} onChange={e => setAvalForm(f => ({ ...f, eficaz: e.target.value }))}>
              <option value="">Selecione...</option><option value="S">Sim</option><option value="N">N\u00e3o</option>
            </select>
          </div>
        </div>
        <div className="form-group"><label>A\u00e7\u00e3o Tomada</label><textarea className="form-control" value={avalForm.acao_tomada} onChange={e => setAvalForm(f => ({ ...f, acao_tomada: e.target.value }))} /></div>
      </Modal>
    </div>
  );
}

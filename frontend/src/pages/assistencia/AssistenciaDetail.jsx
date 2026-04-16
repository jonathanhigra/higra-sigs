/**
 * APEX pg 383 — Visão Geral de Atendimento
 * Layout: Left sidebar (Info Card) + Main (Tabs)
 * Tabs: Dados, Equipamentos, Anexos, Equipe, Laudos, Checklists, Negócios vinculados
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { atendimentoService } from '../../services/assistencia/atendimentoService';
import { Breadcrumbs, RelativeTime, CopyButton } from '../../components/ui';
import Modal from '../../components/Modal';
import ImageLightbox from '../../components/ImageLightbox';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

function SlaTimer({ dtAbertura, dtFechamento }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!dtAbertura) return;
    const start = new Date(dtAbertura).getTime();
    const end = dtFechamento ? new Date(dtFechamento).getTime() : null;
    function calc() { return Math.floor(((end || Date.now()) - start) / 1000); }
    setElapsed(calc());
    if (dtFechamento) return;
    const id = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(id);
  }, [dtAbertura, dtFechamento]);

  if (!dtAbertura) return null;
  const days  = Math.floor(elapsed / 86400);
  const hours = Math.floor((elapsed % 86400) / 3600);
  const mins  = Math.floor((elapsed % 3600) / 60);
  const secs  = elapsed % 60;
  const label = days > 0
    ? `${days}d ${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}`
    : `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  const color = dtFechamento ? '#6c757d' : days <= 1 ? '#22c55e' : days <= 3 ? '#f59e0b' : '#ef4444';
  const bg = color + '18';
  return (
    <span title={`Tempo decorrido desde abertura${dtFechamento ? ' (fechado)' : ''}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${color}`,
      background: bg, color, fontWeight: 700, fontFamily: 'monospace', fontSize: '0.78rem',
      letterSpacing: '0.03em',
    }}>
      ⏱ {label}{dtFechamento ? '' : ' ▶'}
    </span>
  );
}

const MIME_ICONS = {
  'application/pdf': '📄',
  'image/png': '🖼',
  'image/jpeg': '🖼',
  'image/jpg': '🖼',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/msword': '📝',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
};
const mimeIcon = (mimetype) => MIME_ICONS[mimetype] || '📎';
const isImage = (mimetype) => mimetype && mimetype.startsWith('image/');

export default function AssistenciaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [atn, setAtn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dados');
  const [clienteHist, setClienteHist] = useState([]);
  const [clienteHistLoading, setClienteHistLoading] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ tipo: '' });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const EQP_INIT = { equipamento: '', nr_serie: '', modelo: '', dados_tecnicos: '', motivo: '' };
  const [eqpModal, setEqpModal] = useState(false);
  const [eqpForm, setEqpForm] = useState(EQP_INIT);
  const [savingEqp, setSavingEqp] = useState(false);
  const LAU_INIT = { equipamento: '', n_serie: '', n_motor: '', modelo: '', reclamacao: '', observacoes: '', solucao: '', of_os: '', dt_falha: '', dt_entrada: '' };
  const [laudoModal, setLaudoModal] = useState(false);
  const [laudoForm, setLaudoForm] = useState(LAU_INIT);
  const [savingLaudo, setSavingLaudo] = useState(false);
  const [editingAntId, setEditingAntId] = useState(null);
  const [editingAntText, setEditingAntText] = useState('');
  const [negModal, setNegModal] = useState(false);
  const [negCrmId, setNegCrmId] = useState('');
  const [savingNeg, setSavingNeg] = useState(false);
  const [assocLaudoModal, setAssocLaudoModal] = useState(false);
  const [laudoBusca, setLaudoBusca] = useState('');
  const [laudosEncontrados, setLaudosEncontrados] = useState([]);
  const [laudoSelecionado, setLaudoSelecionado] = useState(null);
  const [savingAssocLaudo, setSavingAssocLaudo] = useState(false);
  const [assocCklModal, setAssocCklModal] = useState(false);
  const [cklBusca, setCklBusca] = useState('');
  const [cklEncontrados, setCklEncontrados] = useState([]);
  const [cklSelecionado, setCklSelecionado] = useState(null);
  const [savingAssocCkl, setSavingAssocCkl] = useState(false);
  const [empresaModal, setEmpresaModal] = useState(false);
  const [empresaBusca, setEmpresaBusca] = useState('');
  const [empresasEncontradas, setEmpresasEncontradas] = useState([]);
  const [empresaSelecionada, setEmpresaSelecionada] = useState(null);
  const [filialSelecionada, setFilialSelecionada] = useState('');
  const [savingEmpresa, setSavingEmpresa] = useState(false);
  const [partModal, setPartModal] = useState(false);
  const [partUserId, setPartUserId] = useState('');
  const [partFilialId, setPartFilialId] = useState('');
  const [savingPart, setSavingPart] = useState(false);
  const [partBusca, setPartBusca] = useState('');
  const [partUsuarios, setPartUsuarios] = useState([]);
  const [partSelecionado, setPartSelecionado] = useState(null);
  const [unidadeModal, setUnidadeModal] = useState(false);
  const [unidades, setUnidades] = useState([]);
  const [unidadeSelecionada, setUnidadeSelecionada] = useState('');
  const [savingUnidade, setSavingUnidade] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [rams, setRams] = useState([]);
  const [ramModal, setRamModal] = useState(false);
  const [ramId, setRamId] = useState('');
  const [ramDesc, setRamDesc] = useState('');
  const [savingRam, setSavingRam] = useState(false);
  const [atividades, setAtividades] = useState([]);
  const [ativModal, setAtivModal] = useState(false);
  const ATIV_INIT = { descricao: '', hgr_ass_cad_tp_ativ_id: '', status: 'PENDENTE', dt_prevista: '' };
  const [ativForm, setAtivForm] = useState(ATIV_INIT);
  const [savingAtiv, setSavingAtiv] = useState(false);
  const [tiposAtiv, setTiposAtiv] = useState([]);
  const [relacionados, setRelacionados] = useState([]);
  const [relModal, setRelModal] = useState(false);
  const [relBusca, setRelBusca] = useState('');
  const [relResultados, setRelResultados] = useState([]);
  const [relSelecionado, setRelSelecionado] = useState(null);
  const [relTipo, setRelTipo] = useState('RELACIONADO');
  const [savingRel, setSavingRel] = useState(false);
  const [vinculosExt, setVinculosExt] = useState([]);
  const [vinculoExtModal, setVinculoExtModal] = useState(false);
  const [vinculoExtForm, setVinculoExtForm] = useState({ ref_tipo: 'CHM', ref_id: '' });
  const [savingVinculoExt, setSavingVinculoExt] = useState(false);
  const [pecas, setPecas] = useState([]);
  const [pecaModal, setPecaModal] = useState(false);
  const PECA_INIT = { codigo: '', descricao: '', quantidade: 1, unidade: 'UN', valor_unit: '', observacao: '' };
  const [pecaForm, setPecaForm] = useState(PECA_INIT);
  const [savingPeca, setSavingPeca] = useState(false);
  const [custoResumo, setCustoResumo] = useState(null);
  const [autorizacaoModal, setAutorizacaoModal] = useState(false);
  const [autorizacaoObs, setAutorizacaoObs] = useState('');
  const [savingAutorizacao, setSavingAutorizacao] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const fetchData = async () => {
    try {
      const { data } = await atendimentoService.obter(id);
      setAtn(data);
    } catch {
      toast.error('Erro ao carregar atendimento');
      navigate('/assistencia');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelacionados = async () => {
    try {
      const { data } = await atendimentoService.listarRelacionados(id);
      setRelacionados(data);
    } catch { setRelacionados([]); }
  };

  const fetchAtividades = async () => {
    try {
      const { data } = await atendimentoService.listarAtividades(id);
      setAtividades(data);
    } catch { setAtividades([]); }
  };

  const fetchRams = async () => {
    try {
      const { data } = await atendimentoService.listarRams(id);
      setRams(data);
    } catch { setRams([]); }
  };

  const fetchVinculosExt = async () => {
    try {
      const { data } = await atendimentoService.listarVinculosExt(id);
      setVinculosExt(data);
    } catch { setVinculosExt([]); }
  };

  const handleCriarVinculoExt = async () => {
    if (!vinculoExtForm.ref_id) { toast.error('ID obrigatório'); return; }
    setSavingVinculoExt(true);
    try {
      await atendimentoService.criarVinculoExt(id, { ...vinculoExtForm, ref_id: Number(vinculoExtForm.ref_id) });
      toast.success('Vínculo criado');
      setVinculoExtModal(false);
      fetchVinculosExt();
    } catch { toast.error('Erro ao criar vínculo'); }
    finally { setSavingVinculoExt(false); }
  };

  const handleRemoverVinculoExt = async (vincId) => {
    if (!window.confirm('Remover este vínculo?')) return;
    try {
      await atendimentoService.removerVinculoExt(id, vincId);
      toast.success('Vínculo removido');
      fetchVinculosExt();
    } catch { toast.error('Erro ao remover vínculo'); }
  };

  const fetchPecas = async () => {
    try {
      const { data } = await atendimentoService.listarPecas(id);
      setPecas(data);
      const { data: resumo } = await atendimentoService.custoResumo(id);
      setCustoResumo(resumo);
    } catch { setPecas([]); }
  };

  const handleAdicionarPeca = async () => {
    if (!pecaForm.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSavingPeca(true);
    try {
      await atendimentoService.adicionarPeca(id, {
        ...pecaForm,
        quantidade: parseFloat(pecaForm.quantidade) || 1,
        valor_unit: pecaForm.valor_unit ? parseFloat(pecaForm.valor_unit) : null,
      });
      toast.success('Peça adicionada');
      setPecaModal(false);
      setPecaForm(PECA_INIT);
      fetchPecas();
    } catch { toast.error('Erro ao adicionar peça'); }
    finally { setSavingPeca(false); }
  };

  const handleRemoverPeca = async (pecaId) => {
    if (!window.confirm('Remover esta peça?')) return;
    try {
      await atendimentoService.removerPeca(id, pecaId);
      toast.success('Peça removida');
      fetchPecas();
    } catch { toast.error('Erro ao remover peça'); }
  };

  const handleSolicitarAutorizacao = async () => {
    setSavingAutorizacao(true);
    try {
      const { data } = await atendimentoService.solicitarAutorizacao(id, { obs: autorizacaoObs });
      setAtn(a => ({ ...a, autorizacao_status: data.autorizacao_status, autorizacao_obs: data.autorizacao_obs }));
      toast.success('Autorização solicitada');
      setAutorizacaoModal(false);
    } catch { toast.error('Erro ao solicitar autorização'); }
    finally { setSavingAutorizacao(false); }
  };

  useEffect(() => { fetchData(); fetchRelacionados(); fetchAtividades(); fetchRams(); fetchPecas(); fetchVinculosExt(); }, [id]);

  const openUnidadeModal = async () => {
    if (unidades.length === 0) {
      try {
        const { data } = await atendimentoService.buscarEmpresas('');
        const all = data.flatMap(e => (e.filiais || []).filter(Boolean).map(f => ({ ...f, empresa: e.descricao })));
        setUnidades(all);
      } catch { toast.error('Erro ao carregar unidades'); return; }
    }
    setUnidadeSelecionada(atn.sth_cad_filial_id?.toString() || '');
    setUnidadeModal(true);
  };

  const handleSaveUnidade = async () => {
    if (!unidadeSelecionada) { toast.error('Selecione uma unidade'); return; }
    setSavingUnidade(true);
    try {
      await atendimentoService.patchAtendimento(id, { sth_cad_filial_id: Number(unidadeSelecionada) });
      toast.success('Unidade atualizada');
      setUnidadeModal(false);
      fetchData();
    } catch { toast.error('Erro ao atualizar unidade'); }
    finally { setSavingUnidade(false); }
  };

  const handleBuscarRelAtendimento = async (q) => {
    setRelBusca(q);
    setRelSelecionado(null);
    if (q.length < 2) { setRelResultados([]); return; }
    try {
      const { data } = await atendimentoService.listar({ q, per_page: 15 });
      setRelResultados((data.items || []).filter(a => a.id !== Number(id)));
    } catch { setRelResultados([]); }
  };

  const handleVincularAtendimento = async () => {
    if (!relSelecionado) { toast.error('Selecione um atendimento'); return; }
    setSavingRel(true);
    try {
      await atendimentoService.vincularAtendimento(id, { atn_rel_id: relSelecionado.id, tipo_rel: relTipo });
      toast.success('Atendimento vinculado');
      setRelModal(false);
      setRelBusca(''); setRelResultados([]); setRelSelecionado(null);
      fetchRelacionados();
    } catch { toast.error('Erro ao vincular atendimento'); }
    finally { setSavingRel(false); }
  };

  const handleDesvincularAtendimento = async (relId, titulo) => {
    if (!window.confirm(`Desvincular ${titulo || 'atendimento'}?`)) return;
    try {
      await atendimentoService.desvincularAtendimento(id, relId);
      toast.success('Vínculo removido');
      fetchRelacionados();
    } catch { toast.error('Erro ao remover vínculo'); }
  };

  const handleBuscarUsuariosSigs = async (q) => {
    setPartBusca(q);
    setPartSelecionado(null);
    setPartUserId('');
    if (q.length < 2) { setPartUsuarios([]); return; }
    try {
      const { data } = await atendimentoService.buscarUsuariosSigs(q);
      setPartUsuarios(data);
    } catch { setPartUsuarios([]); }
  };

  const handleSaveParticipante = async () => {
    const userId = partSelecionado?.id || (partUserId ? Number(partUserId) : null);
    if (!userId) { toast.error('Selecione um usuário'); return; }
    setSavingPart(true);
    try {
      await atendimentoService.adicionarParticipante(id, {
        beg_usuarios_id: userId,
        sth_cad_filial_id: partFilialId ? Number(partFilialId) : null,
      });
      toast.success('Participante adicionado à equipe');
      setPartModal(false);
      setPartUserId(''); setPartFilialId(''); setPartBusca(''); setPartUsuarios([]); setPartSelecionado(null);
      fetchData();
    } catch { toast.error('Erro ao adicionar participante'); }
    finally { setSavingPart(false); }
  };

  const handleRemoverParticipante = async (partId, nome) => {
    if (!window.confirm(`Remover ${nome || 'participante'} da equipe?`)) return;
    try {
      await atendimentoService.removerParticipante(id, partId);
      toast.success('Participante removido');
      fetchData();
    } catch { toast.error('Erro ao remover participante'); }
  };

  const handleBuscarEmpresas = async (q) => {
    setEmpresaBusca(q);
    setEmpresaSelecionada(null);
    setFilialSelecionada('');
    if (q.length < 1) { setEmpresasEncontradas([]); return; }
    try {
      const { data } = await atendimentoService.buscarEmpresas(q);
      setEmpresasEncontradas(data);
    } catch { setEmpresasEncontradas([]); }
  };

  const handleSaveEmpresa = async () => {
    if (!empresaSelecionada) { toast.error('Selecione uma empresa'); return; }
    setSavingEmpresa(true);
    try {
      await atendimentoService.patchAtendimento(id, {
        sth_cad_empresa_id: empresaSelecionada.id,
        sth_cad_filial_id: filialSelecionada ? Number(filialSelecionada) : null,
      });
      toast.success('Empresa associada ao atendimento');
      setEmpresaModal(false);
      setEmpresaBusca(''); setEmpresasEncontradas([]); setEmpresaSelecionada(null); setFilialSelecionada('');
      fetchData();
    } catch { toast.error('Erro ao associar empresa'); }
    finally { setSavingEmpresa(false); }
  };

  const handleBuscarChecklists = async (q) => {
    setCklBusca(q);
    if (q.length < 2) { setCklEncontrados([]); return; }
    try {
      const { data } = await atendimentoService.buscarChecklists(q);
      setCklEncontrados(data);
    } catch { setCklEncontrados([]); }
  };

  const handleAssocChecklist = async () => {
    if (!cklSelecionado) { toast.error('Selecione um checklist'); return; }
    setSavingAssocCkl(true);
    try {
      await atendimentoService.vincularChecklist(id, { hgr_fab_ckl_cad_cck_lis_id: cklSelecionado.id });
      toast.success('Checklist vinculado ao atendimento');
      setAssocCklModal(false);
      setCklBusca(''); setCklEncontrados([]); setCklSelecionado(null);
      fetchData();
    } catch { toast.error('Erro ao vincular checklist'); }
    finally { setSavingAssocCkl(false); }
  };

  const handleBuscarLaudos = async (q) => {
    setLaudoBusca(q);
    if (q.length < 2) { setLaudosEncontrados([]); return; }
    try {
      const { data } = await atendimentoService.buscarLaudos(q);
      setLaudosEncontrados(data);
    } catch { setLaudosEncontrados([]); }
  };

  const handleAssocLaudo = async () => {
    if (!laudoSelecionado) { toast.error('Selecione um laudo'); return; }
    setSavingAssocLaudo(true);
    try {
      await atendimentoService.vincularLaudo(id, { hgr_srv_reg_lau_id: laudoSelecionado.id });
      toast.success('Laudo vinculado ao atendimento');
      setAssocLaudoModal(false);
      setLaudoBusca('');
      setLaudosEncontrados([]);
      setLaudoSelecionado(null);
      fetchData();
    } catch { toast.error('Erro ao vincular laudo'); }
    finally { setSavingAssocLaudo(false); }
  };

  const handleVincularNegocio = async () => {
    if (!negCrmId.toString().trim()) { toast.error('Informe o ID do negócio CRM'); return; }
    setSavingNeg(true);
    try {
      await atendimentoService.vincularNegocio(id, { hgr_crm_cad_neg_id: Number(negCrmId) });
      toast.success('Negócio vinculado ao atendimento');
      setNegModal(false);
      setNegCrmId('');
      fetchData();
    } catch { toast.error('Erro ao vincular negócio'); }
    finally { setSavingNeg(false); }
  };

  const handleSaveAnotacao = async (antId) => {
    if (!editingAntText.trim()) { toast.error('Anotação não pode ser vazia'); return; }
    try {
      await atendimentoService.editarAnotacao(id, antId, { descricao: editingAntText });
      toast.success('Anotação atualizada');
      setEditingAntId(null);
      fetchData();
    } catch { toast.error('Erro ao salvar anotação'); }
  };

  const handleSaveLaudo = async () => {
    if (!laudoForm.equipamento.trim() && !laudoForm.n_serie.trim()) {
      toast.error('Informe pelo menos o equipamento ou o número de série');
      return;
    }
    setSavingLaudo(true);
    try {
      await atendimentoService.criarLaudo(id, laudoForm);
      toast.success('Laudo técnico criado e vinculado');
      setLaudoModal(false);
      setLaudoForm(LAU_INIT);
      fetchData();
    } catch { toast.error('Erro ao criar laudo'); }
    finally { setSavingLaudo(false); }
  };

  const handleSaveEqp = async () => {
    if (!eqpForm.equipamento.trim()) { toast.error('Nome do equipamento obrigatório'); return; }
    setSavingEqp(true);
    try {
      await atendimentoService.adicionarEquipamento(id, eqpForm);
      toast.success('Equipamento registrado');
      setEqpModal(false);
      setEqpForm(EQP_INIT);
      fetchData();
    } catch { toast.error('Erro ao registrar equipamento'); }
    finally { setSavingEqp(false); }
  };

  const handleUpload = async () => {
    if (!uploadFile) { toast.error('Selecione um arquivo'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('arquivo', uploadFile);
      if (uploadForm.tipo) fd.append('tipo', uploadForm.tipo);
      await atendimentoService.uploadAnexo(id, fd);
      toast.success('Anexo registrado');
      setUploadModal(false);
      setUploadFile(null);
      setUploadForm({ tipo: '' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchData();
    } catch { toast.error('Erro ao enviar arquivo'); }
    finally { setUploading(false); }
  };

  useEffect(() => {
    if (tab !== 'historico_cliente') return;
    setClienteHistLoading(true);
    atendimentoService.timelineCliente(id)
      .then(r => setClienteHist(r.data.timeline || []))
      .catch(() => setClienteHist([]))
      .finally(() => setClienteHistLoading(false));
  }, [tab, id]);

  useEffect(() => {
    if (tab !== 'timeline') return;
    setTimelineLoading(true);
    atendimentoService.timeline(id)
      .then(r => setTimeline(r.data.timeline || []))
      .catch(() => setTimeline([]))
      .finally(() => setTimelineLoading(false));
  }, [tab, id]);

  if (loading) return (
    <div className="detail-page">
      <div className="dp-skeleton-header" />
      <div className="dp-skeleton-cards">
        {[1, 2, 3, 4].map(i => <div key={i} className="dp-skeleton-card" />)}
      </div>
    </div>
  );
  if (!atn) return null;

  const imagens = (atn.anexos || []).filter(a => isImage(a.mimetype));

  const tabs = [
    { key: 'dados',            label: 'Dados' },
    { key: 'equipamentos',     label: `Equipamentos (${(atn.equipamentos || []).length})` },
    { key: 'anexos',           label: `Anexos (${(atn.anexos || []).length})` },
    { key: 'imagens',          label: `Imagens (${imagens.length})` },
    { key: 'equipe',           label: `Equipe (${(atn.equipe || []).length})` },
    { key: 'laudos',           label: `Laudos (${(atn.laudos || []).length})` },
    { key: 'checklists',       label: `Checklists (${(atn.checklists || []).length})` },
    { key: 'negocios',         label: `Negócios (${(atn.negocios || []).length})` },
    { key: 'atividades',       label: `Atividades (${atividades.length})` },
    { key: 'rams',             label: `RAM (${rams.length})` },
    { key: 'relacionados',     label: `Relacionados (${relacionados.length})` },
    { key: 'pecas',            label: `Peças (${pecas.length})` },
    { key: 'historico_cliente', label: 'Histórico do Cliente' },
    { key: 'timeline',          label: 'Histórico' },
  ];

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Assistência Técnica', to: '/assistencia' },
            { label: atn.codigo || `ATN-${atn.id}` },
          ]} />
          <div className="dp-code" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {atn.codigo || `ATN-${atn.id}`}
            <CopyButton value={atn.codigo || `ATN-${atn.id}`} label="Copiar código" size={12} />
          </div>
          <h1>{atn.titulo || 'Atendimento'}</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <SlaTimer dtAbertura={atn.dt_abertura} dtFechamento={atn.dt_fechamento} />
          <button className="btn-secondary" onClick={() => navigate('/assistencia')}>Voltar</button>
        </div>
      </div>

      <div className="dp-layout">
        {/* LEFT SIDEBAR */}
        <div className="dp-layout-left">
          <div className="dp-info-card">
            <div className="dp-info-card-header">
              <span className={`status-badge ${(atn.status || '').toLowerCase()}`}>{atn.status}</span>
              {atn.etapa_atual && (
                <span className="status-badge" style={{ background: 'var(--accent)' }}>{atn.etapa_atual}</span>
              )}
            </div>
            <div className="dp-info-row">
              <span className="dp-info-label">Cliente</span>
              <span className="dp-info-value">{atn.cliente || '—'}</span>
            </div>
            <div className="dp-info-row">
              <span className="dp-info-label">Responsável</span>
              <span className="dp-info-value">{atn.responsavel_nome || '—'}</span>
            </div>
            <div className="dp-info-row">
              <span className="dp-info-label">Tipo</span>
              <span className="dp-info-value">{atn.tipo_atn || '—'}</span>
            </div>
            <div className="dp-info-row">
              <span className="dp-info-label">Canal</span>
              <span className="dp-info-value">{atn.canal_entrada || '—'}</span>
            </div>
            <div className="dp-info-row">
              <span className="dp-info-label">Severidade</span>
              <span className="dp-info-value">{atn.severidade || '—'}</span>
            </div>
            <div className="dp-info-row">
              <span className="dp-info-label">Garantia</span>
              <span className="dp-info-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontWeight: 700, fontSize: '0.75rem', padding: '2px 8px', borderRadius: 8,
                  background: atn.garantia === 'S' ? '#22c55e22' : '#6c757d15',
                  color: atn.garantia === 'S' ? '#22c55e' : 'var(--text-muted)',
                }}>
                  {atn.garantia === 'S' ? 'Sim' : 'Não'}
                </span>
                <button
                  style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                  onClick={() => {
                    const nova = atn.garantia === 'S' ? 'N' : 'S';
                    atendimentoService.patchAtendimento(id, { garantia: nova }).then(() => setAtn(a => ({ ...a, garantia: nova })));
                  }}
                >Alterar</button>
              </span>
            </div>
            {atn.garantia === 'S' && atn.garantia_obs && (
              <div className="dp-info-row">
                <span className="dp-info-label">Obs. Garantia</span>
                <span className="dp-info-value" style={{ fontSize: '0.8rem' }}>{atn.garantia_obs}</span>
              </div>
            )}
            <div className="dp-info-row">
              <span className="dp-info-label">Abertura</span>
              <span className="dp-info-value">{fmtDate(atn.dt_abertura)}</span>
            </div>
            {atn.dt_fechamento && (
              <div className="dp-info-row">
                <span className="dp-info-label">Fechamento</span>
                <span className="dp-info-value">{fmtDate(atn.dt_fechamento)}</span>
              </div>
            )}
            {/* Geolocalização (tarefa 253) */}
            {atn.geo_lat && atn.geo_lng ? (
              <div style={{ marginTop: 8 }}>
                <div className="dp-info-row">
                  <span className="dp-info-label">Local</span>
                  <span className="dp-info-value" style={{ fontSize: '0.75rem' }}>
                    {atn.geo_endereco || `${Number(atn.geo_lat).toFixed(6)}, ${Number(atn.geo_lng).toFixed(6)}`}
                  </span>
                </div>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${atn.geo_lat}&mlon=${atn.geo_lng}&zoom=16`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: 'var(--accent)', display: 'block', marginTop: 4 }}
                >Ver no mapa ↗</a>
              </div>
            ) : null}

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="btn-secondary" style={{ width: '100%', fontSize: '0.78rem' }} onClick={() => {
                if (!navigator.geolocation) { toast.error('Geolocalização não suportada'); return; }
                navigator.geolocation.getCurrentPosition(
                  pos => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    atendimentoService.patchAtendimento(id, { geo_lat: lat, geo_lng: lng })
                      .then(() => { setAtn(a => ({ ...a, geo_lat: lat, geo_lng: lng })); toast.success('Localização registrada'); })
                      .catch(() => toast.error('Erro ao salvar localização'));
                  },
                  () => toast.error('Não foi possível obter a localização'),
                  { enableHighAccuracy: true, timeout: 10000 }
                );
              }}>
                📍 Registrar Localização Atual
              </button>
              <button className="btn-secondary" style={{ width: '100%', fontSize: '0.78rem' }} onClick={() => setEmpresaModal(true)}>
                Associar Empresa
              </button>
              <button className="btn-secondary" style={{ width: '100%', fontSize: '0.78rem' }} onClick={openUnidadeModal}>
                Alterar Unidade
              </button>
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div>
          <div className="detail-tabs">
            {tabs.map(t => (
              <button
                key={t.key}
                className={tab === t.key ? 'active' : ''}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* TAB: DADOS */}
          {tab === 'dados' && (
            <div>
              {atn.descricao && (
                <div className="dp-description">
                  <div className="dp-description-label">Descrição</div>
                  <div className="dp-description-text">{atn.descricao}</div>
                </div>
              )}

              <div className="dp-section-title" style={{ marginTop: 20, marginBottom: 8 }}>Anotações</div>
              {(atn.anotacoes || []).length === 0
                ? <div className="empty-state">Nenhuma anotação</div>
                : (atn.anotacoes || []).map(a => (
                  <div key={a.id} className="dp-anot-item">
                    <div className="dp-anot-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{fmtDate(a.created_at)}</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {a.updated_at && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            editado em {fmtDate(a.updated_at)}
                          </span>
                        )}
                        {editingAntId === a.id ? (
                          <>
                            <button className="btn-primary" style={{ fontSize: '0.72rem', padding: '2px 8px' }} onClick={() => handleSaveAnotacao(a.id)}>Salvar</button>
                            <button className="btn-secondary" style={{ fontSize: '0.72rem', padding: '2px 8px' }} onClick={() => setEditingAntId(null)}>Cancelar</button>
                          </>
                        ) : (
                          <button
                            className="btn-secondary"
                            style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                            onClick={() => { setEditingAntId(a.id); setEditingAntText(a.descricao); }}
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </div>
                    {editingAntId === a.id ? (
                      <textarea
                        className="form-control"
                        style={{ marginTop: 6, fontSize: '0.88rem', minHeight: 80 }}
                        value={editingAntText}
                        onChange={e => setEditingAntText(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      <>
                        <div className="dp-anot-body">{a.descricao}</div>
                        {a.descricao_original && (
                          <details style={{ marginTop: 6 }}>
                            <summary style={{ fontSize: '0.72rem', color: 'var(--text-muted)', cursor: 'pointer' }}>Ver texto original</summary>
                            <div style={{ marginTop: 4, fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', background: 'var(--bg-secondary)', padding: 8, borderRadius: 6 }}>
                              {a.descricao_original}
                            </div>
                          </details>
                        )}
                      </>
                    )}
                  </div>
                ))
              }

              <div className="dp-section-title" style={{ marginTop: 20, marginBottom: 8 }}>Histórico de Etapas</div>
              {(atn.historico_etapas || []).length === 0
                ? <div className="empty-state">Nenhuma transição registrada</div>
                : (atn.historico_etapas || []).map(h => (
                  <div key={h.id} className="dp-history-row">
                    <span>{h.etapa_anterior || '—'}</span>
                    <span className="dp-history-arrow">→</span>
                    <span style={{ fontWeight: 600 }}>{h.etapa_nova || '—'}</span>
                    <span className="dp-history-meta">
                      {h.usuario_nome || '—'} · <RelativeTime value={h.dt_transicao} />
                    </span>
                  </div>
                ))
              }
            </div>
          )}

          {/* TAB: EQUIPAMENTOS */}
          {tab === 'equipamentos' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '5px 14px' }} onClick={() => setEqpModal(true)}>
                  + Registrar Equipamento
                </button>
              </div>
              {(atn.equipamentos || []).length === 0
                ? <div className="empty-state">Nenhum equipamento registrado</div>
                : (
                  <table className="data-table">
                  <thead>
                    <tr>
                      <th>Equipamento</th>
                      <th>Nr. Série</th>
                      <th>Modelo</th>
                      <th>Motivo</th>
                      <th>Dados Técnicos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(atn.equipamentos || []).map(e => (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 600 }}>{e.equipamento || '—'}</td>
                        <td>{e.nr_serie || '—'}</td>
                        <td>{e.modelo || '—'}</td>
                        <td>{e.motivo || '—'}</td>
                        <td style={{ maxWidth: 220, whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>
                          {e.dados_tecnicos || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* TAB: ANEXOS */}
          {tab === 'anexos' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '5px 14px' }} onClick={() => setUploadModal(true)}>
                  + Novo Anexo
                </button>
              </div>
              {(atn.anexos || []).length === 0
                ? <div className="empty-state">Nenhum anexo registrado</div>
                : (
                  <div className="dp-anexos-grid">
                    {(atn.anexos || []).map(anx => (
                    <div key={anx.id} className="dp-anexo-item">
                      <span className="dp-anexo-icon">{mimeIcon(anx.mimetype)}</span>
                      <div className="dp-anexo-info">
                        <div className="dp-anexo-name">{anx.filename || `Anexo #${anx.id}`}</div>
                        <div className="dp-anexo-meta">
                          {anx.tipo && <span className="dp-tag">{anx.tipo}</span>}
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                            {fmtDateTime(anx.created)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TAB: IMAGENS */}
          {tab === 'imagens' && (() => {
            const lbImages = imagens.map(img => ({
              id: img.id,
              src: `/api/assistencia/atendimentos/${id}/anexos/${img.id}/imagem`,
              caption: img.filename || `Imagem #${img.id}`,
            }));
            return imagens.length === 0
              ? <div className="empty-state">Nenhuma imagem nos anexos deste atendimento</div>
              : (
                <>
                  <div style={{ marginBottom: 10, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {imagens.length} imagem{imagens.length !== 1 ? 's' : ''} · Clique para ampliar
                  </div>
                  <div className="dp-img-gallery">
                    {imagens.map((img, idx) => (
                      <div key={img.id} className="dp-img-item">
                        <button
                          onClick={() => setLightboxIndex(idx)}
                          className="dp-img-link"
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'zoom-in', display: 'block', width: '100%' }}
                        >
                          <img
                            src={`/api/assistencia/atendimentos/${id}/anexos/${img.id}/imagem`}
                            alt={img.filename || `Imagem #${img.id}`}
                            className="dp-img-thumb"
                            loading="lazy"
                          />
                          <div className="dp-img-caption">
                            <span>{img.filename || `Imagem #${img.id}`}</span>
                            {img.tipo && <span className="dp-tag">{img.tipo}</span>}
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                  <ImageLightbox
                    images={lbImages}
                    index={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                  />
                </>
              );
          })()}

          {/* TAB: EQUIPE */}
          {tab === 'equipe' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Equipe do Atendimento</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    {(atn.equipe || []).length} membro{(atn.equipe || []).length !== 1 ? 's' : ''}
                  </div>
                </div>
                <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '5px 14px' }} onClick={() => setPartModal(true)}>
                  + Adicionar Membro
                </button>
              </div>
              {(atn.equipe || []).length === 0
                ? (
                  <div className="empty-state" style={{ padding: '40px 0' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 8 }}>👥</div>
                    <div>Nenhum membro na equipe</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      Clique em "Adicionar Membro" para incluir participantes
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                    {(atn.equipe || []).map(p => {
                      const nome = p.usuario_nome || `Usuário #${p.beg_usuarios_id}`;
                      const initials = nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
                      const hue = (p.beg_usuarios_id * 47) % 360;
                      return (
                        <div
                          key={p.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 14px',
                            background: 'var(--card-bg)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 10,
                            position: 'relative',
                          }}
                        >
                          <div style={{
                            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                            background: `hsl(${hue}, 60%, 45%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 700, fontSize: '0.88rem',
                          }}>
                            {initials}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {nome}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              desde {fmtDate(p.created)}
                            </div>
                          </div>
                          <button
                            title="Remover da equipe"
                            style={{
                              position: 'absolute', top: 6, right: 8,
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1, padding: 2,
                            }}
                            onClick={() => handleRemoverParticipante(p.id, nome)}
                          >×</button>
                        </div>
                      );
                    })}
                  </div>
                )}
            </>
          )}

          {/* TAB: LAUDOS */}
          {tab === 'laudos' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
                <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '5px 14px' }} onClick={() => setAssocLaudoModal(true)}>
                  Associar Laudo Existente
                </button>
                <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '5px 14px' }} onClick={() => setLaudoModal(true)}>
                  + Novo Laudo
                </button>
              </div>
              {(atn.laudos || []).length === 0
                ? <div className="empty-state">Nenhum laudo vinculado</div>
                : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código / Nº</th>
                      <th>Equipamento</th>
                      <th>Nr. Série</th>
                      <th>Modelo</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(atn.laudos || []).map(l => (
                      <tr key={l.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {l.laudo_codigo || (l.num_lau ? `#${l.num_lau}` : `LAU-${l.hgr_srv_reg_lau_id}`)}
                        </td>
                        <td>{l.equipamento || l.eqp_nome || '—'}</td>
                        <td>{l.n_serie || '—'}</td>
                        <td>{l.modelo || '—'}</td>
                        <td>{fmtDate(l.laudo_dt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* TAB: CHECKLISTS */}
          {tab === 'checklists' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '5px 14px' }} onClick={() => setAssocCklModal(true)}>
                  Associar Checklist
                </button>
              </div>
              {(atn.checklists || []).length === 0
                ? <div className="empty-state">Nenhum checklist vinculado</div>
                : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID Checklist</th>
                      <th>Equipamento</th>
                      <th>Nº Motor</th>
                      <th>Nº Série</th>
                      <th>Tipo</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(atn.checklists || []).map(ck => (
                      <tr key={ck.id}>
                        <td style={{ fontFamily: 'monospace' }}>
                          {ck.hgr_fab_ckl_cad_cck_lis_id || '—'}
                        </td>
                        <td>{ck.eqp_nome || ck.ck_descricao || '—'}</td>
                        <td>{ck.n_motor || '—'}</td>
                        <td>{ck.n_serie || '—'}</td>
                        <td>{ck.tipo || '—'}</td>
                        <td>
                          {ck.ck_status && (
                            <span className={`status-badge ${(ck.ck_status || '').toLowerCase()}`}>
                              {ck.ck_status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* TAB: NEGÓCIOS */}
          {tab === 'negocios' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Negócios CRM vinculados a este atendimento
                </div>
                <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '5px 14px' }} onClick={() => setNegModal(true)}>
                  + Vincular Negócio
                </button>
              </div>
              {(atn.negocios || []).length === 0
                ? <div className="empty-state">Nenhum negócio CRM vinculado</div>
                : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID Negócio (CRM)</th>
                      <th>Vinculado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(atn.negocios || []).map(neg => (
                      <tr key={neg.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          #{neg.hgr_crm_cad_neg_id}
                        </td>
                        <td>{fmtDateTime(neg.created)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* TAB: RAM */}
          {tab === 'rams' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Relatórios de Ação de Manutenção vinculados
                </div>
                <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '5px 14px' }} onClick={() => { setRamId(''); setRamDesc(''); setRamModal(true); }}>
                  + Associar RAM
                </button>
              </div>
              {rams.length === 0
                ? <div className="empty-state">Nenhum RAM associado</div>
                : (
                <table className="data-table">
                  <thead><tr><th>ID RAM</th><th>Descrição</th><th>Associado em</th><th style={{ width: 80 }}></th></tr></thead>
                  <tbody>
                    {rams.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>#{r.ram_id}</td>
                        <td>{r.ram_descricao || '—'}</td>
                        <td>{fmtDateTime(r.created)}</td>
                        <td>
                          <button
                            style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 5, cursor: 'pointer' }}
                            onClick={async () => {
                              if (!window.confirm(`Remover RAM #${r.ram_id}?`)) return;
                              await atendimentoService.desassociarRam(id, r.id);
                              toast.success('RAM removido');
                              fetchRams();
                            }}
                          >Remover</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* TAB: ATIVIDADES */}
          {tab === 'atividades' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Checkpoints e atividades deste atendimento
                </div>
                <button
                  className="btn-primary"
                  style={{ fontSize: '0.82rem', padding: '5px 14px' }}
                  onClick={async () => {
                    if (!tiposAtiv.length) {
                      try {
                        const { data } = await atendimentoService.listar({ per_page: 0 });
                        const { data: tipos } = await import('../../lib/api').then(m => m.default.get('/api/assistencia/tipos-ativ'));
                        setTiposAtiv(tipos);
                      } catch { setTiposAtiv([]); }
                    }
                    setAtivForm(ATIV_INIT);
                    setAtivModal(true);
                  }}
                >
                  + Nova Atividade
                </button>
              </div>
              {atividades.length === 0
                ? <div className="empty-state">Nenhuma atividade registrada</div>
                : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {atividades.map(a => {
                    const done = a.status === 'CONCLUIDO';
                    return (
                      <div
                        key={a.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 14px',
                          background: 'var(--card-bg)',
                          border: `1px solid ${done ? '#22c55e44' : 'var(--border-primary)'}`,
                          borderRadius: 8, opacity: done ? 0.75 : 1,
                        }}
                      >
                        <button
                          title={done ? 'Reabrir' : 'Marcar como concluído'}
                          onClick={async () => {
                            const newStatus = done ? 'PENDENTE' : 'CONCLUIDO';
                            const payload = { status: newStatus };
                            if (!done) payload.dt_conclusao = new Date().toISOString().split('T')[0];
                            await atendimentoService.atualizarAtividade(id, a.id, payload);
                            fetchAtividades();
                          }}
                          style={{
                            width: 22, height: 22, borderRadius: '50%', border: `2px solid ${done ? '#22c55e' : 'var(--border-primary)'}`,
                            background: done ? '#22c55e' : 'transparent', cursor: 'pointer', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12,
                          }}
                        >
                          {done && '✓'}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.88rem', textDecoration: done ? 'line-through' : 'none' }}>
                            {a.descricao || a.tipo_nome || `Atividade #${a.id}`}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                            {a.tipo_nome && <span>{a.tipo_nome}</span>}
                            {a.dt_prevista && <span>Previsto: {fmtDate(a.dt_prevista)}</span>}
                            {a.dt_conclusao && <span style={{ color: '#22c55e' }}>Concluído: {fmtDate(a.dt_conclusao)}</span>}
                            {a.responsavel_nome && <span>Resp: {a.responsavel_nome}</span>}
                          </div>
                        </div>
                        <span className={`status-badge ${(a.status || '').toLowerCase()}`} style={{ fontSize: '0.7rem' }}>
                          {a.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* TAB: RELACIONADOS */}
          {tab === 'relacionados' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Atendimentos relacionados a este registro
                </div>
                <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '5px 14px' }} onClick={() => setRelModal(true)}>
                  + Vincular Atendimento
                </button>
              </div>
              {relacionados.length === 0
                ? <div className="empty-state">Nenhum atendimento relacionado</div>
                : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Título</th>
                      <th>Cliente</th>
                      <th>Status</th>
                      <th>Tipo Rel.</th>
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {relacionados.map(r => (
                      <tr key={r.id} className="clickable" onClick={() => navigate(`/assistencia/${r.atn_rel_id}`)}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.rel_codigo || `#${r.atn_rel_id}`}</td>
                        <td>{r.rel_titulo || '—'}</td>
                        <td style={{ fontSize: '0.82rem' }}>{r.rel_cliente || '—'}</td>
                        <td>
                          <span className={`status-badge ${(r.rel_status || '').toLowerCase()}`}>{r.rel_status}</span>
                        </td>
                        <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{r.tipo_rel || 'RELACIONADO'}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <button
                            style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 5, cursor: 'pointer' }}
                            onClick={() => handleDesvincularAtendimento(r.id, r.rel_titulo)}
                          >Remover</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {/* Vínculos externos CHM / RQ03 (tarefa 250) */}
              <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>Vínculos externos — Chamados / RQ03</span>
                  <button className="btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 12px' }} onClick={() => { setVinculoExtForm({ ref_tipo: 'CHM', ref_id: '' }); setVinculoExtModal(true); }}>
                    + Vincular CHM/RQ03
                  </button>
                </div>
                {vinculosExt.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum vínculo externo registrado.</p>
                ) : (
                  <table className="data-table" style={{ fontSize: 13 }}>
                    <thead><tr><th>Tipo</th><th>Código</th><th>Título</th><th></th></tr></thead>
                    <tbody>
                      {vinculosExt.map(v => (
                        <tr key={v.id}
                          className="clickable"
                          onClick={() => navigate(v.ref_tipo === 'CHM' ? `/chamados/${v.ref_id}` : `/qualidade/rq03/${v.ref_id}`)}
                        >
                          <td>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                              background: v.ref_tipo === 'CHM' ? '#3b82f620' : '#f59e0b20',
                              color: v.ref_tipo === 'CHM' ? '#3b82f6' : '#f59e0b',
                            }}>{v.ref_tipo}</span>
                          </td>
                          <td style={{ fontFamily: 'monospace' }}>{v.ref_codigo || `#${v.ref_id}`}</td>
                          <td>{v.ref_titulo || '—'}</td>
                          <td onClick={e => e.stopPropagation()}>
                            <button
                              style={{ fontSize: '0.7rem', padding: '2px 7px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 5, cursor: 'pointer' }}
                              onClick={() => handleRemoverVinculoExt(v.id)}
                            >Remover</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* TAB: HISTÓRICO DO CLIENTE */}
          {tab === 'pecas' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Peças Utilizadas</span>
                  {custoResumo && (
                    <span style={{ marginLeft: 12, fontSize: 13, color: custoResumo.excede ? '#ef4444' : 'var(--text-muted)' }}>
                      Peças: <strong>R$ {Number(custoResumo.custo_total).toFixed(2)}</strong>
                      {atn.deslocamento_km != null && (
                        <> · Desl.: <strong>{Number(atn.deslocamento_km).toFixed(1)} km</strong>
                        {atn.deslocamento_valor_km && <> (R$ {(Number(atn.deslocamento_km) * Number(atn.deslocamento_valor_km)).toFixed(2)})</>}</>
                      )}
                      {custoResumo.limite != null && ` / Limite: R$ ${Number(custoResumo.limite).toFixed(2)}`}
                      {custoResumo.excede && <span style={{ marginLeft: 8, background: '#ef444420', color: '#ef4444', fontWeight: 700, padding: '1px 6px', borderRadius: 6, fontSize: 11 }}>EXCEDE LIMITE</span>}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {custoResumo?.excede && atn.autorizacao_status !== 'APROVADO' && (
                    <button
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '4px 12px', borderColor: '#ef4444', color: '#ef4444' }}
                      onClick={() => { setAutorizacaoObs(''); setAutorizacaoModal(true); }}
                    >
                      Solicitar Autorização
                    </button>
                  )}
                  {atn.autorizacao_status && (
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
                      background: atn.autorizacao_status === 'APROVADO' ? '#22c55e20' : atn.autorizacao_status === 'REPROVADO' ? '#ef444420' : '#f59e0b20',
                      color: atn.autorizacao_status === 'APROVADO' ? '#22c55e' : atn.autorizacao_status === 'REPROVADO' ? '#ef4444' : '#f59e0b',
                    }}>
                      Autorização: {atn.autorizacao_status}
                    </span>
                  )}
                  <button className="btn-primary" style={{ fontSize: '0.8rem', padding: '5px 14px' }} onClick={() => { setPecaForm(PECA_INIT); setPecaModal(true); }}>
                    + Adicionar Peça
                  </button>
                </div>
              </div>
              {pecas.length === 0 ? (
                <div className="empty-state">Nenhuma peça registrada</div>
              ) : (
                <>
                  <table className="data-table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Descrição</th>
                        <th>Qtd</th>
                        <th>Un</th>
                        <th>Valor Unit.</th>
                        <th>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pecas.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.codigo || '—'}</td>
                          <td style={{ fontWeight: 600 }}>{p.descricao}</td>
                          <td>{p.quantidade}</td>
                          <td>{p.unidade}</td>
                          <td>{p.valor_unit != null ? `R$ ${Number(p.valor_unit).toFixed(2)}` : '—'}</td>
                          <td>{p.valor_unit != null ? `R$ ${(Number(p.valor_unit) * Number(p.quantidade)).toFixed(2)}` : '—'}</td>
                          <td>
                            <button
                              onClick={() => handleRemoverPeca(p.id)}
                              style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid var(--danger, #dc3545)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--danger, #dc3545)' }}
                            >Remover</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 700 }}>
                        <td colSpan={5} style={{ textAlign: 'right', paddingRight: 8 }}>Total:</td>
                        <td>
                          {pecas.some(p => p.valor_unit != null)
                            ? `R$ ${pecas.reduce((s, p) => s + (p.valor_unit != null ? Number(p.valor_unit) * Number(p.quantidade) : 0), 0).toFixed(2)}`
                            : '—'}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}

              {/* Deslocamento (tarefa 251) */}
              <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>Deslocamento:</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number" min="0" step="0.1" placeholder="0,0"
                      className="form-control" style={{ width: 90, fontSize: 13 }}
                      defaultValue={atn.deslocamento_km || ''}
                      onBlur={e => {
                        const v = parseFloat(e.target.value) || null;
                        atendimentoService.patchAtendimento(id, { deslocamento_km: v })
                          .then(() => setAtn(a => ({ ...a, deslocamento_km: v })));
                      }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>km</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>R$/km:</span>
                    <input
                      type="number" min="0" step="0.01" placeholder="0,00"
                      className="form-control" style={{ width: 80, fontSize: 13 }}
                      defaultValue={atn.deslocamento_valor_km || ''}
                      onBlur={e => {
                        const v = parseFloat(e.target.value) || null;
                        atendimentoService.patchAtendimento(id, { deslocamento_valor_km: v })
                          .then(() => setAtn(a => ({ ...a, deslocamento_valor_km: v })));
                      }}
                    />
                  </div>
                  {atn.deslocamento_km != null && atn.deslocamento_valor_km != null && (
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
                      = R$ {(Number(atn.deslocamento_km) * Number(atn.deslocamento_valor_km)).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'timeline' && (
            timelineLoading
              ? <div className="empty-state">Carregando histórico...</div>
              : timeline.length === 0
              ? <div className="empty-state">Nenhum evento registrado</div>
              : (
                <div className="atn-timeline">
                  {timeline.map((ev, idx) => (
                    <div key={idx} className="atn-tl-item" style={{ borderLeftColor: ev.cor || 'var(--accent)' }}>
                      <div className="atn-tl-icon" style={{ background: (ev.cor || 'var(--accent)') + '22', color: ev.cor || 'var(--accent)', fontSize: 16 }}>
                        {ev.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{ev.descricao}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {ev.usuario} · {ev.dt ? new Date(ev.dt).toLocaleString('pt-BR') : '—'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
          )}

          {tab === 'historico_cliente' && (
            clienteHistLoading
              ? <div className="empty-state">Carregando timeline...</div>
              : clienteHist.length === 0
              ? <div className="empty-state">Nenhum histórico encontrado para este cliente</div>
              : (
                <div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                    Timeline de <strong>{atn.cliente || '—'}</strong> · {clienteHist.length} evento{clienteHist.length !== 1 ? 's' : ''}
                  </div>
                  <div className="atn-timeline">
                    {clienteHist.map(ev => {
                      const isATN = ev.tipo === 'ATN';
                      const color = isATN ? '#3b82f6' : '#f59e0b';
                      const icon  = isATN ? '🔧' : '⚠';
                      const label = isATN ? 'Assistência' : 'Não Conformidade';
                      const link  = isATN ? `/assistencia/${ev.id}` : `/qualidade/rq03/${ev.id}`;
                      return (
                        <div
                          key={`${ev.tipo}-${ev.id}`}
                          className={`atn-tl-item${ev.atual ? ' atn-tl-item-atual' : ''}`}
                          style={{ borderLeftColor: color }}
                          onClick={() => navigate(link)}
                        >
                          <div className="atn-tl-icon" style={{ background: color + '22', color }}>{icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, color, textTransform: 'uppercase' }}>{label}</span>
                              {ev.codigo && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{ev.codigo}</span>
                              )}
                              {ev.atual && (
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, background: 'var(--accent)', color: '#fff', padding: '1px 6px', borderRadius: 10 }}>Atual</span>
                              )}
                              <span className={`status-badge ${(ev.status || '').toLowerCase()}`} style={{ fontSize: '0.65rem' }}>{ev.status}</span>
                            </div>
                            <div className="atn-tl-title">{ev.titulo || '—'}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {fmtDate(ev.dt)}{ev.dt_fechamento ? ` — ${fmtDate(ev.dt_fechamento)}` : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
          )}
        </div>
      </div>

      {/* Modal: Alterar Unidade (APEX P0414) */}
      <Modal
        open={unidadeModal}
        onClose={() => setUnidadeModal(false)}
        title="Associar Unidade ao Atendimento"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setUnidadeModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSaveUnidade} disabled={savingUnidade}>
              {savingUnidade ? 'Salvando...' : 'Confirmar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Unidade / Filial</label>
          <select className="form-control" value={unidadeSelecionada} onChange={e => setUnidadeSelecionada(e.target.value)} autoFocus>
            <option value="">Selecione...</option>
            {unidades.map(u => (
              <option key={u.id} value={u.id}>{u.empresa ? `${u.empresa} — ${u.descricao}` : u.descricao}</option>
            ))}
          </select>
        </div>
      </Modal>

      {/* Modal: Adicionar Participante (APEX P0411) */}
      <Modal
        open={partModal}
        onClose={() => { setPartModal(false); setPartBusca(''); setPartUsuarios([]); setPartSelecionado(null); setPartUserId(''); setPartFilialId(''); }}
        title="Adicionar Participante à Equipe"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPartModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSaveParticipante} disabled={savingPart || (!partSelecionado && !partUserId)}>
              {savingPart ? 'Adicionando...' : 'Adicionar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Buscar técnico / usuário</label>
          <input
            className="form-control"
            placeholder="Nome do técnico..."
            value={partBusca}
            onChange={e => handleBuscarUsuariosSigs(e.target.value)}
            autoFocus
          />
        </div>

        {partUsuarios.length > 0 && (
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: 6, marginTop: 4 }}>
            {partUsuarios.map(u => (
              <div
                key={u.id}
                onClick={() => { setPartSelecionado(u); setPartUserId(u.id.toString()); }}
                style={{
                  padding: '8px 14px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-primary)',
                  background: partSelecionado?.id === u.id ? 'color-mix(in srgb, var(--accent) 12%, var(--card-bg))' : 'var(--card-bg)',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{u.nome}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{u.usuario}</div>
              </div>
            ))}
          </div>
        )}

        {partBusca.length >= 2 && partUsuarios.length === 0 && (
          <div className="empty-state" style={{ marginTop: 8 }}>Nenhum usuário encontrado</div>
        )}

        {partSelecionado && (
          <div style={{ marginTop: 10, padding: 10, background: 'color-mix(in srgb, var(--accent) 8%, var(--card-bg))', borderRadius: 6, fontSize: '0.82rem', border: '1px solid var(--accent)' }}>
            Selecionado: <strong>{partSelecionado.nome}</strong>
          </div>
        )}
      </Modal>

      {/* Modal: Associar Empresa (APEX P0410) */}
      <Modal
        open={empresaModal}
        onClose={() => { setEmpresaModal(false); setEmpresaBusca(''); setEmpresasEncontradas([]); setEmpresaSelecionada(null); }}
        title="Associar Empresa ao Atendimento"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEmpresaModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSaveEmpresa} disabled={savingEmpresa || !empresaSelecionada}>
              {savingEmpresa ? 'Salvando...' : 'Associar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Buscar empresa</label>
          <input
            className="form-control"
            placeholder="Digite o nome da empresa..."
            value={empresaBusca}
            onChange={e => handleBuscarEmpresas(e.target.value)}
            autoFocus
          />
        </div>

        {empresasEncontradas.length > 0 && (
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: 6, marginTop: 4 }}>
            {empresasEncontradas.map(emp => (
              <div
                key={emp.id}
                onClick={() => { setEmpresaSelecionada(emp); setFilialSelecionada(''); }}
                style={{
                  padding: '8px 14px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-primary)',
                  background: empresaSelecionada?.id === emp.id ? 'color-mix(in srgb, var(--accent) 12%, var(--card-bg))' : 'var(--card-bg)',
                  fontWeight: empresaSelecionada?.id === emp.id ? 600 : 400,
                  fontSize: '0.88rem',
                }}
              >
                {emp.descricao}
              </div>
            ))}
          </div>
        )}

        {empresaSelecionada && (
          <>
            <div style={{ marginTop: 12 }} className="form-group">
              <label>Unidade / Filial</label>
              <select className="form-control" value={filialSelecionada} onChange={e => setFilialSelecionada(e.target.value)}>
                <option value="">Nenhuma</option>
                {(empresaSelecionada.filiais || []).filter(Boolean).map(f => (
                  <option key={f.id} value={f.id}>{f.descricao}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </Modal>

      {/* Modal: Associar Checklist (APEX P0405) */}
      <Modal
        open={assocCklModal}
        onClose={() => { setAssocCklModal(false); setCklBusca(''); setCklEncontrados([]); setCklSelecionado(null); }}
        title="Associar Checklist de Fabricação"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAssocCklModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleAssocChecklist} disabled={savingAssocCkl || !cklSelecionado}>
              {savingAssocCkl ? 'Vinculando...' : 'Vincular Checklist'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Buscar por nº motor, nº série ou descrição</label>
          <input
            className="form-control"
            placeholder="Digite para buscar..."
            value={cklBusca}
            onChange={e => handleBuscarChecklists(e.target.value)}
            autoFocus
          />
        </div>

        {cklEncontrados.length > 0 && (
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: 6, marginTop: 4 }}>
            {cklEncontrados.map(ck => (
              <div
                key={ck.id}
                onClick={() => setCklSelecionado(ck)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-primary)',
                  background: cklSelecionado?.id === ck.id ? 'color-mix(in srgb, var(--accent) 12%, var(--card-bg))' : 'var(--card-bg)',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                  {ck.descricao || `Checklist #${ck.id}`}
                  {ck.tipo && <span style={{ marginLeft: 8, fontSize: '0.76rem', color: 'var(--text-muted)' }}>[{ck.tipo}]</span>}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  {ck.n_motor && `Motor: ${ck.n_motor}`}
                  {ck.n_serie && ` · Série: ${ck.n_serie}`}
                  {ck.status && ` · ${ck.status}`}
                </div>
              </div>
            ))}
          </div>
        )}

        {cklBusca.length >= 2 && cklEncontrados.length === 0 && (
          <div className="empty-state" style={{ marginTop: 8 }}>Nenhum checklist encontrado</div>
        )}

        {cklSelecionado && (
          <div style={{ marginTop: 10, padding: 10, background: 'color-mix(in srgb, var(--accent) 8%, var(--card-bg))', borderRadius: 6, fontSize: '0.82rem', border: '1px solid var(--accent)' }}>
            Selecionado: <strong>{cklSelecionado.descricao || `Checklist #${cklSelecionado.id}`}</strong>
          </div>
        )}
      </Modal>

      {/* Modal: Associar Laudo Existente (APEX P0404) */}
      <Modal
        open={assocLaudoModal}
        onClose={() => { setAssocLaudoModal(false); setLaudoBusca(''); setLaudosEncontrados([]); setLaudoSelecionado(null); }}
        title="Associar Laudo Existente"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAssocLaudoModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleAssocLaudo} disabled={savingAssocLaudo || !laudoSelecionado}>
              {savingAssocLaudo ? 'Vinculando...' : 'Vincular Laudo'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Buscar por equipamento, nr. série ou código</label>
          <input
            className="form-control"
            placeholder="Digite para buscar..."
            value={laudoBusca}
            onChange={e => handleBuscarLaudos(e.target.value)}
            autoFocus
          />
        </div>

        {laudosEncontrados.length > 0 && (
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: 6, marginTop: 4 }}>
            {laudosEncontrados.map(l => (
              <div
                key={l.id}
                onClick={() => setLaudoSelecionado(l)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-primary)',
                  background: laudoSelecionado?.id === l.id ? 'color-mix(in srgb, var(--accent) 12%, var(--card-bg))' : 'var(--card-bg)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                  {l.equipamento || `Laudo #${l.id}`}
                  {l.codigo && <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{l.codigo}</span>}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                  {l.n_serie && `Série: ${l.n_serie}`}
                  {l.n_motor && ` · Motor: ${l.n_motor}`}
                  {l.modelo && ` · ${l.modelo}`}
                  {' · '}{fmtDate(l.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}

        {laudoBusca.length >= 2 && laudosEncontrados.length === 0 && (
          <div className="empty-state" style={{ marginTop: 8 }}>Nenhum laudo encontrado</div>
        )}

        {laudoSelecionado && (
          <div style={{ marginTop: 10, padding: 10, background: 'color-mix(in srgb, var(--accent) 8%, var(--card-bg))', borderRadius: 6, fontSize: '0.82rem', border: '1px solid var(--accent)' }}>
            Selecionado: <strong>{laudoSelecionado.equipamento || `Laudo #${laudoSelecionado.id}`}</strong>
          </div>
        )}
      </Modal>

      {/* Modal: Vincular Negócio CRM (APEX P0402) */}
      <Modal
        open={negModal}
        onClose={() => { setNegModal(false); setNegCrmId(''); }}
        title="Vincular Negócio CRM"
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setNegModal(false); setNegCrmId(''); }}>Cancelar</button>
            <button className="btn-primary" onClick={handleVincularNegocio} disabled={savingNeg}>
              {savingNeg ? 'Vinculando...' : 'Vincular'}
            </button>
          </>
        }
      >
        <div style={{ marginBottom: 14, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          <strong>Atendimento:</strong> {atn.codigo || `ATN-${atn.id}`}<br />
          <strong>Cliente:</strong> {atn.cliente || '—'}
        </div>
        <div className="form-group">
          <label>ID do Negócio no CRM *</label>
          <input
            className="form-control"
            type="number"
            min={1}
            placeholder="Informe o ID do negócio existente no CRM"
            value={negCrmId}
            onChange={e => setNegCrmId(e.target.value)}
            autoFocus
          />
          <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Para criar um novo negócio, acesse o módulo CRM e informe o ID gerado aqui.
          </div>
        </div>
      </Modal>

      {/* Modal: Cadastro de Laudo Técnico (APEX P0397) */}
      <Modal
        open={laudoModal}
        onClose={() => { setLaudoModal(false); setLaudoForm(LAU_INIT); }}
        title="Novo Laudo Técnico / Manutenção"
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setLaudoModal(false); setLaudoForm(LAU_INIT); }}>Cancelar</button>
            <button className="btn-primary" onClick={handleSaveLaudo} disabled={savingLaudo}>
              {savingLaudo ? 'Salvando...' : 'Criar Laudo'}
            </button>
          </>
        }
      >
        <div className="form-row-2">
          <div className="form-group">
            <label>Equipamento</label>
            <input className="form-control" placeholder="Nome do equipamento" value={laudoForm.equipamento} onChange={e => setLaudoForm(f => ({ ...f, equipamento: e.target.value }))} autoFocus />
          </div>
          <div className="form-group">
            <label>Modelo</label>
            <input className="form-control" value={laudoForm.modelo} onChange={e => setLaudoForm(f => ({ ...f, modelo: e.target.value }))} />
          </div>
        </div>

        <div className="form-row-3">
          <div className="form-group">
            <label>Nr. Série</label>
            <input className="form-control" value={laudoForm.n_serie} onChange={e => setLaudoForm(f => ({ ...f, n_serie: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Nr. Motor</label>
            <input className="form-control" value={laudoForm.n_motor} onChange={e => setLaudoForm(f => ({ ...f, n_motor: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>OF / OS</label>
            <input className="form-control" value={laudoForm.of_os} onChange={e => setLaudoForm(f => ({ ...f, of_os: e.target.value }))} />
          </div>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label>Data da Falha</label>
            <input type="date" className="form-control" value={laudoForm.dt_falha} onChange={e => setLaudoForm(f => ({ ...f, dt_falha: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Data de Entrada</label>
            <input type="date" className="form-control" value={laudoForm.dt_entrada} onChange={e => setLaudoForm(f => ({ ...f, dt_entrada: e.target.value }))} />
          </div>
        </div>

        <div className="form-group">
          <label>Reclamação do Cliente</label>
          <textarea className="form-control" rows={2} value={laudoForm.reclamacao} onChange={e => setLaudoForm(f => ({ ...f, reclamacao: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Observações Técnicas</label>
          <textarea className="form-control" rows={2} value={laudoForm.observacoes} onChange={e => setLaudoForm(f => ({ ...f, observacoes: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Solução Aplicada</label>
          <textarea className="form-control" rows={2} value={laudoForm.solucao} onChange={e => setLaudoForm(f => ({ ...f, solucao: e.target.value }))} />
        </div>
      </Modal>

      {/* Modal: Registro de Equipamento (APEX P0393) */}
      <Modal
        open={eqpModal}
        onClose={() => { setEqpModal(false); setEqpForm(EQP_INIT); }}
        title="Registrar Equipamento"
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setEqpModal(false); setEqpForm(EQP_INIT); }}>Cancelar</button>
            <button className="btn-primary" onClick={handleSaveEqp} disabled={savingEqp}>
              {savingEqp ? 'Salvando...' : 'Registrar'}
            </button>
          </>
        }
      >
        <div className="form-row-3">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Equipamento *</label>
            <input
              className="form-control"
              placeholder="Nome / descrição do equipamento"
              value={eqpForm.equipamento}
              onChange={e => setEqpForm(f => ({ ...f, equipamento: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Nr. Série</label>
            <input className="form-control" value={eqpForm.nr_serie} onChange={e => setEqpForm(f => ({ ...f, nr_serie: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Modelo</label>
            <input className="form-control" value={eqpForm.modelo} onChange={e => setEqpForm(f => ({ ...f, modelo: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Motivo</label>
            <input className="form-control" placeholder="ex: Falha, Manutenção preventiva" value={eqpForm.motivo} onChange={e => setEqpForm(f => ({ ...f, motivo: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label>Dados Técnicos</label>
          <textarea className="form-control" rows={3} placeholder="Tensão, corrente, modelo técnico..." value={eqpForm.dados_tecnicos} onChange={e => setEqpForm(f => ({ ...f, dados_tecnicos: e.target.value }))} />
        </div>
      </Modal>

      {/* Modal: Associar RAM (APEX P0445) */}
      <Modal
        open={ramModal}
        onClose={() => setRamModal(false)}
        title="Associar RAM ao Atendimento"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setRamModal(false)}>Cancelar</button>
            <button
              className="btn-primary"
              disabled={savingRam || !ramId}
              onClick={async () => {
                if (!ramId) { toast.error('Informe o ID do RAM'); return; }
                setSavingRam(true);
                try {
                  await atendimentoService.associarRam(id, { ram_id: Number(ramId), ram_descricao: ramDesc || null });
                  toast.success('RAM associado');
                  setRamModal(false);
                  fetchRams();
                } catch { toast.error('Erro ao associar RAM'); }
                finally { setSavingRam(false); }
              }}
            >
              {savingRam ? 'Associando...' : 'Associar'}
            </button>
          </>
        }
      >
        <div style={{ marginBottom: 14, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <strong>RAM</strong> = Relatório de Ação de Manutenção. Informe o ID do RAM existente no sistema.
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label>ID do RAM *</label>
            <input
              type="number"
              className="form-control"
              min={1}
              placeholder="Número do RAM"
              value={ramId}
              onChange={e => setRamId(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Descrição (opcional)</label>
            <input
              className="form-control"
              placeholder="Resumo do relatório..."
              value={ramDesc}
              onChange={e => setRamDesc(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* Modal: Nova Atividade (APEX P0448) */}
      <Modal
        open={ativModal}
        onClose={() => setAtivModal(false)}
        title="Nova Atividade"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAtivModal(false)}>Cancelar</button>
            <button
              className="btn-primary"
              onClick={async () => {
                if (!ativForm.descricao && !ativForm.hgr_ass_cad_tp_ativ_id) {
                  toast.error('Informe descrição ou tipo de atividade');
                  return;
                }
                setSavingAtiv(true);
                try {
                  await atendimentoService.criarAtividade(id, {
                    ...ativForm,
                    hgr_ass_cad_tp_ativ_id: ativForm.hgr_ass_cad_tp_ativ_id ? Number(ativForm.hgr_ass_cad_tp_ativ_id) : null,
                    dt_prevista: ativForm.dt_prevista || null,
                  });
                  toast.success('Atividade registrada');
                  setAtivModal(false);
                  fetchAtividades();
                } catch { toast.error('Erro ao registrar atividade'); }
                finally { setSavingAtiv(false); }
              }}
              disabled={savingAtiv}
            >
              {savingAtiv ? 'Salvando...' : 'Registrar'}
            </button>
          </>
        }
      >
        {tiposAtiv.length > 0 && (
          <div className="form-group">
            <label>Tipo de Atividade</label>
            <select
              className="form-control"
              value={ativForm.hgr_ass_cad_tp_ativ_id}
              onChange={e => setAtivForm(f => ({ ...f, hgr_ass_cad_tp_ativ_id: e.target.value }))}
            >
              <option value="">Nenhum</option>
              {tiposAtiv.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}
            </select>
          </div>
        )}
        <div className="form-group">
          <label>Descrição</label>
          <input
            className="form-control"
            placeholder="Descreva a atividade..."
            value={ativForm.descricao}
            onChange={e => setAtivForm(f => ({ ...f, descricao: e.target.value }))}
            autoFocus
          />
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label>Data Prevista</label>
            <input type="date" className="form-control" value={ativForm.dt_prevista} onChange={e => setAtivForm(f => ({ ...f, dt_prevista: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={ativForm.status} onChange={e => setAtivForm(f => ({ ...f, status: e.target.value }))}>
              <option value="PENDENTE">Pendente</option>
              <option value="EM_ANDAMENTO">Em Andamento</option>
              <option value="CONCLUIDO">Concluído</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Modal: Vincular Atendimento (APEX P0429) */}
      <Modal
        open={relModal}
        onClose={() => { setRelModal(false); setRelBusca(''); setRelResultados([]); setRelSelecionado(null); }}
        title="Vincular Atendimento Relacionado"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setRelModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleVincularAtendimento} disabled={savingRel || !relSelecionado}>
              {savingRel ? 'Vinculando...' : 'Vincular'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Tipo de Relacionamento</label>
          <select className="form-control" value={relTipo} onChange={e => setRelTipo(e.target.value)}>
            <option value="RELACIONADO">Relacionado</option>
            <option value="DUPLICADO">Duplicado</option>
            <option value="CONTINUACAO">Continuação</option>
            <option value="REFERENCIA">Referência</option>
          </select>
        </div>
        <div className="form-group">
          <label>Buscar atendimento</label>
          <input
            className="form-control"
            placeholder="Título, código ou cliente..."
            value={relBusca}
            onChange={e => handleBuscarRelAtendimento(e.target.value)}
            autoFocus
          />
        </div>
        {relResultados.length > 0 && (
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: 6, marginTop: 4 }}>
            {relResultados.map(a => (
              <div
                key={a.id}
                onClick={() => setRelSelecionado(a)}
                style={{
                  padding: '8px 12px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-primary)',
                  background: relSelecionado?.id === a.id ? 'color-mix(in srgb, var(--accent) 12%, var(--card-bg))' : 'var(--card-bg)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{a.titulo || `ATN-${a.id}`}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  {a.codigo && <span style={{ fontFamily: 'monospace', marginRight: 8 }}>{a.codigo}</span>}
                  {a.cliente && <span>{a.cliente}</span>}
                  <span className={`status-badge ${(a.status || '').toLowerCase()}`} style={{ marginLeft: 6, fontSize: '0.64rem' }}>{a.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {relSelecionado && (
          <div style={{ marginTop: 8, padding: 8, background: 'color-mix(in srgb, var(--accent) 8%, var(--card-bg))', borderRadius: 6, fontSize: '0.82rem', border: '1px solid var(--accent)' }}>
            Selecionado: <strong>{relSelecionado.titulo || `ATN-${relSelecionado.id}`}</strong>
          </div>
        )}
      </Modal>

      {/* Modal: Upload de Anexo (APEX P0392) */}
      <Modal
        open={uploadModal}
        onClose={() => { setUploadModal(false); setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
        title="Novo Anexo"
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setUploadModal(false); setUploadFile(null); }}>Cancelar</button>
            <button className="btn-primary" onClick={handleUpload} disabled={uploading || !uploadFile}>
              {uploading ? 'Enviando...' : 'Enviar Arquivo'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Arquivo *</label>
          <input
            ref={fileInputRef}
            type="file"
            className="form-control"
            onChange={e => setUploadFile(e.target.files?.[0] || null)}
          />
          {uploadFile && (
            <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {uploadFile.name} · {(uploadFile.size / 1024).toFixed(0)} KB
            </div>
          )}
        </div>
        <div className="form-group">
          <label>Tipo de Anexo</label>
          <input
            className="form-control"
            placeholder="ex: Laudo, Foto, Contrato, NF-e"
            value={uploadForm.tipo}
            onChange={e => setUploadForm(f => ({ ...f, tipo: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Modal: Vincular CHM/RQ03 (tarefa 250) */}
      <Modal
        open={vinculoExtModal}
        onClose={() => setVinculoExtModal(false)}
        title="Vincular Chamado ou RQ03"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setVinculoExtModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleCriarVinculoExt} disabled={savingVinculoExt}>
              {savingVinculoExt ? 'Vinculando...' : 'Vincular'}
            </button>
          </>
        }
      >
        <div className="form-row-2">
          <div className="form-group">
            <label>Tipo</label>
            <select className="form-control" value={vinculoExtForm.ref_tipo} onChange={e => setVinculoExtForm(f => ({ ...f, ref_tipo: e.target.value }))}>
              <option value="CHM">Chamado (CHM)</option>
              <option value="RQ03">Não Conformidade (RQ03)</option>
            </select>
          </div>
          <div className="form-group">
            <label>ID do {vinculoExtForm.ref_tipo === 'CHM' ? 'Chamado' : 'RQ03'}</label>
            <input
              className="form-control"
              type="number"
              placeholder="Ex: 123"
              value={vinculoExtForm.ref_id}
              onChange={e => setVinculoExtForm(f => ({ ...f, ref_id: e.target.value }))}
            />
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Informe o ID do {vinculoExtForm.ref_tipo === 'CHM' ? 'chamado' : 'RQ03'} para criar o vínculo. O sistema irá buscar o código e título automaticamente.
        </p>
      </Modal>

      {/* Modal: Solicitar Autorização de Custo (tarefa 249) */}
      <Modal
        open={autorizacaoModal}
        onClose={() => setAutorizacaoModal(false)}
        title="Solicitar Autorização de Custo"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAutorizacaoModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSolicitarAutorizacao} disabled={savingAutorizacao}>
              {savingAutorizacao ? 'Enviando...' : 'Solicitar'}
            </button>
          </>
        }
      >
        {custoResumo && (
          <div style={{ background: '#ef444410', border: '1px solid #ef444440', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            <strong style={{ color: '#ef4444' }}>Custo total excede o limite configurado</strong>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Total das peças: <strong>R$ {Number(custoResumo.custo_total).toFixed(2)}</strong>
              {custoResumo.limite != null && <> · Limite: <strong>R$ {Number(custoResumo.limite).toFixed(2)}</strong></>}
            </div>
          </div>
        )}
        <div className="form-group">
          <label>Justificativa / Observação</label>
          <textarea
            className="form-control" rows={4}
            placeholder="Descreva o motivo e a necessidade de autorização..."
            value={autorizacaoObs}
            onChange={e => setAutorizacaoObs(e.target.value)}
          />
        </div>
      </Modal>

      {/* Modal: Adicionar Peça (tarefa 248) */}
      <Modal
        open={pecaModal}
        onClose={() => setPecaModal(false)}
        title="Adicionar Peça Utilizada"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPecaModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleAdicionarPeca} disabled={savingPeca}>
              {savingPeca ? 'Salvando...' : 'Adicionar'}
            </button>
          </>
        }
      >
        <div className="form-row-2">
          <div className="form-group">
            <label>Código / Referência</label>
            <input className="form-control" placeholder="Ex: ABC-001" value={pecaForm.codigo} onChange={e => setPecaForm(f => ({ ...f, codigo: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Descrição *</label>
            <input className="form-control" placeholder="Nome da peça" value={pecaForm.descricao} onChange={e => setPecaForm(f => ({ ...f, descricao: e.target.value }))} />
          </div>
        </div>
        <div className="form-row-3">
          <div className="form-group">
            <label>Quantidade</label>
            <input className="form-control" type="number" min="0" step="0.001" value={pecaForm.quantidade} onChange={e => setPecaForm(f => ({ ...f, quantidade: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Unidade</label>
            <input className="form-control" placeholder="UN" value={pecaForm.unidade} onChange={e => setPecaForm(f => ({ ...f, unidade: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Valor Unitário (R$)</label>
            <input className="form-control" type="number" min="0" step="0.01" placeholder="0.00" value={pecaForm.valor_unit} onChange={e => setPecaForm(f => ({ ...f, valor_unit: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label>Observação</label>
          <textarea className="form-control" rows={2} value={pecaForm.observacao} onChange={e => setPecaForm(f => ({ ...f, observacao: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}

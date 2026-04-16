/**
 * APEX pg 75 — Cadastro de Documento (Form + Revisões + Distribuição)
 * APEX pg 61 — Nova Revisão (Modal upload)
 * APEX pg 71 — Distribuição / Compartilhar
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { documentoService } from '../../services/documentos/documentoService';
import Modal from '../../components/Modal';
import { DetailSection, EmptyState } from '../../components/ui';
import '../../components/Modal.css';
import '../planos_acao/PlanoDetail.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function DocumentoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalDistribuicao, setModalDistribuicao] = useState(false);
  const [processoId, setProcessoId] = useState('');
  const [processos, setProcessos] = useState([]);
  const [modalRevisao, setModalRevisao] = useState(false);
  const [revisaoForm, setRevisaoForm] = useState({ descricao_alteracao: '' });
  const [savingRevisao, setSavingRevisao] = useState(false);
  const [modalAcesso, setModalAcesso] = useState(false);
  const [acessoForm, setAcessoForm] = useState({ tp_acesso: '', dt_proxima_revisao: '' });

  useEffect(() => { fetchData(); }, [id]);
  useEffect(() => {
    import('../../lib/api').then(({ default: api }) => {
      api.get('/api/lov/processos').then(r => setProcessos(r.data.items || [])).catch(() => {});
    });
  }, []);

  const fetchData = async () => {
    try {
      const { data } = await documentoService.obter(id);
      setDoc(data);
    } catch { toast.error('Erro ao carregar documento'); navigate('/documentos'); }
    finally { setLoading(false); }
  };

  const addDistribuicao = async () => {
    if (!processoId) { toast.error('Selecione um processo'); return; }
    try {
      const api = (await import('../../lib/api')).default;
      await api.post(`/api/documentos/${id}/distribuicao`, { processo_id: Number(processoId) });
      toast.success('Processo vinculado');
      setModalDistribuicao(false);
      setProcessoId('');
      fetchData();
    } catch { toast.error('Erro'); }
  };

  const criarRevisao = async () => {
    if (!revisaoForm.descricao_alteracao.trim()) { toast.error('Descreva as alterações'); return; }
    setSavingRevisao(true);
    try {
      await documentoService.criarRevisao(id, {
        descricao_alteracao: revisaoForm.descricao_alteracao.trim(),
        notificar: true,
        titulo: doc?._titulo || doc?.titulo,
      });
      toast.success('Revisão criada e usuários notificados');
      setModalRevisao(false);
      setRevisaoForm({ descricao_alteracao: '' });
      fetchData();
    } catch { toast.error('Erro ao criar revisão'); }
    finally { setSavingRevisao(false); }
  };

  const salvarAcesso = async () => {
    try {
      await documentoService.atualizarAcesso(id, {
        tp_acesso: acessoForm.tp_acesso || null,
        dt_proxima_revisao: acessoForm.dt_proxima_revisao || null,
      });
      toast.success('Configurações salvas');
      setModalAcesso(false);
      fetchData();
    } catch { toast.error('Erro ao salvar'); }
  };

  const removeDistribuicao = async (procId) => {
    if (!window.confirm('Remover distribuição?')) return;
    try {
      const api = (await import('../../lib/api')).default;
      await api.delete(`/api/documentos/${id}/distribuicao/${procId}`);
      toast.success('Removido');
      fetchData();
    } catch { toast.error('Erro'); }
  };

  if (loading) return (
    <div className="plano-detail">
      <div className="plano-header-card" style={{ height: 80 }} />
      <div className="plano-section" style={{ height: 140 }} />
    </div>
  );
  if (!doc) return null;

  const titulo = doc._titulo || doc.titulo || doc.descricao || 'Documento';
  const codigo = doc._codigo || doc.codigo || doc.cod_documento || '';
  const revisaoAtual = (doc.revisoes || []).length > 0 ? doc.revisoes[0].numero_revisao : 0;

  return (
    <div className="plano-detail">
      {/* Header */}
      <div className="plano-header-card">
        <div className="plano-header-left">
          <div className="plano-breadcrumb-text">
            <a onClick={() => navigate('/documentos')} style={{ cursor: 'pointer' }}>Documentos</a>
            {' › '}{titulo}
          </div>
          <div className="plano-header-title-row">
            <h2 className="plano-title">{titulo}</h2>
            {codigo && (
              <span className="plano-status-badge" style={{ background: '#005B96', color: '#fff', borderRadius: 12, padding: '3px 12px', fontSize: '0.78rem', fontWeight: 700 }}>
                {codigo}
              </span>
            )}
          </div>
        </div>
        <div className="plano-header-right">
          <button className="plano-btn" style={{ background: 'var(--accent)', color: '#fff' }}
            onClick={() => { setRevisaoForm({ descricao_alteracao: '' }); setModalRevisao(true); }}>
            + Nova Revisão
          </button>
          <button className="plano-btn plano-btn-voltar"
            onClick={() => { setAcessoForm({ tp_acesso: doc?.tp_acesso || '', dt_proxima_revisao: doc?.dt_proxima_revisao || '' }); setModalAcesso(true); }}>
            Acesso / Revisão
          </button>
          <button className="plano-btn plano-btn-voltar" onClick={() => navigate('/documentos')}>◁ Voltar</button>
        </div>
      </div>

      {/* Info */}
      <div className="plano-section">
        <div className="plano-section-body">
        <div className="plano-row">
          <div className="plano-field" style={{ flex: 2 }}>
            <label className="plano-label">Título / Descrição</label>
            <input className="plano-input" readOnly value={titulo} />
          </div>
          <div className="plano-field">
            <label className="plano-label">Código</label>
            <input className="plano-input" readOnly value={codigo} />
          </div>
        </div>
        <div className="plano-row">
          <div className="plano-field">
            <label className="plano-label">Tipo</label>
            <input className="plano-input" readOnly value={doc.tipo || '—'} />
          </div>
          <div className="plano-field">
            <label className="plano-label">Responsável</label>
            <input className="plano-input" readOnly value={doc.responsavel_nome || '—'} />
          </div>
          <div className="plano-field">
            <label className="plano-label">Processo</label>
            <input className="plano-input" readOnly value={doc.processo_nome || '—'} />
          </div>
        </div>
        <div className="plano-row">
          <div className="plano-field">
            <label className="plano-label">Status</label>
            <input className="plano-input" readOnly value={doc.ativo === 'N' ? 'Inativo' : 'Ativo'} />
          </div>
          <div className="plano-field">
            <label className="plano-label">Revisão Atual</label>
            <input className="plano-input" readOnly value={revisaoAtual} />
          </div>
          <div className="plano-field">
            <label className="plano-label">Acesso</label>
            <input className="plano-input" readOnly value={doc.tp_acesso === 'M' ? 'Manutenção' : 'Consulta'} />
          </div>
        </div>
        </div>
      </div>

      {/* Revisões */}
      <DetailSection title={`Revisões (${(doc.revisoes || []).length})`}>
        {(doc.revisoes || []).length === 0 ? (
          <EmptyState title="Nenhuma revisão encontrada." />
        ) : (
          <div className="planos-table-wrapper">
            <table className="planos-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Rev.</th>
                  <th>Arquivo</th>
                  <th>Alterações</th>
                  <th>Autor</th>
                  <th>Data</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {(doc.revisoes || []).map(r => (
                  <tr key={r.id} className="planos-row">
                    <td style={{ fontWeight: 700, fontFamily: 'monospace', textAlign: 'center' }}>
                      {r.numero_revisao != null ? String(r.numero_revisao).padStart(2, '0') : '—'}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '0.78rem' }}>{r.filename || '—'}</td>
                    <td style={{ fontSize: '0.78rem', maxWidth: 300 }}>{r.descricao_alteracao || '—'}</td>
                    <td style={{ fontSize: '0.78rem' }}>{r.autor || '—'}</td>
                    <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      {r.dt_revisao ? new Date(r.dt_revisao).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {r.filename && (
                        <a href={`${API_BASE}/api/documentos/revisoes/${r.id}/download`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--accent)', fontSize: '1rem', textDecoration: 'none' }}
                          title="Download">&#11015;</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>

      {/* Distribuição (processos vinculados) */}
      <DetailSection title={`Distribuição (${(doc.distribuicao || []).length} processos)`} actions={<button className="plano-btn-participante" onClick={() => setModalDistribuicao(true)}>+ Adicionar Processo</button>}>
        {(doc.distribuicao || []).length === 0 ? (
          <EmptyState title="Nenhum processo vinculado." />
        ) : (
          <div className="plano-equipe-grid">
            {(doc.distribuicao || []).map(d => (
              <div key={d.id} className="plano-equipe-card">
                <span className="plano-equipe-avatar" style={{ background: '#005B96', fontSize: '0.6rem' }}>
                  {(d.processo_nome || '?')[0]?.toUpperCase()}
                </span>
                <span className="plano-equipe-nome">{d.processo_nome || '—'}</span>
                <button onClick={() => removeDistribuicao(d.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>
                  &#10005;
                </button>
              </div>
            ))}
          </div>
        )}
      </DetailSection>

      {/* Compartilhado com */}
      {(doc.compartilhado_com || []).length > 0 && (
        <DetailSection title="Compartilhado com">
          <div className="plano-equipe-grid">
            {(doc.compartilhado_com || []).map(c => (
              <div key={c.id} className="plano-equipe-card">
                <span className="plano-equipe-avatar" style={{ background: '#009688' }}>
                  {(c.usuario_nome || '?')[0]?.toUpperCase()}
                </span>
                <span className="plano-equipe-nome">{c.usuario_nome || `User #${c.usuario_id}`}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {/* Modal Distribuicao */}
      <Modal open={modalDistribuicao} onClose={() => setModalDistribuicao(false)} title="Vincular Processo" size="small"
        footer={<><button className="btn-secondary" onClick={() => setModalDistribuicao(false)}>Cancelar</button><button className="btn-primary" onClick={addDistribuicao}>Vincular</button></>}>
        <div className="form-group">
          <label>Processo</label>
          <select className="form-control" value={processoId} onChange={e => setProcessoId(e.target.value)}>
            <option value="">Selecione...</option>
            {processos.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </Modal>

      {/* Modal Nova Revisão */}
      <Modal open={modalRevisao} onClose={() => setModalRevisao(false)} title="Nova Revisão" size="small"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalRevisao(false)}>Cancelar</button>
            <button className="btn-primary" onClick={criarRevisao} disabled={savingRevisao}>
              {savingRevisao ? 'Salvando...' : 'Criar Revisão'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Descrição das Alterações *</label>
          <textarea className="form-control" rows={4}
            value={revisaoForm.descricao_alteracao}
            onChange={e => setRevisaoForm(f => ({ ...f, descricao_alteracao: e.target.value }))}
            placeholder="O que foi alterado nesta revisão?"
          />
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Os usuários com acesso ao documento serão notificados automaticamente.
        </p>
      </Modal>

      {/* Modal Controle de Acesso */}
      <Modal open={modalAcesso} onClose={() => setModalAcesso(false)} title="Acesso e Revisão Prevista" size="small"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalAcesso(false)}>Cancelar</button>
            <button className="btn-primary" onClick={salvarAcesso}>Salvar</button>
          </>
        }
      >
        <div className="form-group">
          <label>Nível de Acesso</label>
          <select className="form-control"
            value={acessoForm.tp_acesso}
            onChange={e => setAcessoForm(f => ({ ...f, tp_acesso: e.target.value }))}>
            <option value="">Padrão (Interno)</option>
            <option value="PUBLICO">Público</option>
            <option value="INTERNO">Interno</option>
            <option value="CONFIDENCIAL">Confidencial</option>
          </select>
        </div>
        <div className="form-group">
          <label>Próxima Revisão Prevista</label>
          <input type="date" className="form-control"
            value={acessoForm.dt_proxima_revisao}
            onChange={e => setAcessoForm(f => ({ ...f, dt_proxima_revisao: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}

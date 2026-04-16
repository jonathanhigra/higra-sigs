import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { chamadoService } from '../../services/chamados/chamadoService';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { Breadcrumbs, CopyButton, RelativeTime } from '../../components/ui';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

export default function ChamadoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [chm, setChm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [operating, setOperating] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  // Templates de resposta
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  // Observação interna
  const [obsInterna, setObsInterna] = useState('');
  const [showObs, setShowObs] = useState(false);
  const [savingObs, setSavingObs] = useState(false);

  // Encerrar modal
  const [encerrarOpen, setEncerrarOpen] = useState(false);
  const [satisfacao, setSatisfacao] = useState(0);
  const [savingEncerrar, setSavingEncerrar] = useState(false);

  const fetchData = async () => {
    try {
      const { data } = await chamadoService.obter(id);
      setChm(data);
    } catch { toast.error('Erro ao carregar chamado'); navigate('/chamados'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);

  useEffect(() => {
    api.get('/api/chamados/templates').then(({ data }) => setTemplates(data.items || data || [])).catch(() => {});
  }, []);

  useDocumentTitle(chm ? (chm.titulo || `Chamado #${chm.id}`) : 'Chamado');

  if (loading) return (
    <div className="detail-page">
      <div className="dp-skeleton-header" />
      <div className="dp-skeleton-cards">
        {[1,2,3,4,5].map(i => <div key={i} className="dp-skeleton-card" />)}
      </div>
    </div>
  );
  if (!chm) return null;

  const handleAddComment = async () => {
    if (!newComment.trim() || sendingComment) return;
    setSendingComment(true);
    try {
      await chamadoService.addComentario(id, { comentario: newComment });
      setNewComment('');
      fetchData();
    } catch { toast.error('Erro ao enviar comentário'); }
    finally { setSendingComment(false); }
  };

  const handleTemplateSelect = (e) => {
    const tid = e.target.value;
    setSelectedTemplate(tid);
    if (!tid) return;
    const tpl = templates.find(t => String(t.id) === String(tid));
    if (tpl) setNewComment(tpl.conteudo || '');
  };

  const handleSaveObs = async () => {
    setSavingObs(true);
    try {
      await chamadoService.atualizar(id, { observacao_interna: obsInterna });
      toast.success('Observação salva');
      setShowObs(false);
    } catch { toast.error('Erro ao salvar observação'); }
    finally { setSavingObs(false); }
  };

  const handleEncerrar = async () => {
    if (satisfacao < 1) { toast.error('Selecione uma avaliação'); return; }
    setSavingEncerrar(true);
    try {
      await api.post(`/api/chamados/${id}/encerrar`, { satisfacao });
      toast.success('Chamado encerrado');
      setEncerrarOpen(false);
      fetchData();
    } catch { toast.error('Erro ao encerrar'); }
    finally { setSavingEncerrar(false); }
  };

  const handleStatus = async (status) => {
    if (operating) return;
    setOperating(true);
    try {
      await chamadoService.atualizar(id, { status });
      toast.success('Status atualizado');
      fetchData();
    } catch { toast.error('Erro ao atualizar status'); }
    finally { setOperating(false); }
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[{ label: 'Chamados', to: '/chamados' }, { label: chm.codigo || `CHM-${chm.id}` }]} />
          <div className="dp-code" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {chm.codigo || `CHM-${chm.id}`}
            <CopyButton value={chm.codigo || `CHM-${chm.id}`} label="Copiar código" size={12} />
          </div>
          <h1>Chamado {chm.codigo || `#${chm.id}`}</h1>
        </div>
        <div className="dp-header-actions">
          {chm.status === 'ABERTO' && <button className="btn-primary" disabled={operating} onClick={() => handleStatus('EM_ANDAMENTO')}>{operating ? '...' : 'Iniciar'}</button>}
          {chm.status === 'EM_ANDAMENTO' && <button className="btn-primary" disabled={operating} onClick={() => handleStatus('RESOLVIDO')}>{operating ? '...' : 'Resolver'}</button>}
          {chm.status === 'RESOLVIDO' && <button className="btn-primary" disabled={operating} onClick={() => handleStatus('FECHADO')}>{operating ? '...' : 'Fechar'}</button>}
          {chm.status !== 'FECHADO' && (
            <button className="btn-secondary" onClick={() => { setSatisfacao(0); setEncerrarOpen(true); }}>Encerrar</button>
          )}
          <button className="btn-secondary" onClick={() => navigate('/chamados')}>Voltar</button>
        </div>
      </div>

      <div className="detail-cards">
        <div className="detail-card"><div className="dc-label">Status</div><div className="dc-value"><span className={`status-badge ${(chm.status||'').toLowerCase().replace('_','-')}`}>{chm.status}</span></div></div>
        <div className="detail-card"><div className="dc-label">Prioridade</div><div className="dc-value">{chm.prioridade && <span className={`prioridade-badge ${(chm.prioridade||'').toLowerCase()}`}>{chm.prioridade}</span>}</div></div>
        <div className="detail-card"><div className="dc-label">Solicitante</div><div className="dc-value">{chm.solicitante_nome || '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Responsável</div><div className="dc-value">{chm.responsavel_nome || '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Abertura</div><div className="dc-value">{chm.dt_abertura ? new Date(chm.dt_abertura).toLocaleDateString('pt-BR') : '—'}</div></div>
      </div>

      {(chm.titulo || chm.descricao) && (
        <div className="dp-description">
          {chm.titulo && <div className="dp-description-title">{chm.titulo}</div>}
          {chm.descricao && <div className="dp-description-text">{chm.descricao}</div>}
        </div>
      )}

      <div className="dp-section-title">Comentários ({(chm.comentarios || []).length})</div>

      <div className="dp-timeline">
        {(chm.comentarios || []).length === 0 && (
          <div className="empty-state">Nenhum comentário ainda</div>
        )}
        {(chm.comentarios || []).map(c => (
          <div key={c.id} className="dp-timeline-item">
            <div className="dp-timeline-header">
              <span className="dp-timeline-author">{c.usuario_nome || '—'}</span>
              <span className="dp-timeline-date"><RelativeTime value={c.created_at} /></span>
            </div>
            <div className="dp-timeline-body">{c.comentario}</div>
          </div>
        ))}
      </div>

      {/* Template selector */}
      {templates.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <select
            value={selectedTemplate}
            onChange={handleTemplateSelect}
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '6px 10px', fontSize: '0.82rem', width: '100%' }}
          >
            <option value="">Selecionar template de resposta...</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.titulo || t.nome || `Template #${t.id}`}</option>
            ))}
          </select>
        </div>
      )}

      <div className="dp-compose">
        <textarea className="form-control" placeholder="Escreva um comentário..." value={newComment}
          onChange={e => setNewComment(e.target.value)} rows={2} />
        <button className="btn-primary" disabled={sendingComment} onClick={handleAddComment}>
          {sendingComment ? '...' : 'Enviar'}
        </button>
      </div>

      {/* Observação interna */}
      <div style={{ marginTop: 10 }}>
        <button className="btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 12px' }}
          onClick={() => setShowObs(v => !v)}>
          {showObs ? 'Ocultar obs. interna' : 'Obs. interna'}
        </button>
        {showObs && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              className="form-control"
              style={{ flex: 1, fontSize: '0.83rem', background: '#fffbeb', borderColor: '#fbbf24' }}
              rows={2}
              placeholder="Observação interna (não visível ao cliente)..."
              value={obsInterna}
              onChange={e => setObsInterna(e.target.value)}
            />
            <button className="btn-primary" style={{ background: '#f59e0b' }} disabled={savingObs} onClick={handleSaveObs}>
              {savingObs ? '...' : 'Salvar'}
            </button>
          </div>
        )}
      </div>

      {/* Modal: Encerrar Chamado */}
      <Modal open={encerrarOpen} onClose={() => setEncerrarOpen(false)} title="Encerrar Chamado"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEncerrarOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={savingEncerrar} onClick={handleEncerrar}>
              {savingEncerrar ? 'Encerrando...' : 'Confirmar Encerramento'}
            </button>
          </>
        }>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
          Avalie o atendimento antes de encerrar o chamado.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button"
              onClick={() => setSatisfacao(n)}
              style={{
                width: 44, height: 44, borderRadius: 8, border: '1.5px solid',
                borderColor: satisfacao >= n ? '#f59e0b' : 'var(--border-primary)',
                background: satisfacao >= n ? '#f59e0b22' : 'var(--bg-surface)',
                cursor: 'pointer', fontSize: '1.3rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {satisfacao >= n ? '★' : '☆'}
            </button>
          ))}
          {satisfacao > 0 && (
            <span style={{ alignSelf: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: 4 }}>
              {satisfacao}/5
            </span>
          )}
        </div>
      </Modal>
    </div>
  );
}

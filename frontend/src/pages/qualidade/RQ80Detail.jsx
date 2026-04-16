/**
 * Tarefas 283-284-285 — RQ80 Detalhe de Auditoria
 * Tabs: Dados, Checklist, Constatações, Cronograma
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { rq80DetailService } from '../../services/qualidade/qualidadeService';
import Modal from '../../components/Modal';
import '../../components/Modal.css';
import '../planos_acao/PlanoDetail.css';

const TABS = ['Dados', 'Checklist', 'Constatações', 'Cronograma'];

const STATUS_MAP = {
  PLANEJADA:   { label: 'Planejada',   bg: '#3b82f6', color: '#fff' },
  EM_EXECUCAO: { label: 'Em Execução', bg: '#f59e0b', color: '#fff' },
  CONCLUIDA:   { label: 'Concluída',   bg: '#22c55e', color: '#fff' },
  CANCELADA:   { label: 'Cancelada',   bg: '#6b7280', color: '#fff' },
};

const RESP_OPCOES = ['OK', 'NOK', 'N_A', 'N_AVALIADO'];

const CONSTATACAO_TIPOS = {
  NC:           { label: 'Não Conformidade', color: '#ef4444' },
  OBSERVACAO:   { label: 'Observação',       color: '#3b82f6' },
  OPORTUNIDADE: { label: 'Oportunidade',     color: '#22c55e' },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

export default function RQ80Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [tab, setTab] = useState('Dados');
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Checklist
  const [modalChecklistOpen, setModalChecklistOpen] = useState(false);
  const [checklistForm, setChecklistForm] = useState({ questao: '' });
  const [savingChecklist, setSavingChecklist] = useState(false);

  // Constatações
  const [modalConstOpen, setModalConstOpen] = useState(false);
  const [constForm, setConstForm] = useState({ descricao: '', tipo: 'NC' });
  const [savingConst, setSavingConst] = useState(false);

  const fetchData = async () => {
    try {
      const { data } = await rq80DetailService.obter(id);
      setAudit(data);
      setEditForm({
        titulo: data.titulo || '',
        tipo: data.tipo || 'INTERNA',
        escopo: data.escopo || '',
        auditor_id: data.auditor_id || '',
        auditado_id: data.auditado_id || '',
        dt_inicio: data.dt_inicio ? data.dt_inicio.split('T')[0] : '',
        dt_fim: data.dt_fim ? data.dt_fim.split('T')[0] : '',
        dt_auditoria: data.dt_auditoria ? data.dt_auditoria.split('T')[0] : '',
        status: data.status || 'PLANEJADA',
        relatorio: data.relatorio || '',
        conclusao: data.conclusao || '',
      });
    } catch {
      toast.error('Erro ao carregar auditoria');
      navigate('/qualidade/rq80');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleSalvar = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = { ...editForm };
      if (payload.auditor_id) payload.auditor_id = Number(payload.auditor_id);
      if (payload.auditado_id) payload.auditado_id = Number(payload.auditado_id);
      if (!payload.auditor_id) delete payload.auditor_id;
      if (!payload.auditado_id) delete payload.auditado_id;
      if (!payload.dt_inicio) delete payload.dt_inicio;
      if (!payload.dt_fim) delete payload.dt_fim;
      if (!payload.dt_auditoria) delete payload.dt_auditoria;
      await rq80DetailService.atualizar(id, payload);
      toast.success('Auditoria atualizada');
      setEditing(false);
      fetchData();
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleRespChecklistItem = async (itemId, resposta) => {
    try {
      await rq80DetailService.updateChecklistItem(id, itemId, { resposta });
      fetchData();
    } catch {
      toast.error('Erro ao atualizar checklist');
    }
  };

  const handleObsChecklistItem = async (itemId, observacao) => {
    try {
      await rq80DetailService.updateChecklistItem(id, itemId, { observacao });
    } catch {
      toast.error('Erro ao atualizar observação');
    }
  };

  const handleAddChecklistItem = async () => {
    if (!checklistForm.questao.trim()) { toast.error('Questão obrigatória'); return; }
    if (savingChecklist) return;
    setSavingChecklist(true);
    try {
      await rq80DetailService.addChecklistItem(id, checklistForm);
      toast.success('Item adicionado');
      setModalChecklistOpen(false);
      setChecklistForm({ questao: '' });
      fetchData();
    } catch {
      toast.error('Erro ao adicionar item');
    } finally {
      setSavingChecklist(false);
    }
  };

  const handleAddConstatacao = async () => {
    if (!constForm.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    if (savingConst) return;
    setSavingConst(true);
    try {
      await rq80DetailService.addConstatacao(id, constForm);
      toast.success('Constatação adicionada');
      setModalConstOpen(false);
      setConstForm({ descricao: '', tipo: 'NC' });
      fetchData();
    } catch {
      toast.error('Erro ao adicionar constatação');
    } finally {
      setSavingConst(false);
    }
  };

  if (loading) return <div className="plano-detail"><p style={{ padding: 32, color: 'var(--text-muted)' }}>Carregando...</p></div>;
  if (!audit) return null;

  const statusKey = (audit.status || 'PLANEJADA').toUpperCase();
  const statusInfo = STATUS_MAP[statusKey] || STATUS_MAP.PLANEJADA;

  return (
    <div className="plano-detail">
      {/* Header */}
      <div className="plano-header-card">
        <div className="plano-header-left">
          <div className="plano-breadcrumb-text">
            <a onClick={() => navigate('/qualidade/rq80')} style={{ cursor: 'pointer' }}>Auditorias</a>
            {' / '}{audit.titulo || `AUD-${audit.id}`}
          </div>
          <div className="plano-header-title-row">
            <h2 className="plano-title">{audit.titulo || `AUD-${audit.id}`}</h2>
            <span className="plano-status-badge" style={{ background: statusInfo.bg, color: statusInfo.color, borderRadius: 12, padding: '3px 12px', fontSize: '0.78rem', fontWeight: 700 }}>
              {statusInfo.label}
            </span>
          </div>
        </div>
        <div className="plano-header-right">
          <button className="plano-btn plano-btn-voltar" onClick={() => navigate('/qualidade/rq80')}>
            ← Voltar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border-primary)', marginBottom: 24 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: tab === t ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.88rem',
              marginBottom: -2,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* TAB: Dados */}
      {tab === 'Dados' && (
        <div className="plano-section">
          <div className="plano-section-header">
            <h3>Informações da Auditoria</h3>
            {!editing ? (
              <button className="plano-btn-participante" onClick={() => setEditing(true)}>Editar</button>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="plano-btn-participante" onClick={handleSalvar} disabled={saving}>{saving ? '...' : 'Salvar'}</button>
                <button className="plano-btn plano-btn-voltar" style={{ fontSize: '0.78rem' }} onClick={() => { setEditing(false); fetchData(); }}>Cancelar</button>
              </div>
            )}
          </div>

          {editing ? (
            <>
              <div className="plano-row" style={{ flexWrap: 'wrap' }}>
                <div className="plano-field">
                  <label className="plano-label">Título</label>
                  <input className="plano-input" value={editForm.titulo} onChange={e => setEditForm(f => ({ ...f, titulo: e.target.value }))} />
                </div>
                <div className="plano-field">
                  <label className="plano-label">Tipo</label>
                  <select className="plano-input" value={editForm.tipo} onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}>
                    <option value="INTERNA">Interna</option>
                    <option value="EXTERNA">Externa</option>
                  </select>
                </div>
                <div className="plano-field">
                  <label className="plano-label">Status</label>
                  <select className="plano-input" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                    {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="plano-row" style={{ flexWrap: 'wrap' }}>
                <div className="plano-field">
                  <label className="plano-label">Data Início</label>
                  <input type="date" className="plano-input" value={editForm.dt_inicio} onChange={e => setEditForm(f => ({ ...f, dt_inicio: e.target.value }))} />
                </div>
                <div className="plano-field">
                  <label className="plano-label">Data Fim</label>
                  <input type="date" className="plano-input" value={editForm.dt_fim} onChange={e => setEditForm(f => ({ ...f, dt_fim: e.target.value }))} />
                </div>
                <div className="plano-field">
                  <label className="plano-label">Data Auditoria</label>
                  <input type="date" className="plano-input" value={editForm.dt_auditoria} onChange={e => setEditForm(f => ({ ...f, dt_auditoria: e.target.value }))} />
                </div>
              </div>
              <div className="plano-field">
                <label className="plano-label">Escopo</label>
                <textarea className="plano-input" rows={3} value={editForm.escopo} onChange={e => setEditForm(f => ({ ...f, escopo: e.target.value }))} />
              </div>
              <div className="plano-field">
                <label className="plano-label">Relatório</label>
                <textarea className="plano-input" rows={4} value={editForm.relatorio} onChange={e => setEditForm(f => ({ ...f, relatorio: e.target.value }))} />
              </div>
              <div className="plano-field">
                <label className="plano-label">Conclusão</label>
                <textarea className="plano-input" rows={4} value={editForm.conclusao} onChange={e => setEditForm(f => ({ ...f, conclusao: e.target.value }))} />
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {[
                { label: 'Tipo', value: audit.tipo },
                { label: 'Status', value: statusInfo.label },
                { label: 'Auditor', value: audit.auditor_nome || '—' },
                { label: 'Auditado', value: audit.auditado_nome || '—' },
                { label: 'Data Início', value: fmtDate(audit.dt_inicio) },
                { label: 'Data Fim', value: fmtDate(audit.dt_fim) },
                { label: 'Data Auditoria', value: fmtDate(audit.dt_auditoria) },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{f.label}</label>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{f.value || '—'}</span>
                </div>
              ))}
              {audit.escopo && (
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: 4 }}>Escopo</label>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{audit.escopo}</span>
                </div>
              )}
              {audit.conclusao && (
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: 4 }}>Conclusão</label>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{audit.conclusao}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB: Checklist */}
      {tab === 'Checklist' && (
        <div className="plano-section">
          <div className="plano-section-header">
            <h3>Checklist ({(audit.checklist || []).length} itens)</h3>
            <button className="plano-btn-participante" onClick={() => setModalChecklistOpen(true)}>+ Adicionar Item</button>
          </div>

          {(audit.checklist || []).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', fontStyle: 'italic', padding: '24px 0' }}>
              Nenhum item no checklist. Clique em "Adicionar Item" para começar.
            </div>
          ) : (
            <div className="planos-table-wrapper">
              <table className="planos-table">
                <thead>
                  <tr>
                    <th>Questão</th>
                    <th style={{ width: 140 }}>Resposta</th>
                    <th>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {(audit.checklist || []).map(item => (
                    <tr key={item.id} className="planos-row">
                      <td style={{ fontSize: '0.85rem' }}>{item.questao}</td>
                      <td>
                        <select
                          className="plano-input"
                          style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                          value={item.resposta || ''}
                          onChange={e => handleRespChecklistItem(item.id, e.target.value)}
                        >
                          <option value="">—</option>
                          {RESP_OPCOES.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          className="plano-input"
                          style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                          defaultValue={item.observacao || ''}
                          onBlur={e => e.target.value !== (item.observacao || '') && handleObsChecklistItem(item.id, e.target.value)}
                          placeholder="Observação..."
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: Constatações */}
      {tab === 'Constatações' && (
        <div className="plano-section">
          <div className="plano-section-header">
            <h3>Constatações ({(audit.constatacoes || []).length})</h3>
            <button className="plano-btn-participante" onClick={() => setModalConstOpen(true)}>+ Adicionar</button>
          </div>

          {(audit.constatacoes || []).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', fontStyle: 'italic', padding: '24px 0' }}>
              Nenhuma constatação registrada.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(audit.constatacoes || []).map(c => {
                const tipoInfo = CONSTATACAO_TIPOS[c.tipo] || CONSTATACAO_TIPOS.NC;
                return (
                  <div key={c.id} style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderLeft: `4px solid ${tipoInfo.color}`,
                    borderRadius: 8,
                    padding: '12px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 10px',
                        borderRadius: 10,
                        background: tipoInfo.color + '22',
                        color: tipoInfo.color,
                      }}>
                        {tipoInfo.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{c.descricao}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: Cronograma */}
      {tab === 'Cronograma' && (
        <div className="plano-section">
          <div className="plano-section-header">
            <h3>Cronograma de Auditorias</h3>
            <button
              className="plano-btn-participante"
              onClick={() => navigate('/qualidade/rq80/cronograma')}
            >
              Ver Cronograma Completo
            </button>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', padding: '24px 0' }}>
            Visualize o cronograma completo de auditorias planejadas para o ano.
          </div>
        </div>
      )}

      {/* Modal: Adicionar Item Checklist */}
      <Modal
        open={modalChecklistOpen}
        onClose={() => setModalChecklistOpen(false)}
        title="Adicionar Item ao Checklist"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalChecklistOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={savingChecklist} onClick={handleAddChecklistItem}>
              {savingChecklist ? 'Adicionando...' : 'Adicionar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Questão *</label>
          <textarea
            className="form-control"
            rows={3}
            value={checklistForm.questao}
            onChange={e => setChecklistForm(f => ({ ...f, questao: e.target.value }))}
            placeholder="Descreva a questão do checklist..."
            autoFocus
          />
        </div>
      </Modal>

      {/* Modal: Adicionar Constatação */}
      <Modal
        open={modalConstOpen}
        onClose={() => setModalConstOpen(false)}
        title="Adicionar Constatação"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalConstOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={savingConst} onClick={handleAddConstatacao}>
              {savingConst ? 'Adicionando...' : 'Adicionar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Tipo *</label>
          <select className="form-control" value={constForm.tipo} onChange={e => setConstForm(f => ({ ...f, tipo: e.target.value }))}>
            {Object.entries(CONSTATACAO_TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Descrição *</label>
          <textarea
            className="form-control"
            rows={4}
            value={constForm.descricao}
            onChange={e => setConstForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Descreva a constatação encontrada..."
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
}

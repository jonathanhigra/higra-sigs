import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';
import SignatureCanvas from '../../components/SignatureCanvas';
import api from '../../lib/api';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const STATUS_COLORS = {
  ABERTO:       '#3b82f6',
  EM_ANDAMENTO: '#f59e0b',
  ENCERRADO:    '#22c55e',
  FECHADO:      '#6b7280',
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[(status || '').toUpperCase()] || '#6b7280';
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700, background: color + '22', color }}>
      {status || '—'}
    </span>
  );
}

function fmtBRL(v) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function LaudoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [laudo, setLaudo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('geral');

  // Geral tab inline edit
  const [editGeral, setEditGeral] = useState({ conclusao: '', recomendacao: '', status: '' });
  const [savingGeral, setSavingGeral] = useState(false);

  // Encerrar modal
  const [encerrarOpen, setEncerrarOpen] = useState(false);
  const [encerrarForm, setEncerrarForm] = useState({ pesquisa_satisfacao: 0, motivo: '' });
  const [savingEncerrar, setSavingEncerrar] = useState(false);

  // Etapas modal
  const [etapaOpen, setEtapaOpen] = useState(false);
  const [etapaDesc, setEtapaDesc] = useState('');
  const [savingEtapa, setSavingEtapa] = useState(false);

  // Custos inline edit
  const [editCustos, setEditCustos] = useState({ custo_estimado: '', custo_real: '' });
  const [savingCustos, setSavingCustos] = useState(false);

  // Assinatura
  const [assinarNome, setAssinarNome] = useState('');
  const [assinarB64, setAssinarB64] = useState(null);
  const [savingAssinatura, setSavingAssinatura] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/laudos/${id}`);
      setLaudo(data);
      setEditGeral({ conclusao: data.conclusao || '', recomendacao: data.recomendacao || '', status: data.status || '' });
      setEditCustos({ custo_estimado: data.custo_estimado ?? '', custo_real: data.custo_real ?? '' });
    } catch { toast.error('Erro ao carregar laudo'); navigate('/laudos'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleSaveGeral = async () => {
    setSavingGeral(true);
    try {
      await api.put(`/api/laudos/${id}`, editGeral);
      toast.success('Laudo atualizado');
      fetchData();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSavingGeral(false); }
  };

  const handleEncerrar = async () => {
    if (encerrarForm.pesquisa_satisfacao < 1) { toast.error('Selecione a avaliação'); return; }
    setSavingEncerrar(true);
    try {
      await api.post(`/api/laudos/${id}/encerrar`, encerrarForm);
      toast.success('Laudo encerrado');
      setEncerrarOpen(false);
      fetchData();
    } catch { toast.error('Erro ao encerrar'); }
    finally { setSavingEncerrar(false); }
  };

  const handleAddEtapa = async () => {
    if (!etapaDesc.trim()) { toast.error('Descrição obrigatória'); return; }
    setSavingEtapa(true);
    try {
      await api.post(`/api/laudos/${id}/etapas`, { descricao: etapaDesc });
      toast.success('Etapa adicionada');
      setEtapaOpen(false);
      setEtapaDesc('');
      fetchData();
    } catch { toast.error('Erro ao adicionar etapa'); }
    finally { setSavingEtapa(false); }
  };

  const handleSaveCustos = async () => {
    setSavingCustos(true);
    try {
      await api.put(`/api/laudos/${id}`, { custo_estimado: editCustos.custo_estimado, custo_real: editCustos.custo_real });
      toast.success('Custos atualizados');
      fetchData();
    } catch { toast.error('Erro ao salvar'); }
    finally { setSavingCustos(false); }
  };

  const handleAssinar = async () => {
    if (!assinarB64) { toast.error('Adicione a assinatura'); return; }
    if (!assinarNome.trim()) { toast.error('Nome obrigatório'); return; }
    setSavingAssinatura(true);
    try {
      await api.post(`/api/laudos/${id}/assinar`, { assinatura: assinarB64, nome: assinarNome });
      toast.success('Assinatura salva');
      fetchData();
    } catch { toast.error('Erro ao salvar assinatura'); }
    finally { setSavingAssinatura(false); }
  };

  if (loading) return (
    <div className="detail-page" style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div className="dp-skeleton-header" />
      <div className="dp-skeleton-cards">{[1,2,3].map(i => <div key={i} className="dp-skeleton-card" />)}</div>
    </div>
  );
  if (!laudo) return null;

  const tabs = [
    { key: 'geral', label: 'Geral' },
    { key: 'etapas', label: `Etapas (${(laudo.etapas || []).length})` },
    { key: 'custos', label: 'Custos' },
    { key: 'assinatura', label: 'Assinatura' },
  ];

  const variance = (parseFloat(editCustos.custo_real) || 0) - (parseFloat(editCustos.custo_estimado) || 0);

  return (
    <div className="tarefas-page" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <button className="btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 10px', marginBottom: 6 }} onClick={() => navigate('/laudos')}>
            ← Laudos
          </button>
          <h1 style={{ margin: 0, fontSize: '1.3rem' }}>{laudo.titulo}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusBadge status={laudo.status} />
          {laudo.status !== 'FECHADO' && (
            <button className="btn-primary" onClick={() => setEncerrarOpen(true)}>Encerrar Laudo</button>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="detail-cards" style={{ marginBottom: 20 }}>
        <div className="detail-card"><div className="dc-label">Tipo</div><div className="dc-value">{laudo.tipo || '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Cliente</div><div className="dc-value">{laudo.cliente || '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Nr. Série</div><div className="dc-value">{laudo.nr_serie || '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Modelo</div><div className="dc-value">{laudo.modelo || '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Técnico</div><div className="dc-value">{laudo.tecnico_nome || '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Data</div><div className="dc-value">{laudo.dt_laudo ? new Date(laudo.dt_laudo).toLocaleDateString('pt-BR') : '—'}</div></div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border-primary)', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              background: 'none', border: 'none', padding: '8px 18px', fontWeight: 600,
              fontSize: '0.85rem', cursor: 'pointer', borderBottom: activeTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === t.key ? 'var(--accent)' : 'var(--text-muted)', marginBottom: -2,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Geral */}
      {activeTab === 'geral' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status:</label>
            <select className="form-control" style={{ width: 'auto' }}
              value={editGeral.status}
              onChange={e => setEditGeral(f => ({ ...f, status: e.target.value }))}>
              <option value="ABERTO">Aberto</option>
              <option value="EM_ANDAMENTO">Em Andamento</option>
              <option value="ENCERRADO">Encerrado</option>
              <option value="FECHADO">Fechado</option>
            </select>
          </div>
          <div className="form-group">
            <label>Conclusão</label>
            <textarea className="form-control" rows={4} value={editGeral.conclusao}
              onChange={e => setEditGeral(f => ({ ...f, conclusao: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Recomendação</label>
            <textarea className="form-control" rows={3} value={editGeral.recomendacao}
              onChange={e => setEditGeral(f => ({ ...f, recomendacao: e.target.value }))} />
          </div>
          <div>
            <button className="btn-primary" disabled={savingGeral} onClick={handleSaveGeral}>
              {savingGeral ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* Tab: Etapas */}
      {activeTab === 'etapas' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn-primary" onClick={() => setEtapaOpen(true)}>+ Adicionar Etapa</button>
          </div>
          {(laudo.etapas || []).length === 0 ? (
            <div className="empty-state">Nenhuma etapa registrada</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {laudo.etapas.map((et, idx) => (
                <div key={et.id || idx} className="dp-etapa-item">
                  <div className="dp-etapa-left">
                    <div className="dp-etapa-num">{idx + 1}</div>
                    <div>
                      <div className="dp-etapa-title">{et.descricao}</div>
                      {et.dt_etapa && <div className="dp-etapa-meta">{new Date(et.dt_etapa).toLocaleDateString('pt-BR')}</div>}
                    </div>
                  </div>
                  <StatusBadge status={et.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Custos */}
      {activeTab === 'custos' && (
        <div style={{ maxWidth: 420 }}>
          <div className="form-group">
            <label>Custo Estimado (R$)</label>
            <input className="form-control" type="number" step="0.01" value={editCustos.custo_estimado}
              onChange={e => setEditCustos(f => ({ ...f, custo_estimado: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Custo Real (R$)</label>
            <input className="form-control" type="number" step="0.01" value={editCustos.custo_real}
              onChange={e => setEditCustos(f => ({ ...f, custo_real: e.target.value }))} />
          </div>
          {(editCustos.custo_estimado !== '' || editCustos.custo_real !== '') && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-primary)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Variação</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: variance > 0 ? '#ef4444' : '#22c55e' }}>
                {fmtBRL(variance)}
                <span style={{ fontSize: '0.72rem', fontWeight: 400, marginLeft: 6, color: 'var(--text-muted)' }}>
                  {variance > 0 ? 'acima do estimado' : variance < 0 ? 'abaixo do estimado' : 'dentro do estimado'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>Estimado: <strong>{fmtBRL(editCustos.custo_estimado)}</strong></span>
                <span>Real: <strong>{fmtBRL(editCustos.custo_real)}</strong></span>
              </div>
            </div>
          )}
          <button className="btn-primary" disabled={savingCustos} onClick={handleSaveCustos}>
            {savingCustos ? 'Salvando...' : 'Salvar Custos'}
          </button>
        </div>
      )}

      {/* Tab: Assinatura */}
      {activeTab === 'assinatura' && (
        <div>
          {laudo.assinatura_cliente ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid #22c55e', display: 'inline-block' }}>
                <span style={{ color: '#22c55e', fontWeight: 700 }}>Assinado por: {laudo.assinatura_nome || '—'}</span>
              </div>
              <img src={laudo.assinatura_cliente} alt="Assinatura do cliente"
                style={{ maxWidth: 400, border: '1px solid var(--border-primary)', borderRadius: 8, background: '#fff' }} />
            </div>
          ) : (
            <div style={{ maxWidth: 500 }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Este laudo ainda não foi assinado pelo cliente.
              </p>
              <div className="form-group">
                <label>Nome do signatário *</label>
                <input className="form-control" value={assinarNome}
                  onChange={e => setAssinarNome(e.target.value)} placeholder="Nome completo" />
              </div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                Assinatura digital
              </label>
              <SignatureCanvas
                onSave={b64 => setAssinarB64(b64)}
                onClear={() => setAssinarB64(null)}
                width={460}
                height={180}
                label="Assine aqui com o dedo ou mouse"
              />
              {assinarB64 && (
                <p style={{ fontSize: '0.78rem', color: '#22c55e', marginTop: 8 }}>Assinatura capturada.</p>
              )}
              <div style={{ marginTop: 14 }}>
                <button className="btn-primary" disabled={savingAssinatura || !assinarB64} onClick={handleAssinar}>
                  {savingAssinatura ? 'Salvando...' : 'Salvar Assinatura'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Adicionar Etapa */}
      <Modal open={etapaOpen} onClose={() => setEtapaOpen(false)} title="Adicionar Etapa"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEtapaOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={savingEtapa} onClick={handleAddEtapa}>
              {savingEtapa ? 'Salvando...' : 'Adicionar'}
            </button>
          </>
        }>
        <div className="form-group">
          <label>Descrição *</label>
          <input className="form-control" value={etapaDesc}
            onChange={e => setEtapaDesc(e.target.value)} placeholder="Descreva a etapa..." />
        </div>
      </Modal>

      {/* Modal: Encerrar Laudo */}
      <Modal open={encerrarOpen} onClose={() => setEncerrarOpen(false)} title="Encerrar Laudo"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEncerrarOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={savingEncerrar} onClick={handleEncerrar}>
              {savingEncerrar ? 'Encerrando...' : 'Confirmar Encerramento'}
            </button>
          </>
        }>
        <div className="form-group">
          <label>Avaliação de satisfação *</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button"
                onClick={() => setEncerrarForm(f => ({ ...f, pesquisa_satisfacao: n }))}
                style={{
                  width: 40, height: 40, borderRadius: 8, border: '1.5px solid',
                  borderColor: encerrarForm.pesquisa_satisfacao >= n ? '#f59e0b' : 'var(--border-primary)',
                  background: encerrarForm.pesquisa_satisfacao >= n ? '#f59e0b22' : 'var(--bg-surface)',
                  cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {encerrarForm.pesquisa_satisfacao >= n ? '★' : '☆'}
              </button>
            ))}
            {encerrarForm.pesquisa_satisfacao > 0 && (
              <span style={{ alignSelf: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {encerrarForm.pesquisa_satisfacao}/5
              </span>
            )}
          </div>
        </div>
        <div className="form-group">
          <label>Motivo / Observação</label>
          <textarea className="form-control" rows={3} value={encerrarForm.motivo}
            onChange={e => setEncerrarForm(f => ({ ...f, motivo: e.target.value }))}
            placeholder="Descreva o motivo do encerramento..." />
        </div>
      </Modal>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { rq03Service } from '../../services/qualidade/rq03Service';
import Modal from '../../components/Modal';
import { Breadcrumbs, RelativeTime, CopyButton } from '../../components/ui';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

/* Etapas de análise — cada uma é um modal separado (APEX pg 368, 371, 374, 377, 378) */
const ANALISE_ETAPAS = [
  { key: 'extensao',       label: 'Análise de Extensão',      campo: 'analise_extensao' },
  { key: 'causa_raiz',     label: 'Causa Raiz (5 Porquês)',   campo: 'causa_raiz' },
  { key: 'acao_imediata',  label: 'Ação Imediata',            campo: 'acao_imediata' },
  { key: 'contencao',      label: 'Ação de Contenção',        campo: 'acao_contencao' },
  { key: 'acao_corretiva', label: 'Ação Corretiva',           campo: 'acao_corretiva' },
  { key: 'implementacao',  label: 'Análise de Implementação', campo: 'analise_implementacao' },
  { key: 'eficacia',       label: 'Análise de Eficácia',      campo: 'analise_eficacia' },
];

export default function RQ03Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [rq, setRq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('analises');
  const [modalAnalise, setModalAnalise] = useState(null);
  const [analiseTexto, setAnaliseTexto] = useState('');
  // Structured analysis state (tarefas 258-261)
  const [analisePq, setAnalisePq] = useState({ pq1: '', pq2: '', pq3: '', pq4: '', pq5: '' });
  const [analiseExt, setAnaliseExt] = useState({ ext_afeta_outros: 'N', ext_processos_afetados: '' });
  const [analiseImpl, setAnaliseImpl] = useState({ impl_realizada: 'N', impl_evidencias: '', impl_data: '' });
  const [analiseEfic, setAnaliseEfic] = useState({ efic_periodo_dias: '', efic_eficaz: 'N' });
  const [newAnot, setNewAnot] = useState('');
  const [savingAnalise, setSavingAnalise] = useState(false);
  const [sendingAnot, setSendingAnot] = useState(false);
  const [operating, setOperating] = useState(false);
  const [togglingAcidente, setTogglingAcidente] = useState(false);
  // Evidências antes/depois (tarefa 263)
  const [evidencias, setEvidencias] = useState([]);
  const [uploadingEvid, setUploadingEvid] = useState(false);
  const [transicoes, setTransicoes] = useState(null);
  const [historicoTrans, setHistoricoTrans] = useState([]);
  const [showTransMenu, setShowTransMenu] = useState(false);
  const [transMotivo, setTransMotivo] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [rastreab, setRastreab] = useState(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [loadingRastreab, setLoadingRastreab] = useState(false);

  const fetchData = async () => {
    try {
      const { data } = await rq03Service.obter(id);
      setRq(data);
    } catch { toast.error('Erro ao carregar não conformidade'); navigate('/qualidade/rq03'); }
    finally { setLoading(false); }
  };

  const fetchEvidencias = async () => {
    try { const { data } = await rq03Service.listarEvidencias(id); setEvidencias(data.items || []); }
    catch {}
  };

  const fetchTransicoes = async () => {
    try { const { data } = await rq03Service.transicoesDisponiveis(id); setTransicoes(data); }
    catch {}
  };

  const fetchHistoricoTrans = async () => {
    try { const { data } = await rq03Service.historicoTransicoes(id); setHistoricoTrans(data.items || []); }
    catch {}
  };

  useEffect(() => { fetchData(); fetchEvidencias(); fetchTransicoes(); }, [id]);
  // If ind_acidente toggled off while SST tab is active, switch back
  useEffect(() => { if (rq && rq.ind_acidente !== 'S' && tab === 'sst') setTab('analises'); }, [rq?.ind_acidente]);

  if (loading) return (
    <div className="detail-page">
      <div className="dp-skeleton-header" />
      <div className="dp-skeleton-cards">
        {[1,2,3,4,5,6].map(i => <div key={i} className="dp-skeleton-card" />)}
      </div>
    </div>
  );
  if (!rq) return null;

  const handleSaveAnalise = async () => {
    if (savingAnalise) return;
    setSavingAnalise(true);
    try {
      // Build payload based on which etapa is being saved (tarefas 258-261)
      let extra = {};
      if (modalAnalise.key === 'causa_raiz') extra = analisePq;
      else if (modalAnalise.key === 'extensao') extra = analiseExt;
      else if (modalAnalise.key === 'implementacao') extra = analiseImpl;
      else if (modalAnalise.key === 'eficacia') extra = analiseEfic;
      await rq03Service.salvarAnalise(id, modalAnalise.key, { texto: analiseTexto, ...extra });
      toast.success(`${modalAnalise.label} salva`);
      setModalAnalise(null);
      fetchData();
    } catch { toast.error('Erro ao salvar análise'); }
    finally { setSavingAnalise(false); }
  };

  const handleAddAnot = async () => {
    if (!newAnot.trim() || sendingAnot) return;
    setSendingAnot(true);
    try {
      await rq03Service.addAnotacao(id, { descricao: newAnot });
      setNewAnot('');
      fetchData();
    } catch { toast.error('Erro ao salvar anotação'); }
    finally { setSendingAnot(false); }
  };

  const handleTransicao = async (novoStatus) => {
    if (operating) return;
    setOperating(true);
    try {
      const { data } = await rq03Service.executarTransicao(id, {
        novo_status: novoStatus,
        motivo: transMotivo || null,
      });
      const msg = data?.plano_acao_gerado_id
        ? `Transição realizada — Plano de Ação #${data.plano_acao_gerado_id} gerado`
        : `Transição: ${data.transicao}`;
      toast.success(msg);
      setShowTransMenu(false);
      setTransMotivo('');
      fetchData();
      fetchTransicoes();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(detail || 'Erro na transição');
    } finally {
      setOperating(false);
    }
  };

  // Upload evidência (tarefa 263)
  const handleUploadEvidencia = async (e, tipo) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tipo', tipo);
    fd.append('titulo', `${tipo === 'ANTES' ? 'Antes' : 'Depois'} — ${file.name}`);
    setUploadingEvid(true);
    try {
      await rq03Service.uploadEvidencia(id, fd);
      toast.success(`Evidência "${tipo === 'ANTES' ? 'Antes' : 'Depois'}" enviada`);
      fetchEvidencias();
    } catch { toast.error('Erro ao enviar evidência'); }
    finally { setUploadingEvid(false); e.target.value = ''; }
  };

  const handleDeleteEvidencia = async (evidId) => {
    try {
      await rq03Service.deleteEvidencia(id, evidId);
      toast.success('Evidência removida');
      fetchEvidencias();
    } catch { toast.error('Erro ao remover'); }
  };

  const fetchTimeline = async () => {
    setLoadingTimeline(true);
    try {
      const { data } = await rq03Service.timeline(id);
      setTimeline(data.eventos || []);
    } catch { toast.error('Erro ao carregar timeline'); }
    finally { setLoadingTimeline(false); }
  };

  const fetchRastreabilidade = async () => {
    setLoadingRastreab(true);
    try {
      const { data } = await rq03Service.rastreabilidade(id);
      setRastreab(data);
    } catch { toast.error('Erro ao carregar rastreabilidade'); }
    finally { setLoadingRastreab(false); }
  };

  // Toggle ind_acidente (tarefa 256)
  const handleToggleAcidente = async () => {
    if (togglingAcidente) return;
    const novoValor = rq.ind_acidente === 'S' ? 'N' : 'S';
    setTogglingAcidente(true);
    try {
      await rq03Service.atualizar(id, { ind_acidente: novoValor });
      toast.success(novoValor === 'S' ? 'Marcado como acidente de trabalho' : 'Desmarcado como acidente de trabalho');
      if (novoValor === 'S') setTab('sst');
      fetchData();
    } catch { toast.error('Erro ao atualizar'); }
    finally { setTogglingAcidente(false); }
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[{ label: 'Não Conformidades', to: '/qualidade/rq03' }, { label: rq.codigo || `RQ03-${rq.id}` }]} />
          <div className="dp-code" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {rq.codigo || `RQ03-${rq.id}`}
            <CopyButton value={rq.codigo || `RQ03-${rq.id}`} label="Copiar código" size={12} />
          </div>
          <h1>Não Conformidade {rq.codigo || `#${rq.id}`}</h1>
        </div>
        <div className="dp-header-actions">
          {transicoes && transicoes.transicoes?.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button className="btn-primary" onClick={() => setShowTransMenu(v => !v)} disabled={operating}>
                {operating ? '...' : 'Avançar Status ▾'}
              </button>
              {showTransMenu && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, zIndex: 50, marginTop: 4,
                  background: 'var(--card-bg)', border: '1px solid var(--border-primary)',
                  borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 260, padding: 8,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px', fontWeight: 600 }}>
                    Status atual: {transicoes.status_label}
                  </div>
                  <input
                    className="form-control"
                    placeholder="Motivo (opcional)"
                    value={transMotivo}
                    onChange={e => setTransMotivo(e.target.value)}
                    style={{ margin: '6px 4px', fontSize: 12, width: 'calc(100% - 8px)' }}
                  />
                  {transicoes.transicoes.map(t => (
                    <button
                      key={t.status}
                      disabled={!t.permitido || operating}
                      onClick={() => t.permitido && handleTransicao(t.status)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                        fontSize: 13, border: 'none', borderRadius: 4, cursor: t.permitido ? 'pointer' : 'not-allowed',
                        background: 'transparent', color: t.permitido ? 'var(--text-primary)' : 'var(--text-muted)',
                        opacity: t.permitido ? 1 : 0.5,
                      }}
                      title={!t.permitido ? `Pendente: ${t.campos_pendentes.join(', ')}` : ''}
                    >
                      → {t.label}
                      {!t.permitido && (
                        <span style={{ fontSize: 10, color: '#ef4444', marginLeft: 6 }}>
                          (preencha: {t.campos_pendentes.join(', ')})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <a
            href={rq03Service.pdfUrl(id)}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}
          >
            🖨 Imprimir
          </a>
          <button className="btn-secondary" onClick={() => navigate('/qualidade/rq03')}>Voltar</button>
        </div>
      </div>

      {/* Cards resumo (APEX pg 359 NATIVE_CARDS) */}
      <div className="detail-cards">
        <div className="detail-card"><div className="dc-label">Status</div><div className="dc-value"><span className={`status-badge ${(rq.status||'').toLowerCase().replace('_','-')}`}>{rq.status}</span></div></div>
        <div className="detail-card"><div className="dc-label">Tipo</div><div className="dc-value">{rq.tipo || '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Prioridade</div><div className="dc-value">{rq.prioridade && <span className={`prioridade-badge ${(rq.prioridade||'').toLowerCase()}`}>{rq.prioridade}</span>}</div></div>
        <div className="detail-card"><div className="dc-label">Reclamante</div><div className="dc-value">{rq.reclamante || '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Abertura</div><div className="dc-value">{rq.dt_abertura ? new Date(rq.dt_abertura).toLocaleDateString('pt-BR') : '—'}</div></div>
        <div className="detail-card"><div className="dc-label">Responsável</div><div className="dc-value">{rq.responsavel_nome || '—'}</div></div>
        {/* Origem (tarefa 268) */}
        <div className="detail-card">
          <div className="dc-label">Origem</div>
          <div className="dc-value">
            <select
              style={{ background: 'transparent', border: 'none', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', padding: 0 }}
              value={rq.origem || ''}
              onChange={async e => {
                try { await rq03Service.atualizar(id, { origem: e.target.value || null }); fetchData(); }
                catch { toast.error('Erro ao atualizar origem'); }
              }}
            >
              <option value="">— Selecione —</option>
              <option value="CLIENTE">Cliente</option>
              <option value="INTERNA">Interna</option>
              <option value="AUDITORIA">Auditoria</option>
              <option value="FORNECEDOR">Fornecedor</option>
              <option value="CAMPO">Campo</option>
            </select>
          </div>
        </div>
        {/* Acidente de trabalho (tarefa 256) */}
        <div className="detail-card" style={{ cursor: 'pointer' }} onClick={handleToggleAcidente} title="Clique para alternar">
          <div className="dc-label">Acidente de Trabalho</div>
          <div className="dc-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700,
              padding: '2px 8px', borderRadius: 10,
              background: rq.ind_acidente === 'S' ? '#ef444422' : 'var(--bg-surface)',
              color: rq.ind_acidente === 'S' ? '#ef4444' : 'var(--text-muted)',
              border: `1px solid ${rq.ind_acidente === 'S' ? '#ef444466' : 'var(--border-primary)'}`,
            }}>
              {rq.ind_acidente === 'S' ? '⚠ Sim' : 'Não'}
            </span>
            {togglingAcidente && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>...</span>}
          </div>
        </div>
        {/* Produto/Lote (tarefa 307) */}
        <div className="detail-card">
          <div className="dc-label">Produto / Lote</div>
          <div className="dc-value">
            <input
              style={{ background: 'transparent', border: 'none', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', width: '100%', padding: 0 }}
              value={rq.produto_lote || ''}
              placeholder="—"
              onChange={async e => {
                const val = e.target.value;
                try { await rq03Service.atualizar(id, { produto_lote: val || null }); fetchData(); }
                catch { toast.error('Erro ao atualizar produto/lote'); }
              }}
              onBlur={e => e.target.dispatchEvent(new Event('change', { bubbles: true }))}
            />
          </div>
        </div>
      </div>

      {rq.descricao && (
        <div className="dp-description">
          <div className="dp-description-label">Descrição</div>
          <div className="dp-description-text">{rq.descricao}</div>
        </div>
      )}

      <div className="detail-tabs">
        {['analises', 'evidencias', ...(rq.ind_acidente === 'S' ? ['sst'] : []), 'anotacoes', 'equipe', 'historico', 'timeline', 'rastreabilidade'].map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => {
            setTab(t);
            if (t === 'historico') fetchHistoricoTrans();
            if (t === 'timeline') fetchTimeline();
            if (t === 'rastreabilidade') fetchRastreabilidade();
          }}>
            {t === 'analises'         ? 'Análises' :
             t === 'evidencias'       ? `Evidências (${evidencias.length})` :
             t === 'sst'              ? '⚠ SST / Acidente' :
             t === 'anotacoes'        ? `Anotações (${rq.anotacoes?.length || 0})` :
             t === 'historico'        ? 'Histórico' :
             t === 'timeline'         ? 'Timeline' :
             t === 'rastreabilidade'  ? 'Rastreabilidade' :
                                       `Equipe (${rq.equipe?.length || 0})`}
          </button>
        ))}
      </div>

      {/* Análises — step modals (APEX pg 368/371/374/377/378) */}
      {tab === 'analises' && (
        <div className="dp-analysis-grid">
          {ANALISE_ETAPAS.map(etapa => {
            const valor = rq[etapa.campo];
            const preenchida = !!valor;
            return (
              <div key={etapa.key}
                className={`dp-analysis-card ${preenchida ? 'dp-filled' : ''}`}
                onClick={() => {
                  setModalAnalise(etapa);
                  setAnaliseTexto(valor || '');
                  // Pre-fill structured state (tarefas 258-261)
                  if (etapa.key === 'causa_raiz') {
                    setAnalisePq({ pq1: rq.pq1||'', pq2: rq.pq2||'', pq3: rq.pq3||'', pq4: rq.pq4||'', pq5: rq.pq5||'' });
                  } else if (etapa.key === 'extensao') {
                    setAnaliseExt({ ext_afeta_outros: rq.ext_afeta_outros||'N', ext_processos_afetados: rq.ext_processos_afetados||'' });
                  } else if (etapa.key === 'implementacao') {
                    setAnaliseImpl({ impl_realizada: rq.impl_realizada||'N', impl_evidencias: rq.impl_evidencias||'', impl_data: rq.impl_data||'' });
                  } else if (etapa.key === 'eficacia') {
                    setAnaliseEfic({ efic_periodo_dias: rq.efic_periodo_dias||'', efic_eficaz: rq.efic_eficaz||'N' });
                  }
                }}>
                <div className="dp-analysis-card-header">
                  <span className="dp-analysis-card-title">{etapa.label}</span>
                  <span className={`dp-analysis-badge ${preenchida ? 'dp-filled' : 'dp-pending'}`}>
                    {preenchida ? 'Preenchida' : 'Pendente'}
                  </span>
                </div>
                {preenchida && <div className="dp-analysis-preview">{valor}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Evidências Antes/Depois (tarefa 263) */}
      {tab === 'evidencias' && (
        <div>
          {['ANTES', 'DEPOIS'].map(tipo => {
            const items = evidencias.filter(e => e.tipo_evidencia === tipo);
            const inputId = `evid-upload-${tipo}`;
            return (
              <div key={tipo} style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: tipo === 'ANTES' ? '#f59e0b' : '#22c55e' }}>
                    {tipo === 'ANTES' ? '⚠ Evidência Antes' : '✓ Evidência Depois'}
                  </span>
                  <label htmlFor={inputId} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'transparent', cursor: uploadingEvid ? 'not-allowed' : 'pointer', color: 'var(--text-primary)' }}>
                    {uploadingEvid ? 'Enviando...' : '+ Upload'}
                  </label>
                  <input id={inputId} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => handleUploadEvidencia(e, tipo)} disabled={uploadingEvid} />
                </div>
                {items.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma evidência {tipo === 'ANTES' ? 'anterior' : 'posterior'}.</div>
                ) : (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {items.map(ev => (
                      <div key={ev.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, minWidth: 140, maxWidth: 200 }}>
                        {ev.mimetype?.startsWith('image/') ? (
                          <img src={`/api/qualidade/rq03/${id}/evidencias/${ev.id}/imagem`} alt={ev.titulo} style={{ width: '100%', borderRadius: 5, marginBottom: 6, maxHeight: 120, objectFit: 'cover' }} />
                        ) : (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>📄 {ev.filename}</div>
                        )}
                        <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.titulo || ev.filename}</div>
                        <button onClick={() => handleDeleteEvidencia(ev.id)} style={{ marginTop: 6, fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>Remover</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'sst' && <SstForm rq03Id={id} sst={rq.sst} onSave={fetchData} />}

      {tab === 'anotacoes' && (
        <div>
          <div className="dp-add-row">
            <input className="form-control" placeholder="Nova anotação..." value={newAnot}
              onChange={e => setNewAnot(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddAnot()} />
            <button className="btn-primary" disabled={sendingAnot} onClick={handleAddAnot}>
              {sendingAnot ? '...' : 'Adicionar'}
            </button>
          </div>
          {(rq.anotacoes || []).length === 0
            ? <div className="empty-state">Nenhuma anotação</div>
            : (rq.anotacoes || []).map(a => (
              <div key={a.id} className="dp-anot-item">
                <div className="dp-anot-meta">{a.autor || '—'} · <RelativeTime value={a.created_at} /></div>
                <div className="dp-anot-body">{a.descricao}</div>
              </div>
            ))
          }
        </div>
      )}

      {tab === 'equipe' && (
        <div>
          {(rq.equipe || []).length === 0
            ? <div className="empty-state">Nenhum membro na equipe</div>
            : (rq.equipe || []).map(p => (
              <div key={p.id} className="dp-member-row">
                {p.usuario_nome || `User #${p.usuario_id}`}
              </div>
            ))
          }
        </div>
      )}

      {tab === 'historico' && (
        <div>
          {historicoTrans.length === 0
            ? <div className="empty-state">Nenhuma transição registrada</div>
            : (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-primary)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>De</th>
                    <th style={{ padding: '8px 10px' }}>Para</th>
                    <th style={{ padding: '8px 10px' }}>Motivo</th>
                    <th style={{ padding: '8px 10px' }}>Usuário</th>
                    <th style={{ padding: '8px 10px' }}>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoTrans.map(h => (
                    <tr key={h.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                      <td style={{ padding: '8px 10px' }}><span className={`status-badge ${(h.status_anterior||'').toLowerCase().replace('_','-')}`}>{h.status_anterior || '—'}</span></td>
                      <td style={{ padding: '8px 10px' }}><span className={`status-badge ${(h.status_novo||'').toLowerCase().replace('_','-')}`}>{h.status_novo}</span></td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{h.motivo || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{h.usuario_nome || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      {tab === 'timeline' && (
        <div>
          {loadingTimeline
            ? <div className="empty-state">Carregando...</div>
            : timeline.length === 0
              ? <div className="empty-state">Nenhum evento registrado</div>
              : (
                <div style={{ position: 'relative', paddingLeft: 24 }}>
                  <div style={{ position: 'absolute', left: 10, top: 0, bottom: 0, width: 2, background: 'var(--border-primary)' }} />
                  {timeline.map((ev, i) => {
                    const icon = ev.tipo === 'transicao' ? '↔' : ev.tipo === 'anotacao' ? '💬' : '👤';
                    const cor = ev.tipo === 'transicao' ? 'var(--accent)' : ev.tipo === 'anotacao' ? '#f59e0b' : '#4caf50';
                    return (
                      <div key={i} style={{ position: 'relative', marginBottom: 16, paddingLeft: 20 }}>
                        <div style={{
                          position: 'absolute', left: -16, top: 2, width: 20, height: 20,
                          borderRadius: '50%', background: cor, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700,
                        }}>{icon}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                          {ev.autor || '—'} · {ev.dt ? new Date(ev.dt).toLocaleString('pt-BR') : '—'}
                          {ev.tipo === 'transicao' && ev.status_anterior && (
                            <span style={{ marginLeft: 6 }}>
                              <span className={`status-badge ${(ev.status_anterior||'').toLowerCase().replace(/_/g,'-')}`}>{ev.status_anterior}</span>
                              {' → '}
                              <span className={`status-badge ${(ev.status_novo||'').toLowerCase().replace(/_/g,'-')}`}>{ev.status_novo}</span>
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                          {ev.descricao || '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
          }
        </div>
      )}

      {tab === 'rastreabilidade' && (
        <div>
          {loadingRastreab
            ? <div className="empty-state">Carregando...</div>
            : !rastreab
              ? <div className="empty-state">Nenhum dado de rastreabilidade</div>
              : (
                <div>
                  {rastreab.produto_lote
                    ? (
                      <>
                        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 13 }}>
                          <strong>Produto / Lote:</strong> {rastreab.produto_lote}
                        </div>
                        {rastreab.similares.length === 0
                          ? <div className="empty-state">Nenhuma outra NC encontrada com este lote</div>
                          : (
                            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid var(--border-primary)', textAlign: 'left' }}>
                                  <th style={{ padding: '8px 10px' }}>Código</th>
                                  <th style={{ padding: '8px 10px' }}>Título</th>
                                  <th style={{ padding: '8px 10px' }}>Status</th>
                                  <th style={{ padding: '8px 10px' }}>Abertura</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rastreab.similares.map(s => (
                                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border-primary)', cursor: 'pointer' }}
                                    onClick={() => navigate(`/qualidade/rq03/${s.id}`)}>
                                    <td style={{ padding: '8px 10px' }}>{s.codigo || `#${s.id}`}</td>
                                    <td style={{ padding: '8px 10px' }}>{s.titulo || '—'}</td>
                                    <td style={{ padding: '8px 10px' }}><span className={`status-badge ${(s.status||'').toLowerCase().replace(/_/g,'-')}`}>{s.status}</span></td>
                                    <td style={{ padding: '8px 10px' }}>{s.created_at ? new Date(s.created_at).toLocaleDateString('pt-BR') : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        }
                      </>
                    )
                    : <div className="empty-state">Produto/Lote não preenchido. Preencha o campo no topo para habilitar rastreabilidade.</div>
                  }
                </div>
              )
          }
        </div>
      )}

      {/* Modal análise (tarefas 258-261: formulários estruturados por etapa) */}
      <Modal open={!!modalAnalise} onClose={() => setModalAnalise(null)} title={modalAnalise?.label || ''}
        footer={<><button className="btn-secondary" onClick={() => setModalAnalise(null)}>Cancelar</button><button className="btn-primary" disabled={savingAnalise} onClick={handleSaveAnalise}>{savingAnalise ? 'Salvando...' : 'Salvar'}</button></>}>

        {/* Causa Raiz — 5 Porquês (tarefa 258) */}
        {modalAnalise?.key === 'causa_raiz' ? (
          <div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Descrição da Causa Raiz</label>
              <textarea className="form-control" rows={3} value={analiseTexto} onChange={e => setAnaliseTexto(e.target.value)} placeholder="Resumo da causa raiz identificada..." />
            </div>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: '12px 14px', marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>TÉCNICA DOS 5 PORQUÊS</div>
              {[1,2,3,4,5].map(n => (
                <div key={n} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ minWidth: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, marginTop: 6 }}>{n}</span>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 3 }}>{n}º Por quê?</label>
                    <input className="form-control" style={{ fontSize: 13 }}
                      value={analisePq[`pq${n}`]}
                      onChange={e => setAnalisePq(p => ({ ...p, [`pq${n}`]: e.target.value }))}
                      placeholder={`Resposta ao ${n}º porquê...`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : modalAnalise?.key === 'extensao' ? (
          /* Análise de Extensão — afeta outros? (tarefa 259) */
          <div>
            <div className="form-group">
              <label>Análise de Extensão</label>
              <textarea className="form-control" rows={3} value={analiseTexto} onChange={e => setAnaliseTexto(e.target.value)} placeholder="Descreva a análise de extensão..." />
            </div>
            <div className="form-group">
              <label>Afeta outros produtos/processos?</label>
              <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                {['N', 'S'].map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="ext_afeta_outros" value={v}
                      checked={analiseExt.ext_afeta_outros === v}
                      onChange={() => setAnaliseExt(p => ({ ...p, ext_afeta_outros: v }))} />
                    {v === 'S' ? 'Sim' : 'Não'}
                  </label>
                ))}
              </div>
            </div>
            {analiseExt.ext_afeta_outros === 'S' && (
              <div className="form-group">
                <label>Processos/produtos afetados</label>
                <textarea className="form-control" rows={3} value={analiseExt.ext_processos_afetados}
                  onChange={e => setAnaliseExt(p => ({ ...p, ext_processos_afetados: e.target.value }))}
                  placeholder="Liste os processos ou produtos afetados..." />
              </div>
            )}
          </div>
        ) : modalAnalise?.key === 'implementacao' ? (
          /* Análise de Implementação (tarefa 260) */
          <div>
            <div className="form-group">
              <label>Análise de Implementação</label>
              <textarea className="form-control" rows={3} value={analiseTexto} onChange={e => setAnaliseTexto(e.target.value)} placeholder="Descreva a análise de implementação..." />
            </div>
            <div className="form-group">
              <label>A ação foi implementada?</label>
              <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                {['N', 'S'].map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="impl_realizada" value={v}
                      checked={analiseImpl.impl_realizada === v}
                      onChange={() => setAnaliseImpl(p => ({ ...p, impl_realizada: v }))} />
                    {v === 'S' ? 'Sim' : 'Não'}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Data de Implementação</label>
                <input type="date" className="form-control" value={analiseImpl.impl_data}
                  onChange={e => setAnaliseImpl(p => ({ ...p, impl_data: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label>Evidências</label>
              <textarea className="form-control" rows={3} value={analiseImpl.impl_evidencias}
                onChange={e => setAnaliseImpl(p => ({ ...p, impl_evidencias: e.target.value }))}
                placeholder="Descreva as evidências da implementação..." />
            </div>
          </div>
        ) : modalAnalise?.key === 'eficacia' ? (
          /* Análise de Eficácia — período de observação (tarefa 261) */
          <div>
            <div className="form-group">
              <label>Análise de Eficácia</label>
              <textarea className="form-control" rows={3} value={analiseTexto} onChange={e => setAnaliseTexto(e.target.value)} placeholder="Descreva a análise de eficácia..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Período de observação (dias)</label>
                <input type="number" min={1} className="form-control" value={analiseEfic.efic_periodo_dias}
                  onChange={e => setAnaliseEfic(p => ({ ...p, efic_periodo_dias: e.target.value }))}
                  placeholder="Ex: 30" />
              </div>
            </div>
            <div className="form-group">
              <label>A ação foi eficaz?</label>
              <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                {['N', 'S'].map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="efic_eficaz" value={v}
                      checked={analiseEfic.efic_eficaz === v}
                      onChange={() => setAnaliseEfic(p => ({ ...p, efic_eficaz: v }))} />
                    {v === 'S' ? 'Sim' : 'Não'}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Generic modal for acao_imediata, acao_corretiva */
          <div className="form-group">
            <label>{modalAnalise?.label}</label>
            <textarea className="form-control" rows={8} value={analiseTexto} onChange={e => setAnaliseTexto(e.target.value)} />
          </div>
        )}
      </Modal>
    </div>
  );
}


/**
 * SST Form — APEX pg 501 Modal + pg 359 tab "Saúde e Segurança"
 */
function SstForm({ rq03Id, sst, onSave }) {
  const [form, setForm] = useState({
    dt_ocorrencia:   sst?.dt_ocorrencia   || '',
    dt_notificacao:  sst?.dt_notificacao  || '',
    descricao:       sst?.descricao       || '',
    local_ocorrencia:sst?.local_ocorrencia|| '',
    turno:           sst?.turno           || '',
    atividade:       sst?.atividade       || '',
    cat_profissional:sst?.cat_profissional|| '',
    tempo_empresa:   sst?.tempo_empresa   || '',
    afastamento:     sst?.afastamento     || 'N',
    dias_afastamento:sst?.dias_afastamento|| '',
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      await rq03Service.salvarSst(rq03Id, form);
      toast.success('Dados SST salvos');
      if (onSave) onSave();
    } catch { toast.error('Erro ao salvar SST'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="dp-section-title">Informações do Acidente (SST)</div>
      <div className="form-row">
        <div className="form-group"><label>Data Ocorrência</label><input type="date" className="form-control" value={form.dt_ocorrencia} onChange={e => setForm(f => ({...f, dt_ocorrencia: e.target.value}))} /></div>
        <div className="form-group"><label>Data Notificação</label><input type="date" className="form-control" value={form.dt_notificacao} onChange={e => setForm(f => ({...f, dt_notificacao: e.target.value}))} /></div>
      </div>
      <div className="form-group"><label>Descrição do Acidente</label><textarea className="form-control" rows={3} value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} /></div>
      <div className="form-row">
        <div className="form-group"><label>Local da Ocorrência</label><input className="form-control" value={form.local_ocorrencia} onChange={e => setForm(f => ({...f, local_ocorrencia: e.target.value}))} /></div>
        <div className="form-group"><label>Turno</label>
          <select className="form-control" value={form.turno} onChange={e => setForm(f => ({...f, turno: e.target.value}))}>
            <option value="">Selecione...</option>
            <option value="1">1º Turno</option>
            <option value="2">2º Turno</option>
            <option value="3">3º Turno</option>
            <option value="ADM">Administrativo</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Atividade Exercida</label><input className="form-control" value={form.atividade} onChange={e => setForm(f => ({...f, atividade: e.target.value}))} /></div>
        <div className="form-group"><label>Categoria Profissional</label><input className="form-control" value={form.cat_profissional} onChange={e => setForm(f => ({...f, cat_profissional: e.target.value}))} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Tempo de Empresa</label><input className="form-control" value={form.tempo_empresa} onChange={e => setForm(f => ({...f, tempo_empresa: e.target.value}))} /></div>
        <div className="form-group"><label>Afastamento</label>
          <select className="form-control" value={form.afastamento} onChange={e => setForm(f => ({...f, afastamento: e.target.value}))}>
            <option value="N">Não</option>
            <option value="S">Sim</option>
          </select>
        </div>
        {form.afastamento === 'S' && (
          <div className="form-group"><label>Dias de Afastamento</label><input type="number" className="form-control" value={form.dias_afastamento} onChange={e => setForm(f => ({...f, dias_afastamento: e.target.value}))} /></div>
        )}
      </div>
      <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ marginTop: 12 }}>
        {saving ? 'Salvando...' : 'Salvar Dados SST'}
      </button>
    </div>
  );
}

/**
 * APEX pg 291 — Seleção de Ação do Checklist
 * APEX pg 138/142/144/146/148/150/152/154/211 — Step-by-step filling
 *
 * Layout: Header + Step progress bar + Formulário da etapa atual
 * Steps: BOB → MNT → CNJ_MOT → ENS_HID → PIN → EMB → QLD_MNT → QLD → EXP
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { checklistService } from '../../services/fabricacao/checklistService';
import '../../components/DetailPage.css';

export default function ChecklistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [ckl, setCkl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(null);
  const [stepData, setStepData] = useState(null);
  const [operating, setOperating] = useState(false);
  const [etiquetaData, setEtiquetaData] = useState(null);
  const [etiquetaOpen, setEtiquetaOpen] = useState(false);

  const fetchData = async () => {
    try {
      const { data } = await checklistService.getSteps(id);
      setCkl(data);
      const pending = (data.steps || []).find(s => !s.concluido);
      if (pending && !activeStep) setActiveStep(pending.key);
    } catch { toast.error('Erro ao carregar checklist'); navigate('/fabricacao'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);

  const loadStepData = async (stepKey) => {
    try {
      const { data } = await checklistService.getStepDados(id, stepKey);
      setStepData(data);
    } catch { setStepData(null); }
  };

  useEffect(() => { if (activeStep) loadStepData(activeStep); }, [activeStep]);

  if (loading) return (
    <div className="detail-page">
      <div className="dp-skeleton-header" />
      <div className="dp-skeleton-cards" style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
        {[1,2,3,4,5,6,7,8,9].map(i => <div key={i} className="dp-skeleton-card" style={{ height: 36 }} />)}
      </div>
    </div>
  );
  if (!ckl) return null;

  const handleEtiqueta = async () => {
    try {
      const { data } = await checklistService.etiqueta(id);
      setEtiquetaData(data);
      setEtiquetaOpen(true);
    } catch { toast.error('Erro ao gerar etiqueta'); }
  };

  const handleExportPDF = () => {
    const steps = ckl.steps || [];
    const now = new Date().toLocaleDateString('pt-BR');
    const concluidas = steps.filter(s => s.concluido).length;
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Ficha Técnica — PV ${ckl.pv || id}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; margin: 20px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .sub { font-size: 11px; color: #555; margin-bottom: 16px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-bottom: 16px; }
  .meta-row { display: flex; gap: 6px; }
  .meta-label { font-weight: 700; min-width: 90px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #1a1a2e; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  .done { color: #166534; }
  .pend { color: #9a3412; }
  .prog { color: #92400e; }
  .footer { margin-top: 16px; font-size: 9px; color: #888; }
  @media print { body { margin: 10mm; } }
</style></head><body>
<h1>Ficha Técnica de Produção</h1>
<div class="sub">Emitido em ${now} · ${concluidas}/${steps.length} etapas concluídas</div>
<div class="meta">
  <div class="meta-row"><span class="meta-label">PV:</span>${ckl.pv || '—'}</div>
  <div class="meta-row"><span class="meta-label">Nr. Série:</span>${ckl.nr_serie || '—'}</div>
  <div class="meta-row"><span class="meta-label">Cliente:</span>${ckl.cliente || '—'}</div>
  <div class="meta-row"><span class="meta-label">Modelo:</span>${ckl.modelo || ckl.equipamento || '—'}</div>
  <div class="meta-row"><span class="meta-label">Status:</span>${ckl.status || '—'}</div>
  <div class="meta-row"><span class="meta-label">Responsável:</span>${ckl.responsavel_nome || '—'}</div>
</div>
<table>
  <thead><tr><th>Etapa</th><th>Status</th><th>Iniciada</th><th>Concluída</th><th>Responsável</th></tr></thead>
  <tbody>
  ${steps.map(s => {
    const status = s.concluido ? '<span class="done">✓ Concluída</span>' : s.dt_inicio ? '<span class="prog">Em Progresso</span>' : '<span class="pend">Aguardando</span>';
    return `<tr><td>${s.label}</td><td>${status}</td><td>${s.dt_inicio || '—'}</td><td>${s.dt_conclusao || '—'}</td><td>${s.responsavel_nome || '—'}</td></tr>`;
  }).join('')}
  </tbody>
</table>
<div class="footer">HIGRA SIGS — Sistema Integrado de Gestão · PV ${ckl.pv || id}</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handleIniciar = async (stepKey) => {
    if (operating) return;
    setOperating(true);
    try {
      await checklistService.iniciarStep(id, stepKey);
      toast.success('Etapa iniciada');
      fetchData();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erro ao iniciar etapa'); }
    finally { setOperating(false); }
  };

  const handleConcluir = async (stepKey) => {
    if (operating) return;
    setOperating(true);
    try {
      await checklistService.concluirStep(id, stepKey, {});
      toast.success('Etapa concluída');
      fetchData();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erro ao concluir etapa'); }
    finally { setOperating(false); }
  };

  const steps = ckl.steps || [];

  return (
    <div className="detail-page">
      {/* Header */}
      <div className="detail-header">
        <div>
          <span className="dp-breadcrumb" onClick={() => navigate('/fabricacao')}>← Produção / Checklists</span>
          <div className="dp-code">PV {ckl.pv || '—'} · S/N {ckl.nr_serie || '—'}</div>
          <h1>{ckl.cliente || 'Checklist'}{(ckl.modelo || ckl.equipamento) ? ` — ${ckl.modelo || ckl.equipamento}` : ''}</h1>
        </div>
        <div className="dp-header-actions">
          <span className={`status-badge ${(ckl.status || '').toLowerCase()}`}>{ckl.status}</span>
          <button className="btn-secondary" onClick={handleEtiqueta} title="Gerar etiqueta de identificação">
            &#127991; Etiqueta
          </button>
          <button className="btn-secondary" onClick={handleExportPDF} title="Exportar ficha técnica em PDF">
            &#128438; PDF
          </button>
          <button className="btn-secondary" onClick={() => navigate('/fabricacao')}>Voltar</button>
        </div>
      </div>

      {/* Progresso geral */}
      {(() => {
        const concluidas = steps.filter(s => s.concluido).length;
        const pct = steps.length ? Math.round((concluidas / steps.length) * 100) : 0;
        return (
          <div style={{ margin: '16px 0 8px', padding: '10px 16px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              <span>Progresso geral</span>
              <span style={{ fontWeight: 700, color: pct === 100 ? '#4caf50' : 'var(--accent)' }}>{concluidas}/{steps.length} etapas · {pct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--border-primary)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, background: pct === 100 ? '#4caf50' : 'var(--accent)', width: `${pct}%`, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        );
      })()}

      {/* Stepper visual */}
      <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8, gap: 0 }}>
        {steps.map((step, idx) => {
          const isActive = activeStep === step.key;
          const isDone = step.concluido;
          const isInProgress = step.status === 'AND' && !isDone;
          const circleColor = isDone ? '#4caf50' : isInProgress ? '#f59e0b' : isActive ? 'var(--accent)' : 'var(--border-primary)';
          const textColor = isDone ? '#4caf50' : isActive ? 'var(--accent)' : 'var(--text-muted)';
          const tooltipParts = [];
          if (step.dt_inicio) tooltipParts.push(`Iniciada: ${step.dt_inicio}`);
          if (step.dt_conclusao) tooltipParts.push(`Concluída: ${step.dt_conclusao}`);
          const tipText = tooltipParts.join(' · ') || null;
          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 80 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', width: '100%' }}
                onClick={() => setActiveStep(step.key)} title={tipText || step.label}>
                {/* Connector + Circle */}
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  {idx > 0 && (
                    <div style={{ flex: 1, height: 2, background: steps[idx-1].concluido ? '#4caf50' : 'var(--border-primary)', transition: 'background 0.3s' }} />
                  )}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: isDone ? '#4caf50' : 'var(--bg-surface)',
                    border: `2px solid ${circleColor}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                    color: isDone ? '#fff' : circleColor,
                    transition: 'all 0.3s',
                    boxShadow: isActive ? `0 0 0 3px ${circleColor}33` : 'none',
                  }}>
                    {isDone ? '✓' : idx + 1}
                  </div>
                  {idx < steps.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: isDone ? '#4caf50' : 'var(--border-primary)', transition: 'background 0.3s' }} />
                  )}
                </div>
                {/* Label */}
                <div style={{
                  fontSize: 10, fontWeight: isActive ? 700 : 400, marginTop: 4, textAlign: 'center',
                  color: textColor, padding: '0 2px', lineHeight: 1.2,
                  maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={step.label}>
                  {step.label}
                </div>
                {isInProgress && (
                  <div style={{ fontSize: 9, color: '#f59e0b', fontWeight: 700 }}>EM PROGRESSO</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step Detail */}
      {activeStep && (() => {
        const step = steps.find(s => s.key === activeStep);
        if (!step) return null;
        const isIniciado = stepData?.iniciado;
        const isConcluido = step.concluido;

        return (
          <div className="dp-step-card">
            <div className="dp-step-card-header">
              <div>
                <h2 className="dp-step-card-title">{step.label}</h2>
                <div className="dp-step-card-sub">
                  {isConcluido  ? `Concluída em ${step.dt_conclusao || '—'}` :
                   isIniciado   ? `Iniciada em ${stepData?.registro?.dt_inicio || '—'}` :
                                  'Aguardando início'}
                </div>
              </div>
              <div className="dp-step-card-actions">
                {!isIniciado && !isConcluido && (
                  <button className="btn-primary" disabled={operating} onClick={() => handleIniciar(step.key)}>
                    {operating ? '...' : 'Iniciar Etapa'}
                  </button>
                )}
                {isIniciado && !isConcluido && (
                  <button className="btn-primary" disabled={operating}
                    style={{ background: 'var(--accent-success, #4caf50)' }}
                    onClick={() => handleConcluir(step.key)}>
                    {operating ? '...' : '✓ Concluir Etapa'}
                  </button>
                )}
                {isConcluido && (
                  <span className="dp-step-done-label">✓ Concluída</span>
                )}
              </div>
            </div>

            {isIniciado && stepData?.registro && (
              <div>
                <div className="detail-cards" style={{ marginBottom: 16 }}>
                  <div className="detail-card"><div className="dc-label">Responsável</div><div className="dc-value">{stepData.registro.responsavel_nome || '—'}</div></div>
                  <div className="detail-card"><div className="dc-label">Início</div><div className="dc-value">{stepData.registro.dt_inicio ? new Date(stepData.registro.dt_inicio).toLocaleDateString('pt-BR') : '—'}</div></div>
                  <div className="detail-card"><div className="dc-label">Conclusão</div><div className="dc-value">{stepData.registro.dt_conclusao ? new Date(stepData.registro.dt_conclusao).toLocaleDateString('pt-BR') : '—'}</div></div>
                </div>

                {stepData.registro.observacoes && (
                  <div className="dp-description" style={{ marginBottom: 12 }}>
                    <div className="dp-description-label">Observações</div>
                    <div className="dp-description-text">{stepData.registro.observacoes}</div>
                  </div>
                )}

                {stepData.registro.dados && Object.keys(stepData.registro.dados).length > 0 && (
                  <div>
                    <div className="dp-section-title">Dados do Formulário</div>
                    <table className="data-table">
                      <thead><tr><th>Campo</th><th>Valor</th></tr></thead>
                      <tbody>
                        {Object.entries(stepData.registro.dados).map(([key, val]) => (
                          <tr key={key}>
                            <td style={{ fontWeight: 600 }}>{key.replace(/_/g, ' ')}</td>
                            <td>{String(val)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>

    {/* Modal Etiqueta */}
    {etiquetaOpen && etiquetaData && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setEtiquetaOpen(false)}>
        <div style={{ background: 'var(--bg-primary)', borderRadius: 12, padding: 32, minWidth: 320, maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
          onClick={e => e.stopPropagation()}>
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>Etiqueta de Identificação</h2>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>PV</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 12 }}>{etiquetaData.pv || '—'}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Nº Série</div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 12 }}>{etiquetaData.nr_serie || '—'}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Modelo</div>
              <div style={{ marginBottom: 12 }}>{etiquetaData.modelo || '—'}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Cliente</div>
              <div style={{ marginBottom: 12 }}>{etiquetaData.cliente || '—'}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Status</div>
              <div>{etiquetaData.status || '—'}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(etiquetaData.qr_data || '')}`}
                alt="QR Code"
                width={140} height={140}
                style={{ borderRadius: 8, border: '1px solid var(--border-subtle)' }}
              />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                {etiquetaData.qr_data}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn-secondary" onClick={() => window.print()}>Imprimir</button>
            <button className="btn-primary" onClick={() => setEtiquetaOpen(false)}>Fechar</button>
          </div>
        </div>
      </div>
    )}
  );
}

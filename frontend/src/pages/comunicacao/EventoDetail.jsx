/**
 * Evento Detail — participantes, RSVP, leitura, link externo, tags, ICS export.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { eventoService } from '../../services/comunicacao/eventoService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

const RSVP_COLORS = {
  CONFIRMADO: '#22c55e',
  RECUSADO: '#ef4444',
  PENDENTE: '#f59e0b',
};

export default function EventoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [evento, setEvento] = useState(null);
  const [participantes, setParticipantes] = useState([]);
  const [quemLeu, setQuemLeu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('info');
  const [modalPart, setModalPart] = useState(false);
  const [partForm, setPartForm] = useState({ nome_externo: '' });
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [evtRes, partRes, leituraRes] = await Promise.all([
        eventoService.obter(id),
        eventoService.listarParticipantes(id).catch(() => ({ data: { items: [] } })),
        eventoService.quemLeu(id).catch(() => ({ data: { items: [] } })),
      ]);
      setEvento(evtRes.data);
      setParticipantes(partRes.data?.items || []);
      setQuemLeu(leituraRes.data?.items || []);
      // Marcar como lido automaticamente
      eventoService.marcarLeitura(id).catch(() => {});
    } catch {
      showToast('Erro ao carregar evento', 'error');
      navigate('/comunicacao');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, showToast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function addParticipante(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await eventoService.addParticipante(id, { nome_externo: partForm.nome_externo });
      showToast('Participante adicionado', 'success');
      setModalPart(false);
      setPartForm({ nome_externo: '' });
      const { data } = await eventoService.listarParticipantes(id);
      setParticipantes(data?.items || []);
    } catch {
      showToast('Erro ao adicionar participante', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function confirmarRSVP(partId, rsvp) {
    try {
      await eventoService.confirmarRSVP(id, partId, { rsvp });
      const { data } = await eventoService.listarParticipantes(id);
      setParticipantes(data?.items || []);
    } catch {
      showToast('Erro ao confirmar', 'error');
    }
  }

  function exportICS() {
    if (!evento) return;
    const dt = evento.dt_evento ? new Date(evento.dt_evento + 'T08:00:00') : new Date();
    const dtEnd = new Date(dt.getTime() + 2 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HIGRA SIGS//Eventos//PT',
      'BEGIN:VEVENT',
      `DTSTART:${fmt(dt)}`,
      `DTEND:${fmt(dtEnd)}`,
      `SUMMARY:${evento.titulo || 'Evento'}`,
      `DESCRIPTION:${(evento.descricao || '').replace(/\n/g, '\\n')}`,
      `LOCATION:${evento.local || ''}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `evento_${id}.ics`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="ptf-page"><div className="ptf-loading">Carregando evento...</div></div>;
  if (!evento) return null;

  const TABS = [
    { key: 'info', label: 'Informações' },
    { key: 'participantes', label: `Participantes (${participantes.length})` },
    { key: 'leitura', label: `Quem Leu (${quemLeu.length})` },
  ];

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <button onClick={() => navigate('/comunicacao')} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--feed-muted)', fontSize: '0.82rem', padding: 0, marginBottom: 4,
          }}>← Comunicação</button>
          <h1 className="ptf-title">{evento.titulo}</h1>
          {evento.tipo && <span className="ptf-rec-badge">{evento.tipo}</span>}
          {evento.destaque === 'S' && (
            <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700 }}>★ Destaque</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {evento.dt_evento && (
            <button className="ptf-btn-secondary" onClick={exportICS} title="Exportar .ics">
              📅 .ics
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '6px 14px', borderRadius: 20,
            border: '1px solid var(--feed-border)',
            background: tab === t.key ? 'var(--color-primary)' : 'var(--feed-card)',
            color: tab === t.key ? '#fff' : 'var(--feed-muted)',
            cursor: 'pointer', fontSize: '0.82rem', fontWeight: tab === t.key ? 700 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'info' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Meta info */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 12,
          }}>
            {[
              { label: 'Data', value: evento.dt_evento ? new Date(evento.dt_evento + 'T00:00:00').toLocaleDateString('pt-BR') : '—' },
              { label: 'Local', value: evento.local || '—' },
              { label: 'Responsável', value: evento.responsavel_nome || '—' },
              { label: 'Status', value: evento.status || '—' },
            ].map((item) => (
              <div key={item.label} style={{
                background: 'var(--feed-card)', border: '1px solid var(--feed-border)',
                borderRadius: 8, padding: 12,
              }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--feed-muted)', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {evento.link_externo && (
            <div style={{ background: 'var(--feed-card)', border: '1px solid var(--feed-border)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--feed-muted)', marginBottom: 4 }}>Link</div>
              <a href={evento.link_externo} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--color-primary)', wordBreak: 'break-all' }}>
                {evento.link_externo}
              </a>
            </div>
          )}

          {evento.descricao && (
            <div style={{ background: 'var(--feed-card)', border: '1px solid var(--feed-border)', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--feed-muted)', marginBottom: 8 }}>Descrição</div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem', lineHeight: 1.6 }}>{evento.descricao}</div>
            </div>
          )}

          {evento.tags && (
            <div>
              {evento.tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                <span key={tag} style={{
                  display: 'inline-block', marginRight: 6, marginBottom: 4,
                  padding: '2px 10px', borderRadius: 12,
                  background: 'var(--feed-border)', color: 'var(--feed-text)',
                  fontSize: '0.75rem', fontWeight: 600,
                }}>{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'participantes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="ptf-btn-primary" onClick={() => setModalPart(true)}>+ Adicionar</button>
          </div>
          <div className="ptf-table-wrap">
            <table className="ptf-table">
              <thead>
                <tr><th>Nome</th><th style={{ textAlign: 'center' }}>RSVP</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {participantes.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>
                    Nenhum participante.
                  </td></tr>
                ) : participantes.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.usuario_nome || p.nome_externo || '—'}</strong></td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: `${RSVP_COLORS[p.rsvp] || '#6b7280'}22`,
                        color: RSVP_COLORS[p.rsvp] || '#6b7280',
                      }}>{p.rsvp}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {['CONFIRMADO', 'RECUSADO', 'PENDENTE'].map((r) => (
                          <button key={r} onClick={() => confirmarRSVP(p.id, r)}
                            style={{
                              padding: '2px 7px', fontSize: '0.7rem', borderRadius: 6,
                              border: `1px solid ${RSVP_COLORS[r]}`,
                              background: p.rsvp === r ? RSVP_COLORS[r] : 'transparent',
                              color: p.rsvp === r ? '#fff' : RSVP_COLORS[r],
                              cursor: 'pointer',
                            }}>
                            {r === 'CONFIRMADO' ? '✓' : r === 'RECUSADO' ? '✗' : '?'}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'leitura' && (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead><tr><th>Usuário</th><th>Data/Hora</th></tr></thead>
            <tbody>
              {quemLeu.length === 0 ? (
                <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>
                  Nenhuma leitura registrada.
                </td></tr>
              ) : quemLeu.map((l) => (
                <tr key={l.id}>
                  <td><strong>{l.usuario_nome || '—'}</strong></td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--feed-muted)' }}>
                    {l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal adicionar participante */}
      {modalPart && (
        <div className="ptf-modal-overlay" onClick={() => setModalPart(false)}>
          <div className="ptf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ptf-modal-header">
              <h3>Adicionar Participante</h3>
              <button className="ptf-modal-close" onClick={() => setModalPart(false)}>✕</button>
            </div>
            <form onSubmit={addParticipante} className="ptf-modal-body">
              <label>Nome *
                <input value={partForm.nome_externo}
                  onChange={(e) => setPartForm({ nome_externo: e.target.value })}
                  placeholder="Nome do participante" required autoFocus />
              </label>
              <div className="ptf-modal-actions">
                <button type="button" className="ptf-btn-secondary" onClick={() => setModalPart(false)}>Cancelar</button>
                <button type="submit" className="ptf-btn-primary" disabled={saving}>Adicionar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

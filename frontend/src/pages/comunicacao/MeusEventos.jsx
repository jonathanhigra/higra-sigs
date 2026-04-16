/**
 * 572 — Meus Eventos: eventos onde o usuário tem presença marcada.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { eventoService } from '../../services/comunicacao/eventoService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

const RSVP_COLORS = {
  CONFIRMADO: '#22c55e',
  RECUSADO: '#ef4444',
  PENDENTE: '#f59e0b',
};

export default function MeusEventos() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    eventoService.meusEventos()
      .then(({ data }) => setEventos(data?.items || []))
      .catch(() => showToast('Erro ao carregar eventos', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  function exportICS() {
    if (!eventos.length) return;
    const eventsICS = eventos.filter((e) => e.dt_evento).map((evt) => {
      const dt = new Date(evt.dt_evento + 'T08:00:00');
      const dtEnd = new Date(dt.getTime() + 2 * 60 * 60 * 1000);
      const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      return [
        'BEGIN:VEVENT',
        `DTSTART:${fmt(dt)}`,
        `DTEND:${fmt(dtEnd)}`,
        `SUMMARY:${evt.titulo || 'Evento'}`,
        `LOCATION:${evt.local || ''}`,
        'END:VEVENT',
      ].join('\r\n');
    }).join('\r\n');

    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HIGRA SIGS//Eventos//PT', eventsICS, 'END:VCALENDAR'].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'meus_eventos.ics'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Meus Eventos</h1>
          <p className="ptf-subtitle">Eventos com sua presença marcada</p>
        </div>
        {eventos.length > 0 && (
          <button className="ptf-btn-secondary" onClick={exportICS}>📅 Exportar .ics</button>
        )}
      </div>

      {loading && <div className="ptf-loading">Carregando...</div>}

      {!loading && (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Data</th>
                <th>Local</th>
                <th>Responsável</th>
                <th style={{ textAlign: 'center' }}>RSVP</th>
              </tr>
            </thead>
            <tbody>
              {eventos.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--feed-muted)', padding: 32 }}>
                  Você não tem presença em nenhum evento.
                </td></tr>
              ) : eventos.map((evt) => (
                <tr key={evt.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/comunicacao/${evt.id}`)}>
                  <td><strong>{evt.titulo}</strong></td>
                  <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {evt.dt_evento ? new Date(evt.dt_evento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--feed-muted)' }}>{evt.local || '—'}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--feed-muted)' }}>{evt.responsavel_nome || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: `${RSVP_COLORS[evt.rsvp] || '#6b7280'}22`,
                      color: RSVP_COLORS[evt.rsvp] || '#6b7280',
                    }}>{evt.rsvp || 'PENDENTE'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

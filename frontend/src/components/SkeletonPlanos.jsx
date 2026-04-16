/**
 * Skeleton loaders para Planos de Ação
 * Usa .sk-* classes + .skeleton-pulse da Skeleton.css
 */
import './SkeletonPlanos.css';

// Bloco genérico com shimmer
function Sk({ w = '100%', h = 12, r = 6, style }) {
  return (
    <div
      className="sk-block skeleton-pulse"
      style={{ width: w, height: h, borderRadius: r, ...style }}
    />
  );
}

// ── PlanosList ──────────────────────────────────────────────────────────────

export function SkeletonSummaryBar() {
  return (
    <div className="sk-summary-bar">
      {[80, 70, 70, 80, 80].map((w, i) => (
        <div key={i} className="sk-summary-card">
          <Sk w={w} h={28} r={6} />
          <Sk w={50} h={10} r={4} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTableRows({ rows = 8 }) {
  const cols = [24, 90, 70, 80, 110, 110, '50%', 80, 60, 24];
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="sk-table-row">
          {cols.map((w, j) => (
            <td key={j} style={{ padding: '10px 12px' }}>
              <Sk w={w} h={13} r={5} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonKanban() {
  return (
    <div className="sk-kanban-board">
      {[3, 2, 4, 1].map((count, i) => (
        <div key={i} className="sk-kanban-col">
          <div className="sk-kanban-header">
            <Sk w={90} h={14} r={5} />
            <Sk w={28} h={20} r={10} />
          </div>
          {Array.from({ length: count }, (_, j) => (
            <div key={j} className="sk-kanban-card">
              <Sk w="90%" h={13} r={5} />
              <Sk w="60%" h={11} r={4} />
              <div className="sk-kanban-card-footer">
                <Sk w={60} h={10} r={4} />
                <Sk w={24} h={24} r={12} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── PlanoDetail ─────────────────────────────────────────────────────────────

export function SkeletonPlanoDetail() {
  return (
    <div className="sk-detail">
      {/* Header card */}
      <div className="sk-header-card">
        <div className="sk-header-left">
          <Sk w={180} h={11} r={4} />
          <div className="sk-title-row">
            <Sk w="55%" h={22} r={6} />
            <Sk w={90} h={22} r={11} />
            <Sk w={100} h={20} r={10} />
          </div>
        </div>
        <div className="sk-header-right">
          {[60, 36, 36, 80, 36].map((w, i) => (
            <Sk key={i} w={w} h={32} r={8} />
          ))}
        </div>
      </div>

      {/* Meta chips */}
      <div className="sk-meta-grid">
        {[120, 140, 100, 110, 130].map((w, i) => (
          <div key={i} className="sk-meta-chip">
            <Sk w={32} h={32} r={16} />
            <div className="sk-meta-chip-body">
              <Sk w={50} h={10} r={4} />
              <Sk w={w} h={13} r={5} />
            </div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="sk-progress-wrap">
        <Sk w={60} h={11} r={4} />
        <Sk w="100%" h={8} r={4} />
        <Sk w={80} h={11} r={4} />
      </div>

      {/* 5W2H section */}
      <div className="sk-section">
        <div className="sk-section-header">
          <Sk w={120} h={15} r={5} />
        </div>
        <div className="sk-5w2h">
          {[0, 1, 2].map(col => (
            <div key={col} className="sk-5w2h-col">
              <div className="sk-5w2h-col-header">
                <Sk w={32} h={32} r={8} />
                <Sk w="60%" h={12} r={4} />
              </div>
              {[1, 2, 3].map(f => (
                <div key={f} className="sk-field">
                  <Sk w={80} h={10} r={4} />
                  <Sk w="100%" h={f === 3 ? 96 : 36} r={6} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Section placeholders (Tarefas, Evidências, Histórico) */}
      {[3, 2, 0].map((rows, i) => (
        <div key={i} className="sk-section">
          <div className="sk-section-header">
            <Sk w={20} h={20} r={4} />
            <Sk w={100 + i * 30} h={14} r={5} />
            <Sk w={24} h={20} r={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ReunioesList ────────────────────────────────────────────────────────────

export function SkeletonReunioesList({ rows = 7 }) {
  const cols = [36, 90, '55%', 110, 80, 80];
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="sk-table-row">
          {cols.map((w, j) => (
            <td key={j} style={{ padding: '10px 8px' }}>
              <Sk w={w} h={13} r={5} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonAgendaView() {
  const DAYS = [3, 0, 1, 2, 1, 0, 0]; // cards per day (Mon-Sun)
  return (
    <div className="reu-agenda-grid">
      {DAYS.map((count, i) => (
        <div key={i} className="reu-agenda-day">
          <div className="reu-agenda-day-header">
            <Sk w={30} h={10} r={4} />
            <Sk w={22} h={22} r={11} />
          </div>
          <div className="reu-agenda-day-body">
            {Array.from({ length: count }, (_, j) => (
              <div key={j} className="reu-agenda-card sk-block" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Sk w={80} h={10} r={4} />
                <Sk w="85%" h={13} r={5} />
                <Sk w={60} h={18} r={9} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── ReuniaoDetail ────────────────────────────────────────────────────────────

export function SkeletonReuniaoDetail() {
  return (
    <div className="sk-detail">
      {/* Header card */}
      <div className="sk-header-card">
        <div className="sk-header-left">
          <Sk w={160} h={11} r={4} />
          <div className="sk-title-row">
            <Sk w="50%" h={22} r={6} />
            <Sk w={90} h={22} r={11} />
            <Sk w={80} h={20} r={10} />
          </div>
        </div>
        <div className="sk-header-right">
          {[70, 70, 70, 70, 36].map((w, i) => (
            <Sk key={i} w={w} h={32} r={8} />
          ))}
        </div>
      </div>
      {/* Meta chips */}
      <div className="sk-meta-grid">
        {[100, 110, 90, 120, 130, 80].map((w, i) => (
          <div key={i} className="sk-meta-chip">
            <Sk w={28} h={28} r={14} />
            <div className="sk-meta-chip-body">
              <Sk w={45} h={10} r={4} />
              <Sk w={w} h={13} r={5} />
            </div>
          </div>
        ))}
      </div>
      {/* Tabs placeholder */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[80, 90, 70, 120].map((w, i) => <Sk key={i} w={w} h={34} r={8} />)}
      </div>
      {/* Tab content placeholder */}
      <div className="sk-section">
        <div className="sk-section-header">
          <Sk w={200} h={14} r={5} />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <Sk w={24} h={24} r={12} />
            <Sk w={`${40 + i * 15}%`} h={13} r={5} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TarefaForm ──────────────────────────────────────────────────────────────

export function SkeletonTarefaDetail() {
  return (
    <div className="sk-detail">
      {/* Header card */}
      <div className="sk-header-card">
        <div className="sk-header-left">
          <Sk w={160} h={11} r={4} />
          <div className="sk-title-row">
            <Sk w="50%" h={22} r={6} />
            <Sk w={90} h={22} r={11} />
            <Sk w={80} h={20} r={10} />
          </div>
        </div>
        <div className="sk-header-right">
          {[36, 36, 36, 70, 70, 36].map((w, i) => (
            <Sk key={i} w={w} h={32} r={8} />
          ))}
        </div>
      </div>

      {/* Meta chips */}
      <div className="sk-meta-grid">
        {[100, 130, 110, 100].map((w, i) => (
          <div key={i} className="sk-meta-chip">
            <Sk w={28} h={28} r={14} />
            <div className="sk-meta-chip-body">
              <Sk w={45} h={10} r={4} />
              <Sk w={w} h={13} r={5} />
            </div>
          </div>
        ))}
      </div>

      {/* Form section */}
      <div className="sk-section">
        <div className="sk-field"><Sk w={60} h={10} r={4} /><Sk w="100%" h={36} r={6} /></div>
        <div className="sk-field"><Sk w={70} h={10} r={4} /><Sk w="100%" h={96} r={6} /></div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="sk-field" style={{ flex: 1 }}><Sk w={70} h={10} r={4} /><Sk w="100%" h={36} r={6} /></div>
          <div className="sk-field" style={{ flex: 1 }}><Sk w={50} h={10} r={4} /><Sk w="100%" h={36} r={6} /></div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="sk-field" style={{ flex: 1 }}><Sk w={80} h={10} r={4} /><Sk w="100%" h={36} r={6} /></div>
          <div className="sk-field" style={{ flex: 1 }}><Sk w={70} h={10} r={4} /><Sk w="100%" h={36} r={6} /></div>
        </div>
      </div>

      {/* Apontamento section placeholder */}
      <div className="sk-section">
        <div className="sk-section-header">
          <Sk w={20} h={20} r={4} />
          <Sk w={150} h={14} r={5} />
        </div>
      </div>
    </div>
  );
}

// ── Generic simple table skeleton ────────────────────────────────────────────

export function SkeletonSimpleTable({ rows = 6, cols = [36, 90, '50%', 100, 80, 80] }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="sk-table-row">
          {cols.map((w, j) => (
            <td key={j} style={{ padding: '10px 8px' }}>
              <Sk w={w} h={13} r={5} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Card grid skeleton (RQ49, etc.) ──────────────────────────────────────────

export function SkeletonCardGrid({ cards = 6 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="sk-block skeleton-pulse" style={{ borderRadius: 10, padding: 16, border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Sk w={80} h={13} r={5} />
            <Sk w={70} h={20} r={10} />
          </div>
          <Sk w="85%" h={14} r={5} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <Sk w={100} h={11} r={4} />
            <Sk w={70} h={11} r={4} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Modal vincular tarefas ───────────────────────────────────────────────────

export function SkeletonVincularList({ rows = 5 }) {
  return (
    <div className="sk-vincular-list">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-vincular-item">
          <Sk w={16} h={16} r={3} />
          <div className="sk-vincular-info">
            <Sk w={`${60 + (i % 3) * 15}%`} h={13} r={5} />
            <Sk w={90} h={10} r={4} />
          </div>
        </div>
      ))}
    </div>
  );
}

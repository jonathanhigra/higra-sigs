import React, { useState } from "react";
import "./SourcesBadge.css";

function SourcesBadge({ fontes }) {
  const [open, setOpen] = useState(false);

  if (!fontes || fontes.length === 0) return null;

  // Deduplicate by source name
  const unique = [];
  const seen = new Set();
  for (const f of fontes) {
    const key = `${f.source}:${f.page}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(f);
    }
  }

  const topScore = Math.max(...unique.map((f) => f.score || 0));
  const confidenceColor = topScore >= 0.7 ? "var(--accent-success, #4caf50)"
    : topScore >= 0.45 ? "var(--accent-warning, #FFD54F)"
    : "var(--text-muted)";
  const confidenceLabel = topScore >= 0.7 ? "Alta" : topScore >= 0.45 ? "Média" : "Baixa";

  return (
    <div className="sources-badge">
      <button
        className="sources-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={`${unique.length} fontes consultadas`}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        {unique.length} {unique.length === 1 ? "fonte" : "fontes"}
        <span className="sources-confidence" style={{ color: confidenceColor }} title={`Confiança: ${(topScore * 100).toFixed(0)}%`}>
          ● {confidenceLabel}
        </span>
        <span className="sources-chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul className="sources-list">
          {unique.map((f, i) => {
            const hasTitle = f.display_name && !/^sem\s+t[ií]tulo$/i.test(f.display_name.trim());
            const name = hasTitle
              ? f.display_name
              : (f.source || "").replace(/\.[^.]+$/, "").replace(/MANUAL T[ÉE]CNICO /i, "");
            return (
              <li key={i} className="sources-item">
                <span className="sources-name">{name}</span>
                {f.page && <span className="sources-page">p. {f.page}</span>}
                {f.score && <span className="sources-score">{(f.score * 100).toFixed(0)}%</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default SourcesBadge;

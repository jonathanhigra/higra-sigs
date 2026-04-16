import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { normalize } from '../utils/format';
import './CommandPalette.css';

/**
 * Paleta de comandos global (Ctrl+K / Cmd+K).
 * Lista de comandos = navegação rápida para páginas do SIGS.
 *
 * Aberta via evento customizado `open-command-palette` ou via atalho.
 */

const COMMANDS = [
  // Início
  { section: 'Início',       label: 'Feed',                        path: '/feed',                 keywords: 'home inicio' },
  { section: 'Início',       label: 'Minhas Tarefas',              path: '/tarefas',              keywords: 'tasks todo' },
  { section: 'Início',       label: 'Nova Tarefa',                 path: '/tarefas/nova',         keywords: 'task novo criar' },
  { section: 'Início',       label: 'Notificações',                path: '/notifications',        keywords: 'avisos alertas' },
  { section: 'Início',       label: 'Mensagens',                   path: '/messages',             keywords: 'chat dm' },
  // Qualidade
  { section: 'Qualidade',    label: 'Hub de Qualidade',            path: '/qualidade',            keywords: 'q' },
  { section: 'Qualidade',    label: 'RQ03 — Não-Conformidades',    path: '/qualidade/rq03',       keywords: 'nao conformidade nc' },
  { section: 'Qualidade',    label: 'RQ49 — Notas de Oportunidade', path: '/qualidade/rq49',      keywords: 'no oportunidade' },
  // Indicadores / Projetos
  { section: 'Gestão',       label: 'Indicadores',                 path: '/indicadores',          keywords: 'kpi dashboards' },
  { section: 'Gestão',       label: 'Ranking',                     path: '/indicadores/ranking',  keywords: 'top desempenho' },
  { section: 'Gestão',       label: 'Projetos',                    path: '/projetos',             keywords: 'projetos' },
  { section: 'Gestão',       label: 'Planos de Ação',              path: '/planos-acao',          keywords: 'pa acao' },
  { section: 'Gestão',       label: 'Reuniões',                    path: '/reunioes',             keywords: 'meetings agenda raco' },
  { section: 'Gestão',       label: 'Documentos',                  path: '/documentos',           keywords: 'docs' },
  { section: 'Gestão',       label: 'Biblioteca',                  path: '/biblioteca',           keywords: 'arquivos library' },
  // Industrial
  { section: 'Industrial',   label: 'Fabricação — Checklists',     path: '/fabricacao',           keywords: 'fabricacao producao' },
  { section: 'Industrial',   label: 'Instrumentos',                path: '/fabricacao/instrumentos', keywords: 'calibracao instrumentacao' },
  { section: 'Industrial',   label: 'Assistência Técnica',         path: '/assistencia',          keywords: 'at suporte' },
  { section: 'Industrial',   label: 'Chamados',                    path: '/chamados',             keywords: 'tickets helpdesk' },
  { section: 'Industrial',   label: 'Laboratório / Bancada',       path: '/laboratorio',          keywords: 'lab testes' },
  { section: 'Industrial',   label: 'Motores',                     path: '/motores',              keywords: 'bombas pump' },
  { section: 'Industrial',   label: 'Laudos',                      path: '/laudos',               keywords: 'relatorios' },
  // Comunicação
  { section: 'Comunicação',  label: 'Comunicação',                 path: '/comunicacao',          keywords: 'eventos avisos' },
  // Cadastros / Config
  { section: 'Sistema',      label: 'Cadastros',                   path: '/cadastros',            keywords: 'cadastros dados' },
  { section: 'Sistema',      label: 'Permissões',                  path: '/admin/permissoes',     keywords: 'admin roles' },
  { section: 'Sistema',      label: 'Configurações',               path: '/config',               keywords: 'settings' },
  { section: 'Sistema',      label: 'Domínios',                    path: '/config/dominios',      keywords: 'dominios' },
  { section: 'Sistema',      label: 'Meu Perfil',                  path: '/profile',              keywords: 'profile conta' },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  // Atalho global (Ctrl+K) + sequência G+* (vim-style navigation)
  useEffect(() => {
    let gPressed = false;
    let gTimer = null;
    const NAV_MAP = { h: '/', t: '/tarefas', p: '/projetos', r: '/qualidade/rq03', l: '/laboratorio', i: '/indicadores' };
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const inForm = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
      const isMod = e.ctrlKey || e.metaKey;
      // Ctrl+K: paleta
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }
      if (inForm) return;
      // G sequence: press G then a letter within 800ms
      if (!isMod && e.key.toLowerCase() === 'g') {
        gPressed = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => { gPressed = false; }, 800);
        return;
      }
      if (gPressed && !isMod && NAV_MAP[e.key.toLowerCase()]) {
        e.preventDefault();
        gPressed = false;
        clearTimeout(gTimer);
        navigate(NAV_MAP[e.key.toLowerCase()]);
      }
    };
    window.addEventListener('keydown', onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener('open-command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onOpen);
      clearTimeout(gTimer);
    };
  }, [navigate]);

  // Auto-focus ao abrir
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = normalize(query).trim();
    if (!q) return COMMANDS;
    return COMMANDS.filter(c => {
      const hay = normalize(`${c.section} ${c.label} ${c.keywords || ''}`);
      return hay.includes(q);
    });
  }, [query]);

  // Agrupa por seção
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach((c, i) => {
      if (!groups[c.section]) groups[c.section] = [];
      groups[c.section].push({ ...c, index: i });
    });
    return groups;
  }, [filtered]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(filtered.length - 1, s + 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(0, s - 1)); }
    if (e.key === 'Enter')     {
      e.preventDefault();
      const cmd = filtered[selected];
      if (cmd) { navigate(cmd.path); setOpen(false); }
    }
  };

  // Mantém item selecionado visível
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-cmd-index="${selected}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  return (
    <div className="cmdp-overlay" role="presentation" onClick={() => setOpen(false)}>
      <div
        className="cmdp-container"
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        onClick={e => e.stopPropagation()}
      >
        <div className="cmdp-searchbar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={onKeyDown}
            placeholder="Buscar comandos, páginas, módulos…"
            aria-label="Buscar comandos"
          />
          <kbd className="cmdp-kbd">ESC</kbd>
        </div>

        <div className="cmdp-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="cmdp-empty">Nenhum resultado para “{query}”</div>
          ) : (
            Object.entries(grouped).map(([section, items]) => (
              <div key={section}>
                <div className="cmdp-section">{section}</div>
                {items.map(cmd => (
                  <button
                    key={cmd.path}
                    data-cmd-index={cmd.index}
                    className={`cmdp-item${cmd.index === selected ? ' active' : ''}`}
                    onMouseEnter={() => setSelected(cmd.index)}
                    onClick={() => { navigate(cmd.path); setOpen(false); }}
                  >
                    <span className="cmdp-item-label">{cmd.label}</span>
                    <span className="cmdp-item-path">{cmd.path}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="cmdp-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>ESC</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}

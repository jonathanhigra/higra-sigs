import { useEffect, useState } from 'react';
import Modal from './Modal';

/**
 * Modal que lista atalhos de teclado globais.
 * Aberto pelo atalho "?" ou por evento custom `open-shortcuts-help`.
 */

const SHORTCUTS = [
  { group: 'Global',    keys: ['Ctrl', 'K'], description: 'Abrir paleta de comandos' },
  { group: 'Global',    keys: ['?'],         description: 'Mostrar atalhos' },
  { group: 'Global',    keys: ['Esc'],       description: 'Fechar modal / diálogo' },
  { group: 'Listas',    keys: ['/'],         description: 'Focar campo de busca' },
  { group: 'Listas',    keys: ['N'],         description: 'Novo item (em listas que suportam)' },
  { group: 'Formulário', keys: ['Ctrl', 'S'], description: 'Salvar formulário' },
  { group: 'Navegação', keys: ['G', 'H'],    description: 'Ir para o início' },
  { group: 'Navegação', keys: ['G', 'T'],    description: 'Ir para tarefas' },
  { group: 'Navegação', keys: ['G', 'P'],    description: 'Ir para projetos' },
  { group: 'Navegação', keys: ['G', 'R'],    description: 'Ir para Não Conformidades' },
  { group: 'Navegação', keys: ['G', 'L'],    description: 'Ir para laboratório' },
  { group: 'Navegação', keys: ['G', 'I'],    description: 'Ir para indicadores' },
];

export default function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      // "?" abre/fecha — evita conflito com forms
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-shortcuts-help', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-shortcuts-help', onOpen);
    };
  }, []);

  const groups = SHORTCUTS.reduce((acc, s) => {
    (acc[s.group] = acc[s.group] || []).push(s);
    return acc;
  }, {});

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Atalhos de teclado" size="small">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {Object.entries(groups).map(([name, items]) => (
          <div key={name}>
            <div style={{
              fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
            }}>{name}</div>
            {items.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 0', borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.04))',
              }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{s.description}</span>
                <span style={{ display: 'flex', gap: 4 }}>
                  {s.keys.map((k, j) => (
                    <kbd key={j} style={{
                      display: 'inline-block', padding: '2px 6px', minWidth: 18,
                      borderRadius: 4, background: 'var(--bg-input)',
                      border: '1px solid var(--border-primary)',
                      color: 'var(--text-primary)', fontFamily: 'inherit',
                      fontSize: '0.72rem', fontWeight: 600, textAlign: 'center',
                    }}>{k}</kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}

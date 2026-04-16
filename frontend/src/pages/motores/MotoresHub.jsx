import { useNavigate } from 'react-router-dom';
import '../tarefas/TarefasList.css';

const modules = [
  { to: '/motores',                  label: 'Motores',                 desc: 'Todos os motores, busca avançada, especificações.',            color: '#2196f3' },
  { to: '/motores/bombas',           label: 'Bombas',                  desc: 'Cadastro de bombas hidráulicas.',                              color: '#00bcd4' },
  { to: '/motores/fichas',           label: 'Fichas Técnicas',         desc: 'Fichas técnicas motor+bomba com dados JSON.',                  color: '#4caf50' },
  { to: '/motores/normas',           label: 'Normas',                  desc: 'Normas ABNT, ISO, IEC, API aplicáveis.',                       color: '#ff9800' },
  { to: '/motores/fornecedores',     label: 'Fornecedores',            desc: 'Fornecedores de componentes de motores.',                      color: '#9c27b0' },
  { to: '/motores/sensores',         label: 'Sensores',                desc: 'Sensores disponíveis e compatibilidade.',                      color: '#607d8b' },
  { to: '/motores/calculadora',      label: 'Calculadora de Potência', desc: 'Dado vazão + altura, sugere motor.',                           color: '#f44336' },
  { to: '/motores/classes-protecao', label: 'Classe de Proteção',      desc: 'IP54, IP55, IP68 e equivalentes.',                            color: '#795548' },
  { to: '/motores/comparador',       label: 'Comparador',              desc: 'Compare 2 ou 3 motores lado a lado.',                          color: '#009688' },
];

export default function MotoresHub() {
  const navigate = useNavigate();

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Motores / Engenharia</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 16 }}>
        {modules.map(m => (
          <div
            key={m.to}
            onClick={() => navigate(m.to)}
            style={{
              padding: 20, borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-secondary)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: m.color }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>{m.label}</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>{m.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import '../tarefas/TarefasList.css';

const modules = [
  { to: '/qualidade/rq03', label: 'Nao Conformidades (RQ03)', desc: 'Registro e acompanhamento de nao conformidades, acoes corretivas e preventivas.', perm: 'RNCO', color: '#e74c3c' },
  { to: '/qualidade/rq49', label: 'Notas de Oportunidade (RQ49)', desc: 'Oportunidades de melhoria, analise de risco (gravidade x ocorrencia).', perm: 'CMNA', color: '#f39c12' },
  { to: '/fabricacao/instrumentos', label: 'Instrumentos de Medicao', desc: 'Controle de calibracao e rastreabilidade de instrumentos.', perm: 'CHKL', color: '#3498db' },
  { to: '/qualidade/rq80', label: 'Auditorias (RQ80)', desc: 'Planejamento e execução de auditorias internas e externas.', perm: 'QLDD', color: '#2196f3' },
  { to: '/qualidade/rq94', label: 'Análise de Mudança (RQ94)', desc: 'Controle de mudanças com análise de impacto e aprovação.', perm: 'QLDD', color: '#9c27b0' },
  { to: '/qualidade/sst', label: 'SST — Segurança do Trabalho', desc: 'Cadastros auxiliares de SST: partes do corpo, lesões, acidentes.', perm: 'RNCO', color: '#f44336' },
  { to: '/qualidade/fmea', label: 'FMEA', desc: 'Análise de Modo e Efeito de Falha: identificação de riscos no processo.', perm: 'QLDD', color: '#607d8b' },
  { to: '/qualidade/indicadores', label: 'Indicadores da Qualidade', desc: 'Taxa de NC por mês, tempo médio de fechamento, índice de eficácia.', perm: 'RNCO', color: '#009688' },
  { to: '/qualidade/rq49/avaliacao-eficacia', label: 'Avaliação de Eficácia (RQ49)', desc: 'Acompanhamento de NOs fechadas pendentes de avaliação de eficácia.', perm: 'CMNA', color: '#ff5722' },
  { to: '/qualidade/consolidado', label: 'Visão Diretoria', desc: 'Dashboard consolidado: RQ03 + RQ49 + RQ80 abertas.', perm: 'RNCO', color: '#1a1a2e' },
];

export default function QualidadeHub() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Qualidade</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginTop: 16 }}>
        {modules.filter(m => hasPermission(m.perm)).map(m => (
          <div key={m.to} onClick={() => navigate(m.to)}
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

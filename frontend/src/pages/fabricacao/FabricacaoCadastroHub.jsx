import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import '../tarefas/TarefasList.css';

const modules = [
  { to: '/fabricacao/cadastros/bitola-fio', label: 'Bitola de Fio', desc: 'Seção transversal do fio de bobinagem (AWG, mm²).', color: '#e91e63' },
  { to: '/fabricacao/cadastros/fabricante-fio', label: 'Fabricante de Fio', desc: 'Fornecedores de fio de cobre para bobinagem.', color: '#9c27b0' },
  { to: '/fabricacao/cadastros/carcaca', label: 'Carcaça', desc: 'Tipos de carcaça do motor (material, acabamento).', color: '#3f51b5' },
  { to: '/fabricacao/cadastros/tipo-acionamento', label: 'Tipo de Acionamento', desc: 'Direto, estrela-triângulo, soft-starter, VFD.', color: '#009688' },
  { to: '/fabricacao/cadastros/cor-tinta', label: 'Cor de Tinta', desc: 'Cores RAL com nome comercial e fornecedor.', color: '#ff9800' },
  { to: '/fabricacao/cadastros/empacotamento', label: 'Tipo de Empacotamento', desc: 'Caixa, pallet, engradado.', color: '#795548' },
  { to: '/fabricacao/cadastros/forma-construtiva', label: 'Forma Construtiva', desc: 'Vertical submersível, horizontal, etc.', color: '#673ab7' },
  { to: '/fabricacao/cadastros/tipo-cabo', label: 'Tipo de Cabo', desc: 'Seção, cor e comprimento padrão dos cabos.', color: '#00bcd4' },
  { to: '/fabricacao/cadastros/tipo-sensor', label: 'Tipo de Sensor', desc: 'PT100, termistor, vibração, etc.', color: '#4caf50' },
  { to: '/fabricacao/cadastros/tensao', label: 'Tensão', desc: '127V, 220V, 380V, 440V, 760V.', color: '#ff5722' },
  { to: '/fabricacao/cadastros/fornecedor', label: 'Fornecedores', desc: 'Fornecedores de componentes de fabricação.', color: '#607d8b' },
];

export default function FabricacaoCadastroHub() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore(s => s.hasPermission);
  return (
    <div className="tarefas-page">
      <div className="tarefas-header"><h1>Cadastros de Fabricação</h1></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 16, marginTop: 16 }}>
        {modules.map(m => (
          <div key={m.to} onClick={() => navigate(m.to)}
            style={{ padding: 20, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)', transition: 'transform 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
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

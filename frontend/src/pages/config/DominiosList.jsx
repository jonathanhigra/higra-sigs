/**
 * APEX pg 17 — Relação de Domínios (IR)
 * APEX pg 18 — Cadastro de Domínios (Form + Report valores)
 */
import '../tarefas/TarefasList.css';

export default function DominiosList() {
  return (
    <div className="tarefas-page">
      <div className="tarefas-header"><h1>Domínios / LOVs</h1></div>
      <div className="empty-state">
        <p>Configure os domínios de dados (LOVs) do sistema.</p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          As LOVs são populadas automaticamente durante a migração de dados do Oracle.<br />
          Use o endpoint <code>/api/lov/dominios/NOME_DOMINIO</code> para consultar valores.
        </p>
      </div>
    </div>
  );
}

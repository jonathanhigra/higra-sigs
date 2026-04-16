/**
 * Cadastro de Tarefas Fixas (recorrentes) — gerenciamento global por projeto.
 * Permite criar, visualizar e remover tarefas fixas com recorrência diária/semanal/mensal.
 */
import { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { projetoService } from '../../services/projetos/projetoService';
import Modal from '../../components/Modal';
import '../../components/Modal.css';

const RECORRENCIA_LABELS = { DIARIA: 'Diária', SEMANAL: 'Semanal', MENSAL: 'Mensal' };
const DIA_SEMANA_LABELS = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' };

const EMPTY_FORM = {
  hgr_prj_cad_projeto_id: '',
  titulo: '',
  descricao: '',
  recorrencia: 'SEMANAL',
  dia_semana: '',
  dia_mes: '',
};

function RecorrenciaBadge({ rec, dia_semana, dia_mes }) {
  const label = RECORRENCIA_LABELS[rec] || rec;
  const detalhe = rec === 'SEMANAL' && dia_semana != null
    ? ` (${DIA_SEMANA_LABELS[dia_semana] || dia_semana})`
    : rec === 'MENSAL' && dia_mes
    ? ` (dia ${dia_mes})`
    : '';
  const color = rec === 'DIARIA' ? '#3b82f6' : rec === 'SEMANAL' ? '#8b5cf6' : '#f59e0b';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 10,
      background: color + '22', color, fontSize: '0.75rem', fontWeight: 600,
    }}>{label}{detalhe}</span>
  );
}

export default function ProjetoTarefasFixasList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projetos, setProjetos] = useState([]);
  const [filtroProjeto, setFiltroProjeto] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = filtroProjeto ? { projeto_id: filtroProjeto } : {};
      const { data } = await projetoService.listarTodasTarefasFixas(params);
      setItems(data.items || []);
    } catch { toast.error('Erro ao carregar tarefas fixas'); }
    finally { setLoading(false); }
  };

  const loadProjetos = async () => {
    try {
      const { data } = await projetoService.listar({ per_page: 200 });
      setProjetos(data.items || []);
    } catch {}
  };

  useEffect(() => { loadProjetos(); }, []);
  useEffect(() => { load(); }, [filtroProjeto]);

  const handleSave = async () => {
    if (!form.titulo.trim()) { toast.error('Título obrigatório'); return; }
    if (!form.hgr_prj_cad_projeto_id) { toast.error('Selecione o projeto'); return; }
    setSaving(true);
    try {
      await projetoService.criarTarefaFixa(form.hgr_prj_cad_projeto_id, {
        titulo: form.titulo.trim(),
        descricao: form.descricao || null,
        recorrencia: form.recorrencia,
        dia_semana: form.dia_semana !== '' ? Number(form.dia_semana) : null,
        dia_mes: form.dia_mes !== '' ? Number(form.dia_mes) : null,
      });
      toast.success('Tarefa fixa criada');
      setModalOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch { toast.error('Erro ao criar tarefa fixa'); }
    finally { setSaving(false); }
  };

  const handleRemover = async (item) => {
    if (!window.confirm(`Remover "${item.titulo}"?`)) return;
    try {
      await projetoService.removerTarefaFixa(item.hgr_prj_cad_projeto_id, item.id);
      toast.success('Tarefa fixa removida');
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch { toast.error('Erro ao remover'); }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Tarefas Fixas (Recorrentes)</h1>
        <button className="btn-primary" onClick={() => { setForm(EMPTY_FORM); setModalOpen(true); }}>
          + Nova Tarefa Fixa
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <select className="form-control" style={{ maxWidth: 300 }}
          value={filtroProjeto} onChange={e => setFiltroProjeto(e.target.value)}>
          <option value="">— Todos os projetos —</option>
          {projetos.map(p => (
            <option key={p.id} value={p.id}>
              {p.codigo ? `${p.codigo} — ` : ''}{p.titulo}
            </option>
          ))}
        </select>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {items.length} tarefa(s) fixa(s)
        </span>
      </div>

      {loading ? (
        <div className="loading-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhuma tarefa fixa cadastrada{filtroProjeto ? ' para este projeto' : ''}.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Projeto</th>
              <th>Título</th>
              <th>Recorrência</th>
              <th>Descrição</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td style={{ fontSize: '0.82rem' }}>
                  {item.projeto_codigo ? (
                    <span style={{ fontWeight: 600 }}>{item.projeto_codigo}</span>
                  ) : null}
                  {item.projeto_titulo ? (
                    <span style={{ color: 'var(--text-secondary)', marginLeft: item.projeto_codigo ? 4 : 0 }}>
                      {item.projeto_titulo}
                    </span>
                  ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td style={{ fontWeight: 600 }}>{item.titulo}</td>
                <td>
                  <RecorrenciaBadge rec={item.recorrencia} dia_semana={item.dia_semana} dia_mes={item.dia_mes} />
                </td>
                <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: 300,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={item.descricao || ''}>
                  {item.descricao || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td>
                  <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    onClick={() => handleRemover(item)}>Remover</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova Tarefa Fixa"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Salvando...' : 'Criar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Projeto *</label>
          <select className="form-control" value={form.hgr_prj_cad_projeto_id}
            onChange={e => setForm(f => ({ ...f, hgr_prj_cad_projeto_id: e.target.value }))}>
            <option value="">— Selecione —</option>
            {projetos.map(p => (
              <option key={p.id} value={p.id}>
                {p.codigo ? `${p.codigo} — ` : ''}{p.titulo}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Título *</label>
          <input className="form-control" value={form.titulo}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Ex: Reunião semanal de status" />
        </div>
        <div className="form-group">
          <label>Descrição</label>
          <textarea className="form-control" rows={2} value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Recorrência</label>
          <select className="form-control" value={form.recorrencia}
            onChange={e => setForm(f => ({ ...f, recorrencia: e.target.value, dia_semana: '', dia_mes: '' }))}>
            <option value="DIARIA">Diária</option>
            <option value="SEMANAL">Semanal</option>
            <option value="MENSAL">Mensal</option>
          </select>
        </div>
        {form.recorrencia === 'SEMANAL' && (
          <div className="form-group">
            <label>Dia da semana</label>
            <select className="form-control" value={form.dia_semana}
              onChange={e => setForm(f => ({ ...f, dia_semana: e.target.value }))}>
              <option value="">— Qualquer —</option>
              <option value="1">Segunda-feira</option>
              <option value="2">Terça-feira</option>
              <option value="3">Quarta-feira</option>
              <option value="4">Quinta-feira</option>
              <option value="5">Sexta-feira</option>
              <option value="6">Sábado</option>
              <option value="0">Domingo</option>
            </select>
          </div>
        )}
        {form.recorrencia === 'MENSAL' && (
          <div className="form-group">
            <label>Dia do mês (1–31)</label>
            <input type="number" className="form-control" min="1" max="31" value={form.dia_mes}
              onChange={e => setForm(f => ({ ...f, dia_mes: e.target.value }))}
              placeholder="Ex: 1 (primeiro dia do mês)" />
          </div>
        )}
        <div style={{ padding: 8, background: 'var(--bg-surface)', borderRadius: 6, fontSize: '0.78rem',
          color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
          Tarefas fixas são modelos de recorrência. Elas aparecem no painel do projeto como lembretes estruturais recorrentes.
        </div>
      </Modal>
    </div>
  );
}

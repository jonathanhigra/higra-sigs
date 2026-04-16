import React, { useCallback, useEffect, useState } from 'react';
import { tarefaService } from '../../services/tarefas/tarefaService';
import { projetoService } from '../../services/projetos/projetoService';
import { useToast } from '../../contexts/ToastContext';
import '../projetos/ProjetoTarefasFixasList.css';

const CATEGORIAS = [
  { value: '', label: 'Sem categoria' },
  { value: 'DESENVOLVIMENTO', label: 'Desenvolvimento' },
  { value: 'REUNIAO', label: 'Reunião' },
  { value: 'SUPORTE', label: 'Suporte' },
  { value: 'DOCUMENTACAO', label: 'Documentação' },
  { value: 'PLANEJAMENTO', label: 'Planejamento' },
  { value: 'OUTROS', label: 'Outros' },
];

function formatTempo(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') + 'm' : ''}` : `${m}m`;
}

const EMPTY_FORM = {
  titulo: '',
  descricao: '',
  dt_apontamento: new Date().toISOString().slice(0, 10),
  tempo_minutos: '',
  horas: '',
  minutos: '',
  hgr_prj_cad_projeto_id: '',
  categoria: '',
};

export default function ApontamentosAvulsosList() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [projetos, setProjetos] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ dt_inicio: '', dt_fim: '', minhas: false });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.dt_inicio) params.dt_inicio = filters.dt_inicio;
      if (filters.dt_fim) params.dt_fim = filters.dt_fim;
      if (filters.minhas) params.minhas = true;
      const { data } = await tarefaService.listarAvulsos(params);
      setRows(data || []);
    } catch {
      showToast('Erro ao carregar apontamentos', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, showToast]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => {
    projetoService.listar({ per_page: 200 }).then(({ data }) => {
      setProjetos(data?.items || data || []);
    }).catch(() => {});
  }, []);

  function handleField(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleCheckbox(e) {
    setFilters((f) => ({ ...f, [e.target.name]: e.target.checked }));
  }

  async function handleSave(e) {
    e.preventDefault();
    const horas = parseInt(form.horas || 0, 10);
    const minutos = parseInt(form.minutos || 0, 10);
    const total = horas * 60 + minutos;
    if (!form.titulo.trim()) return showToast('Título obrigatório', 'error');
    if (total <= 0) return showToast('Informe o tempo (horas e/ou minutos)', 'error');
    setSaving(true);
    try {
      await tarefaService.criarAvulso({
        titulo: form.titulo.trim(),
        descricao: form.descricao || null,
        dt_apontamento: form.dt_apontamento || null,
        tempo_minutos: total,
        hgr_prj_cad_projeto_id: form.hgr_prj_cad_projeto_id || null,
        categoria: form.categoria || null,
      });
      showToast('Apontamento registrado', 'success');
      setModalOpen(false);
      setForm(EMPTY_FORM);
      fetchRows();
    } catch {
      showToast('Erro ao salvar apontamento', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Excluir este apontamento?')) return;
    try {
      await tarefaService.excluirAvulso(id);
      showToast('Excluído', 'success');
      setRows((r) => r.filter((x) => x.id !== id));
    } catch {
      showToast('Erro ao excluir', 'error');
    }
  }

  const totalMin = rows.reduce((acc, r) => acc + (r.tempo_minutos || 0), 0);

  return (
    <div className="ptf-page">
      <div className="ptf-header">
        <div>
          <h1 className="ptf-title">Apontamentos Avulsos</h1>
          <p className="ptf-subtitle">Registro de tempo sem vínculo com tarefa específica</p>
        </div>
        <button className="ptf-btn-primary" onClick={() => setModalOpen(true)}>
          + Novo Apontamento
        </button>
      </div>

      {/* Filtros */}
      <div className="ptf-filters-bar">
        <label>
          De
          <input
            type="date"
            name="dt_inicio"
            value={filters.dt_inicio}
            onChange={(e) => setFilters((f) => ({ ...f, dt_inicio: e.target.value }))}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            name="dt_fim"
            value={filters.dt_fim}
            onChange={(e) => setFilters((f) => ({ ...f, dt_fim: e.target.value }))}
          />
        </label>
        <label className="ptf-checkbox-label">
          <input type="checkbox" name="minhas" checked={filters.minhas} onChange={handleCheckbox} />
          Somente meus
        </label>
        <button className="ptf-btn-secondary" onClick={fetchRows}>Filtrar</button>
        {rows.length > 0 && (
          <span className="ptf-total-badge">
            Total: {formatTempo(totalMin)} ({rows.length} registros)
          </span>
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="ptf-loading">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="ptf-empty">Nenhum apontamento encontrado.</div>
      ) : (
        <div className="ptf-table-wrap">
          <table className="ptf-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Título</th>
                <th>Categoria</th>
                <th>Projeto</th>
                <th>Usuário</th>
                <th>Tempo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.dt_apontamento?.slice(0, 10) || '—'}</td>
                  <td>
                    <strong>{r.titulo}</strong>
                    {r.descricao && <div style={{ fontSize: '0.75rem', color: 'var(--feed-muted)' }}>{r.descricao}</div>}
                  </td>
                  <td>{r.categoria ? <span className="ptf-rec-badge">{r.categoria}</span> : '—'}</td>
                  <td>{r.projeto_titulo || '—'}</td>
                  <td>{r.usuario_nome || '—'}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{formatTempo(r.tempo_minutos)}</td>
                  <td>
                    <button
                      className="ptf-btn-danger-sm"
                      onClick={() => handleDelete(r.id)}
                      title="Excluir"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="ptf-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="ptf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ptf-modal-header">
              <h3>Novo Apontamento Avulso</h3>
              <button className="ptf-modal-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSave} className="ptf-modal-body">
              <label>
                Título *
                <input
                  name="titulo"
                  value={form.titulo}
                  onChange={handleField}
                  placeholder="O que foi feito?"
                  required
                />
              </label>

              <label>
                Descrição
                <textarea
                  name="descricao"
                  value={form.descricao}
                  onChange={handleField}
                  rows={2}
                  placeholder="Detalhes opcionais..."
                />
              </label>

              <div className="ptf-form-row">
                <label>
                  Data *
                  <input
                    type="date"
                    name="dt_apontamento"
                    value={form.dt_apontamento}
                    onChange={handleField}
                    required
                  />
                </label>
                <label>
                  Categoria
                  <select name="categoria" value={form.categoria} onChange={handleField}>
                    {CATEGORIAS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="ptf-form-row">
                <label>
                  Horas
                  <input
                    type="number"
                    name="horas"
                    value={form.horas}
                    onChange={handleField}
                    min={0}
                    max={23}
                    placeholder="0"
                  />
                </label>
                <label>
                  Minutos
                  <input
                    type="number"
                    name="minutos"
                    value={form.minutos}
                    onChange={handleField}
                    min={0}
                    max={59}
                    placeholder="0"
                  />
                </label>
              </div>

              <label>
                Projeto (opcional)
                <select
                  name="hgr_prj_cad_projeto_id"
                  value={form.hgr_prj_cad_projeto_id}
                  onChange={handleField}
                >
                  <option value="">Sem projeto</option>
                  {projetos.map((p) => (
                    <option key={p.id} value={p.id}>{p.titulo || p.nome}</option>
                  ))}
                </select>
              </label>

              <div className="ptf-modal-actions">
                <button type="button" className="ptf-btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="ptf-btn-primary" disabled={saving}>
                  {saving ? 'Salvando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

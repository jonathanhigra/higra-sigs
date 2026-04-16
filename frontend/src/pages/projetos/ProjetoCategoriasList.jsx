/**
 * APEX pg equivalente — Categorias de Projeto (CRUD).
 * Permissão: PRJT (visualizar) / PRJT M (editar) / PRJT E (remover).
 */
import { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { projetoService } from '../../services/projetos/projetoService';
import Modal from '../../components/Modal';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

function getStatusMeta(ativo) {
  const normalized = String(ativo ?? '').trim().toUpperCase();
  if (['S', 'A', '1', 'TRUE'].includes(normalized)) {
    return { label: 'Ativa', color: '#166534', background: '#dcfce7' };
  }
  if (!normalized) {
    return { label: 'Sem status', color: '#475569', background: '#e2e8f0' };
  }
  return { label: 'Inativa', color: '#991b1b', background: '#fee2e2' };
}

const EMPTY_FORM = { id: null, descricao: '', sigla: '', ativo: 'S' };

export default function ProjetoCategoriasList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await projetoService.categorias();
      setItems(data.items || []);
    } catch {
      toast.error('Erro ao carregar categorias de projetos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY_FORM); setModalOpen(true); };
  const openEdit = (item) => {
    setForm({
      id: item.id,
      descricao: item.descricao || '',
      sigla: item.sigla || '',
      ativo: String(item.ativo || 'S').toUpperCase(),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSaving(true);
    try {
      if (form.id) {
        await projetoService.atualizarCategoria(form.id, {
          descricao: form.descricao, sigla: form.sigla || null, ativo: form.ativo,
        });
        toast.success('Categoria atualizada');
      } else {
        await projetoService.criarCategoria({
          descricao: form.descricao, sigla: form.sigla || null,
        });
        toast.success('Categoria criada');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Erro ao salvar categoria';
      toast.error(typeof msg === 'string' ? msg : 'Erro ao salvar categoria');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (item) => {
    if (!window.confirm(`Remover categoria "${item.descricao}"?\n\nSe houver projetos vinculados, ela será apenas inativada.`)) return;
    try {
      await projetoService.removerCategoria(item.id);
      toast.success('Categoria removida/inativada');
      load();
    } catch {
      toast.error('Erro ao remover categoria');
    }
  };

  const filtered = items.filter((item) => {
    const haystack = `${item.descricao || ''} ${item.sigla || ''}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Categorias de Projetos</h1>
        <div className="tarefas-actions">
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginRight: 12 }}>
            {filtered.length} de {items.length}
          </span>
          <button className="btn-primary" type="button" onClick={openCreate}>+ Nova Categoria</button>
        </div>
      </div>

      <div className="tarefas-filters">
        <input
          type="text"
          placeholder="Pesquisar categoria ou sigla..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
      </div>

      {loading ? (
        <div className="empty-state">Carregando categorias...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">Nenhuma categoria encontrada.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>ID</th>
              <th style={{ width: 140 }}>Sigla</th>
              <th>Descrição</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 160 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const status = getStatusMeta(item.ativo);
              return (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{item.id}</td>
                  <td>{item.sigla || '—'}</td>
                  <td>{item.descricao || '—'}</td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '4px 10px', borderRadius: 999,
                      fontSize: '0.78rem', fontWeight: 600,
                      color: status.color, background: status.background,
                    }}>{status.label}</span>
                  </td>
                  <td>
                    <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.75rem', marginRight: 6 }}
                      onClick={() => openEdit(item)}>Editar</button>
                    <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                      onClick={() => handleRemove(item)}>Remover</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Modal criar/editar */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={form.id ? 'Editar Categoria' : 'Nova Categoria'} size="small"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Salvando...' : (form.id ? 'Salvar' : 'Criar')}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Descrição *</label>
          <input className="form-control" value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Ex: Projeto de TI, Obra civil..." autoFocus />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Sigla</label>
            <input className="form-control" value={form.sigla} maxLength={20}
              onChange={e => setForm(f => ({ ...f, sigla: e.target.value.toUpperCase() }))}
              placeholder="Ex: TI, OBRA" />
          </div>
          {form.id && (
            <div className="form-group">
              <label>Status</label>
              <select className="form-control" value={form.ativo}
                onChange={e => setForm(f => ({ ...f, ativo: e.target.value }))}>
                <option value="S">Ativa</option>
                <option value="N">Inativa</option>
              </select>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

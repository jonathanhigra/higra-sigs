/**
 * APEX pg 134 — Relação de Projetos
 * Layout: Header com filtros + Overview (totais + gráficos) + Toggle Lista/Kanban
 * Filtros (12): search, status, prioridade, categoria, por(todos/meus), dt_inicio, dt_fim, unidade, tipo, responsável
 * Dashboard: Total/Andamento/Finalizados/Paralisados/Atrasados + gráfico status + gráfico tarefas + financeiro
 * Lista: ContentRow template (priority color, título, código/categoria, responsável, dates, status chips)
 * Kanban: PLUGIN_MATERIAL.KANBAN com drag, colunas de HGR_PRJ_REG_ETP_KBN
 * Botão criar abre modal pg 203
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { projetoService } from '../../services/projetos/projetoService';
import { lovService } from '../../services/lovService';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { StatusBadge } from '../../components/ui';
import { SkeletonSimpleTable } from '../../components/SkeletonPlanos';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

const PRIORIDADE_COLORS = { '1': '#ef4444', '2': '#ff9800', '3': '#FFCC00', '4': '#4caf50', '5': '#6b7280', URGENTE: '#ef4444', ALTA: '#ff9800', MEDIA: '#FFCC00', BAIXA: '#4caf50' };
const STATUS_COLORS = { ABERTO: '#00A0DF', EM_ANDAMENTO: '#ff9800', ANDAMENTO: '#ff9800', PARALISADO: '#ef4444', FINALIZADO: '#4caf50', ATRASADO: '#ef4444' };

export default function ProjetosList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('lista'); // lista | kanban
  const [showFilters, setShowFilters] = useState(false);
  const [showOverview, setShowOverview] = useState(true);
  const [filters, setFilters] = useState({ search: '', status: '', prioridade: '', por: 'T' });
  // Modal criar (pg 203)
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    titulo: '', descricao: '', objetivo: '', prioridade: 'MEDIA',
    dt_prev_termino: '', dt_inicio: '', codigo: '', vlr_orc: '',
    responsavel_id: '', hgr_prj_cad_cat_id: '',
    sth_cad_empresa_id: '', sth_cad_filial_id: '', beg_processo_id: '',
    status: 'ABERTO',
  });
  const [saving, setSaving] = useState(false);
  // LOVs
  const [categorias, setCategorias] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [filiais, setFiliais] = useState([]);
  const [processos, setProcessos] = useState([]);

  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => { fetchData(); }, [page, filters, view]);

  // Cascading: empresa → filiais
  useEffect(() => {
    if (!form.sth_cad_empresa_id) { setFiliais([]); return; }
    lovService.filiais({ empresa_id: form.sth_cad_empresa_id })
      .then(r => setFiliais(r.data.items || r.data || []))
      .catch(() => setFiliais([]));
  }, [form.sth_cad_empresa_id]);
  useEffect(() => {
    projetoService.categorias().then(r => setCategorias(r.data.items || [])).catch(() => {});
    lovService.usuarios({ per_page: 500 }).then(r => setUsuarios(r.data.items || r.data || [])).catch(() => {});
    lovService.empresas().then(r => setEmpresas(r.data.items || r.data || [])).catch(() => {});
    lovService.processos().then(r => setProcessos(r.data.items || r.data || [])).catch(() => {});
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = { page, per_page: 50 };
      if (filters.status) params.status = filters.status;
      const { data } = await projetoService.listar(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { toast.error('Erro ao carregar projetos'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.titulo.trim()) { toast.error('Título obrigatório'); return; }
    setSaving(true);
    try {
      // Limpar campos vazios e converter IDs para número
      const payload = {};
      Object.entries(form).forEach(([k, v]) => {
        if (v === '' || v == null) return;
        if (['responsavel_id', 'hgr_prj_cad_cat_id', 'sth_cad_empresa_id',
             'sth_cad_filial_id', 'beg_processo_id'].includes(k)) {
          payload[k] = Number(v);
        } else if (k === 'vlr_orc') {
          payload[k] = Number(v);
        } else {
          payload[k] = v;
        }
      });
      const res = await projetoService.criar(payload);
      toast.success('Projeto criado');
      setModalOpen(false);
      setForm({
        titulo: '', descricao: '', objetivo: '', prioridade: 'MEDIA',
        dt_prev_termino: '', dt_inicio: '', codigo: '', vlr_orc: '',
        responsavel_id: '', hgr_prj_cad_cat_id: '',
        sth_cad_empresa_id: '', sth_cad_filial_id: '', beg_processo_id: '',
        status: 'ABERTO',
      });
      if (res.data?.id) navigate(`/projetos/${res.data.id}`);
      else fetchData();
    } catch (err) {
      const msg = err.response?.data?.detail || 'Erro ao criar projeto';
      toast.error(typeof msg === 'string' ? msg : 'Erro ao criar projeto');
    }
    finally { setSaving(false); }
  };

  // Map Oracle status codes
  const mapStatus = (s) => {
    if (!s) return 'ABERTO';
    const m = { A: 'ABERTO', F: 'FINALIZADO', P: 'PARALISADO', C: 'CANCELADO', E: 'EM_ANDAMENTO' };
    return m[s] || s;
  };

  // Overview stats (APEX pg 134 rgnOverview)
  const stats = {
    total: items.length,
    andamento: items.filter(p => ['ABERTO', 'EM_ANDAMENTO', 'A', 'E'].includes(p.status)).length,
    finalizados: items.filter(p => ['FINALIZADO', 'F'].includes(p.status)).length,
    paralisados: items.filter(p => ['PARALISADO', 'P'].includes(p.status)).length,
    atrasados: items.filter(p => p.dt_prev_termino && new Date(p.dt_prev_termino) < new Date() && !['FINALIZADO', 'CANCELADO', 'F', 'C'].includes(p.status)).length,
  };

  // Filtro local
  const filtered = items.filter(p => {
    if (filters.search && !(`${p.titulo} ${p.codigo || ''} ${p.responsavel_nome || ''}`).toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.prioridade && p.prioridade !== filters.prioridade) return false;
    return true;
  });

  return (
    <div className="tarefas-page">
      {/* Header — APEX rgnHeader */}
      <div className="tarefas-header">
        <h1>Projetos</h1>
        <div className="tarefas-actions">
          <button className="btn-secondary" onClick={() => setShowOverview(v => !v)}>{showOverview ? 'Ocultar Resumo' : 'Resumo'}</button>
          <button className="btn-primary" onClick={() => setModalOpen(true)}>+ Novo Projeto</button>
        </div>
      </div>

      {/* Search sempre visível */}
      <div className="tarefas-filters">
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, maxWidth: 360 }}>
          <span style={{ position: 'absolute', left: 8, color: 'var(--text-muted)', display: 'flex', pointerEvents: 'none' }}>
            <Icon width={14} height={14}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>
          </span>
          <input
            style={{ flex: 1, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '6px 10px 6px 30px', fontSize: '0.82rem' }}
            placeholder="Pesquisar projetos..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          />
        </div>
        <select value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}
          style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '6px 10px', fontSize: '0.82rem' }}>
          <option value="">Todos os status</option>
          <option value="ABERTO">Aberto</option>
          <option value="EM_ANDAMENTO">Em andamento</option>
          <option value="PARALISADO">Paralisado</option>
          <option value="FINALIZADO">Finalizado</option>
        </select>
        <select value={filters.prioridade} onChange={e => setFilters(f => ({ ...f, prioridade: e.target.value }))}
          style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '6px 10px', fontSize: '0.82rem' }}>
          <option value="">Todas prioridades</option>
          <option value="URGENTE">Urgente</option>
          <option value="ALTA">Alta</option>
          <option value="MEDIA">Média</option>
          <option value="BAIXA">Baixa</option>
        </select>
      </div>

      {/* Overview — APEX rgnOverview (totais + gráfico status) */}
      {showOverview && !loading && (
        <div className="detail-cards" style={{ marginBottom: 24 }}>
          <div className="detail-card"><div className="dc-label">Total</div><div className="dc-value" style={{ fontSize: '1.5rem' }}>{stats.total}</div></div>
          <div className="detail-card" style={{ borderLeft: '3px solid #ff9800' }}><div className="dc-label">Em Andamento</div><div className="dc-value" style={{ fontSize: '1.5rem', color: '#ff9800' }}>{stats.andamento}</div></div>
          <div className="detail-card" style={{ borderLeft: '3px solid #4caf50' }}><div className="dc-label">Finalizados</div><div className="dc-value" style={{ fontSize: '1.5rem', color: '#4caf50' }}>{stats.finalizados}</div></div>
          <div className="detail-card" style={{ borderLeft: '3px solid #ef4444' }}><div className="dc-label">Paralisados</div><div className="dc-value" style={{ fontSize: '1.5rem', color: '#ef4444' }}>{stats.paralisados}</div></div>
          <div className="detail-card" style={{ borderLeft: '3px solid #ef4444' }}><div className="dc-label">Atrasados</div><div className="dc-value" style={{ fontSize: '1.5rem', color: '#ef4444' }}>{stats.atrasados}</div></div>
        </div>
      )}

      {/* Lista — APEX rgnLista (ContentRow template) */}
      {loading ? (
        <table className="data-table">
          <thead><tr><th style={{ width: 6 }}></th><th>Código</th><th>Título</th><th>Categoria</th><th>Responsável</th><th>Início</th><th>Previsão</th><th>Status</th><th>Prioridade</th></tr></thead>
          <tbody><SkeletonSimpleTable rows={7} cols={[6, 70, '35%', 100, 120, 80, 80, 90, 70]} /></tbody>
        </table>
      ) : view === 'lista' ? (
        filtered.length === 0 ? <div className="empty-state">Nenhum projeto encontrado</div> : (
          <table className="data-table">
            <thead><tr>
              <th style={{ width: 6 }}></th>
              <th>Código</th><th>Título</th><th>Categoria</th>
              <th>Responsável</th><th>Início</th><th>Previsão</th><th>Status</th><th>Prioridade</th>
            </tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/projetos/${p.id}`)}>
                  <td><span style={{ display: 'inline-block', width: 6, height: '100%', minHeight: 20, borderRadius: 3, background: PRIORIDADE_COLORS[p.prioridade] || '#6b7280' }} /></td>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{p.codigo || `#${p.id}`}</td>
                  <td style={{ fontWeight: 600 }}>{p.titulo}</td>
                  <td>{p.categoria || '—'}</td>
                  <td>{p.responsavel_nome || '—'}</td>
                  <td>{p.dt_inicio ? new Date(p.dt_inicio).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>{p.dt_prev_termino ? new Date(p.dt_prev_termino).toLocaleDateString('pt-BR') : '—'}</td>
                  <td><StatusBadge status={mapStatus(p.status)} /></td>
                  <td>{p.prioridade && <span className={`prioridade-badge ${(p.prioridade || '').toLowerCase()}`}>{p.prioridade}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        /* Kanban — APEX pg 134 */
        <div className="empty-state">Kanban de projetos (em desenvolvimento)</div>
      )}

      {total > 50 && view === 'lista' && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <span style={{ padding: '6px 12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Página {page} de {Math.ceil(total / 50)}</span>
          <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(p => p + 1)}>Próxima</button>
        </div>
      )}

      {/* Modal Criar Projeto — APEX pg 203 (MODAL) */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Projeto" size="large"
        footer={<><button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button><button className="btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Salvando...' : 'Criar'}</button></>}>
        {/* Identificação */}
        <div className="form-group"><label>Título *</label><input className="form-control" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Nome do projeto" /></div>
        <div className="form-row">
          <div className="form-group"><label>Código</label><input className="form-control" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Ex: PRJ-2026-001" /></div>
          <div className="form-group"><label>Status</label>
            <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="ABERTO">Aberto</option>
              <option value="EM_ANDAMENTO">Em andamento</option>
              <option value="PARALISADO">Paralisado</option>
              <option value="FINALIZADO">Finalizado</option>
            </select>
          </div>
          <div className="form-group"><label>Prioridade</label>
            <select className="form-control" value={form.prioridade} onChange={e => setForm(f => ({ ...f, prioridade: e.target.value }))}>
              <option value="URGENTE">Urgente</option><option value="ALTA">Alta</option>
              <option value="MEDIA">Média</option><option value="BAIXA">Baixa</option>
            </select>
          </div>
        </div>

        {/* Descrições */}
        <div className="form-group"><label>Descrição</label><textarea className="form-control" rows={2} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} /></div>
        <div className="form-group"><label>Objetivo</label><textarea className="form-control" rows={2} value={form.objetivo} onChange={e => setForm(f => ({ ...f, objetivo: e.target.value }))} /></div>

        {/* Organização — Empresa/Filial/Processo */}
        <div className="form-row">
          <div className="form-group"><label>Empresa</label>
            <select className="form-control" value={form.sth_cad_empresa_id || ''}
              onChange={e => setForm(f => ({ ...f, sth_cad_empresa_id: e.target.value, sth_cad_filial_id: '' }))}>
              <option value="">Selecione...</option>
              {empresas.map(x => <option key={x.id} value={x.id}>{x.descricao || x.nome}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Filial</label>
            <select className="form-control" value={form.sth_cad_filial_id || ''}
              onChange={e => setForm(f => ({ ...f, sth_cad_filial_id: e.target.value }))}
              disabled={!form.sth_cad_empresa_id}>
              <option value="">{form.sth_cad_empresa_id ? 'Selecione...' : 'Escolha empresa primeiro'}</option>
              {filiais.map(x => <option key={x.id} value={x.id}>{x.descricao || x.nome}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Processo</label>
            <select className="form-control" value={form.beg_processo_id || ''}
              onChange={e => setForm(f => ({ ...f, beg_processo_id: e.target.value }))}>
              <option value="">Selecione...</option>
              {processos.map(x => <option key={x.id} value={x.id}>{x.descricao || x.nome}</option>)}
            </select>
          </div>
        </div>

        {/* Responsável + Categoria */}
        <div className="form-row">
          <div className="form-group"><label>Responsável</label>
            <select className="form-control" value={form.responsavel_id || ''}
              onChange={e => setForm(f => ({ ...f, responsavel_id: e.target.value }))}>
              <option value="">Selecione...</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome || u.login || u.descricao}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Categoria</label>
            <select className="form-control" value={form.hgr_prj_cad_cat_id || ''} onChange={e => setForm(f => ({ ...f, hgr_prj_cad_cat_id: e.target.value || '' }))}>
              <option value="">Selecione...</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
            </select>
          </div>
        </div>

        {/* Datas + Financeiro */}
        <div className="form-row">
          <div className="form-group"><label>Data Início</label><input type="date" className="form-control" value={form.dt_inicio} onChange={e => setForm(f => ({ ...f, dt_inicio: e.target.value }))} /></div>
          <div className="form-group"><label>Previsão de Término</label><input type="date" className="form-control" value={form.dt_prev_termino} onChange={e => setForm(f => ({ ...f, dt_prev_termino: e.target.value }))} /></div>
          <div className="form-group"><label>Valor Orçado (R$)</label><input type="number" step="0.01" min="0" className="form-control" value={form.vlr_orc} onChange={e => setForm(f => ({ ...f, vlr_orc: e.target.value }))} placeholder="0,00" /></div>
        </div>
      </Modal>
    </div>
  );
}

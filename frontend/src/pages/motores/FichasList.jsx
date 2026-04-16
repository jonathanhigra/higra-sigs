/**
 * FichasList — lista de fichas técnicas motor+bomba.
 * Route: /motores/fichas
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { motorService } from '../../services/motores/motorService';
import Modal from '../../components/Modal';
import { SkeletonSimpleTable } from '../../components/SkeletonPlanos';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

const PER_PAGE = 20;

export default function FichasList() {
  const navigate = useNavigate();
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ descricao: '', motor_id: '', bomba_id: '', dados_tecnicos: '' });

  const [motores, setMotores] = useState([]);
  const [bombas, setBombas] = useState([]);

  useEffect(() => { loadFichas(); }, [page, q]);

  useEffect(() => {
    motorService.listarMotores({ per_page: 200 }).then(({ data }) => setMotores(data.items || [])).catch(() => {});
    motorService.listarBombas({ per_page: 200 }).then(({ data }) => setBombas(data.items || [])).catch(() => {});
  }, []);

  const loadFichas = async () => {
    setLoading(true);
    try {
      const { data } = await motorService.listarFichas({ page, per_page: PER_PAGE, q });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Erro ao carregar fichas técnicas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    if (saving) return;
    setSaving(true);
    try {
      let dados = {};
      if (form.dados_tecnicos.trim()) {
        try { dados = JSON.parse(form.dados_tecnicos); } catch { toast.error('JSON inválido em Dados Técnicos'); setSaving(false); return; }
      }
      await motorService.criarFicha({ ...form, dados_tecnicos: dados });
      toast.success('Ficha criada');
      setModalOpen(false);
      setForm({ descricao: '', motor_id: '', bomba_id: '', dados_tecnicos: '' });
      loadFichas();
    } catch {
      toast.error('Erro ao criar ficha');
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Fichas Técnicas</h1>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>+ Nova Ficha</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          className="form-control"
          style={{ maxWidth: 360 }}
          placeholder="Buscar fichas..."
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
        />
      </div>

      {loading ? (
        <table className="data-table">
          <thead><tr><th>#</th><th>Descrição</th><th>Motor</th><th>Bomba</th><th>Criada em</th></tr></thead>
          <tbody><SkeletonSimpleTable rows={6} cols={[40, '35%', '20%', '20%', 100]} /></tbody>
        </table>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhuma ficha encontrada</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Descrição</th>
              <th>Motor</th>
              <th>Bomba</th>
              <th>Criada em</th>
            </tr>
          </thead>
          <tbody>
            {items.map(f => (
              <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/motores/fichas/${f.id}`)}>
                <td style={{ fontWeight: 600 }}>{f.id}</td>
                <td>{f.descricao}</td>
                <td>{f.motor_descricao || '—'}</td>
                <td>{f.bomba_descricao || '—'}</td>
                <td>{f.created_at ? new Date(f.created_at).toLocaleDateString('pt-BR') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>Página {page} de {totalPages}</span>
          <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</button>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova Ficha Técnica"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleCreate}>{saving ? 'Salvando...' : 'Criar'}</button>
          </>
        }
      >
        <div className="form-group">
          <label>Descrição *</label>
          <input className="form-control" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Motor</label>
            <select className="form-control" value={form.motor_id} onChange={e => setForm(f => ({ ...f, motor_id: e.target.value }))}>
              <option value="">— Selecione —</option>
              {motores.map(m => <option key={m.id} value={m.id}>{m.descricao}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Bomba</label>
            <select className="form-control" value={form.bomba_id} onChange={e => setForm(f => ({ ...f, bomba_id: e.target.value }))}>
              <option value="">— Selecione —</option>
              {bombas.map(b => <option key={b.id} value={b.id}>{b.descricao}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Dados Técnicos (JSON)</label>
          <textarea
            className="form-control"
            rows={5}
            style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
            placeholder={'{\n  "chave": "valor"\n}'}
            value={form.dados_tecnicos}
            onChange={e => setForm(f => ({ ...f, dados_tecnicos: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}

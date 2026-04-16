import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';

const TIPOS = ['COMPONENTE', 'MATERIA_PRIMA', 'SERVICO'];
const TIPO_LABELS = { COMPONENTE: 'Componente', MATERIA_PRIMA: 'Matéria-Prima', SERVICO: 'Serviço' };

export default function FornecedorFabList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nome: '', cnpj: '', tipo: '' });
  const perPage = 20;

  const load = async (p = page) => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/fabricacao/cadastros/fornecedor', { params: { page: p, per_page: perPage } });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch { toast.error('Erro ao carregar'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(page); }, [page]);

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }
    try {
      await api.post('/api/fabricacao/cadastros/fornecedor', { ...form });
      toast.success('Fornecedor criado'); setModal(false); setForm({ nome: '', cnpj: '', tipo: '' }); load(page);
    } catch { toast.error('Erro ao salvar'); }
  };

  const toggleAtivo = async (item) => {
    try { await api.put(`/api/fabricacao/cadastros/fornecedor/${item.id}`, { ativo: item.ativo === 'S' ? 'N' : 'S' }); load(page); }
    catch { toast.error('Erro'); }
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const startIdx = (page - 1) * perPage + 1;
  const endIdx = Math.min(page * perPage, total);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Fornecedores</h1>
        <button className="btn-primary" onClick={() => setModal(true)}>+ Novo</button>
      </div>
      {loading ? <p>Carregando...</p> : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border-primary)', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Nome</th>
              <th style={{ padding: '8px 12px' }}>CNPJ</th>
              <th style={{ padding: '8px 12px' }}>Tipo</th>
              <th style={{ padding: '8px 12px' }}>Ativo</th>
            </tr></thead>
            <tbody>{items.map(i => (
              <tr key={i.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <td style={{ padding: '8px 12px' }}>{i.nome}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{i.cnpj || '—'}</td>
                <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{TIPO_LABELS[i.tipo] || i.tipo || '—'}</td>
                <td style={{ padding: '8px 12px' }}>
                  <button onClick={() => toggleAtivo(i)} style={{ padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: i.ativo === 'S' ? '#dcfce7' : '#fee2e2', color: i.ativo === 'S' ? '#166534' : '#991b1b' }}>
                    {i.ativo === 'S' ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {total > perPage && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>{startIdx}–{endIdx} de {total} registros</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => setPage(p => p - 1)} disabled={page <= 1} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>◀</button>
                <span>Página {page} de {totalPages}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}>▶</button>
              </div>
            </div>
          )}
        </>
      )}
      <Modal open={modal} onClose={() => setModal(false)} title="Novo Fornecedor"
        footer={<><button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary" onClick={handleSave}>Salvar</button></>}>
        <div className="form-group"><label>Nome *</label><input className="form-control" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} /></div>
        <div className="form-group"><label>CNPJ</label><input className="form-control" placeholder="ex: 00.000.000/0001-00" value={form.cnpj} onChange={e => setForm(f => ({...f, cnpj: e.target.value}))} /></div>
        <div className="form-group">
          <label>Tipo</label>
          <select className="form-control" value={form.tipo} onChange={e => setForm(f => ({...f, tipo: e.target.value}))}>
            <option value="">— Selecione —</option>
            {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABELS[t]}</option>)}
          </select>
        </div>
      </Modal>
    </div>
  );
}

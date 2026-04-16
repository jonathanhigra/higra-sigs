import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';

export default function CorTintaList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nome: '', codigo_ral: '', nome_comercial: '', fornecedor: '', hex_color: '#cccccc' });

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/fabricacao/cadastros/cor-tinta'); setItems(data); }
    catch { toast.error('Erro ao carregar'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }
    try {
      await api.post('/api/fabricacao/cadastros/cor-tinta', form);
      toast.success('Cor criada'); setModal(false); setForm({ nome: '', codigo_ral: '', nome_comercial: '', fornecedor: '', hex_color: '#cccccc' }); load();
    } catch { toast.error('Erro ao salvar'); }
  };

  const toggleAtivo = async (item) => {
    try { await api.put(`/api/fabricacao/cadastros/cor-tinta/${item.id}`, { ativo: item.ativo === 'S' ? 'N' : 'S' }); load(); }
    catch { toast.error('Erro'); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Cor de Tinta</h1>
        <button className="btn-primary" onClick={() => setModal(true)}>+ Nova</button>
      </div>
      {loading ? <p>Carregando...</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ borderBottom: '2px solid var(--border-primary)', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>Cor</th>
            <th style={{ padding: '8px 12px' }}>Nome</th>
            <th style={{ padding: '8px 12px' }}>RAL</th>
            <th style={{ padding: '8px 12px' }}>Nome Comercial</th>
            <th style={{ padding: '8px 12px' }}>Fornecedor</th>
            <th style={{ padding: '8px 12px' }}>Ativo</th>
          </tr></thead>
          <tbody>{items.map(i => (
            <tr key={i.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
              <td style={{ padding: '8px 12px' }}>
                {i.hex_color && (
                  <div style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: i.hex_color, border: '1px solid var(--border-primary)', display: 'inline-block', verticalAlign: 'middle' }} title={i.hex_color} />
                )}
              </td>
              <td style={{ padding: '8px 12px' }}>{i.nome}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{i.codigo_ral || '—'}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{i.nome_comercial || '—'}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{i.fornecedor || '—'}</td>
              <td style={{ padding: '8px 12px' }}>
                <button onClick={() => toggleAtivo(i)} style={{ padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: i.ativo === 'S' ? '#dcfce7' : '#fee2e2', color: i.ativo === 'S' ? '#166534' : '#991b1b' }}>
                  {i.ativo === 'S' ? 'Ativo' : 'Inativo'}
                </button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={modal} onClose={() => setModal(false)} title="Nova Cor de Tinta"
        footer={<><button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary" onClick={handleSave}>Salvar</button></>}>
        <div className="form-group"><label>Nome *</label><input className="form-control" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} /></div>
        <div className="form-group"><label>Código RAL</label><input className="form-control" placeholder="ex: RAL 5010" value={form.codigo_ral} onChange={e => setForm(f => ({...f, codigo_ral: e.target.value}))} /></div>
        <div className="form-group"><label>Nome Comercial</label><input className="form-control" placeholder="ex: Azul Genciana" value={form.nome_comercial} onChange={e => setForm(f => ({...f, nome_comercial: e.target.value}))} /></div>
        <div className="form-group"><label>Fornecedor</label><input className="form-control" placeholder="ex: Sherwin-Williams" value={form.fornecedor} onChange={e => setForm(f => ({...f, fornecedor: e.target.value}))} /></div>
        <div className="form-group">
          <label>Cor (hex)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="color" value={form.hex_color} onChange={e => setForm(f => ({...f, hex_color: e.target.value}))}
              style={{ width: 40, height: 36, padding: 2, border: '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer' }} />
            <input className="form-control" value={form.hex_color} onChange={e => setForm(f => ({...f, hex_color: e.target.value}))}
              placeholder="#rrggbb" style={{ flex: 1 }} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

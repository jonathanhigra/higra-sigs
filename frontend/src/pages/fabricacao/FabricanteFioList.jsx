import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';

export default function FabricanteFioList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nome: '', cnpj: '' });

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/fabricacao/cadastros/fabricante-fio'); setItems(data); }
    catch { toast.error('Erro ao carregar'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }
    try {
      await api.post('/api/fabricacao/cadastros/fabricante-fio', form);
      toast.success('Fabricante criado'); setModal(false); setForm({ nome: '', cnpj: '' }); load();
    } catch { toast.error('Erro ao salvar'); }
  };

  const toggleAtivo = async (item) => {
    try { await api.put(`/api/fabricacao/cadastros/fabricante-fio/${item.id}`, { ativo: item.ativo === 'S' ? 'N' : 'S' }); load(); }
    catch { toast.error('Erro'); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Fabricante de Fio</h1>
        <button className="btn-primary" onClick={() => setModal(true)}>+ Novo</button>
      </div>
      {loading ? <p>Carregando...</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ borderBottom: '2px solid var(--border-primary)', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>Nome</th>
            <th style={{ padding: '8px 12px' }}>CNPJ</th>
            <th style={{ padding: '8px 12px' }}>Ativo</th>
          </tr></thead>
          <tbody>{items.map(i => (
            <tr key={i.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
              <td style={{ padding: '8px 12px' }}>{i.nome}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{i.cnpj || '—'}</td>
              <td style={{ padding: '8px 12px' }}>
                <button onClick={() => toggleAtivo(i)} style={{ padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: i.ativo === 'S' ? '#dcfce7' : '#fee2e2', color: i.ativo === 'S' ? '#166534' : '#991b1b' }}>
                  {i.ativo === 'S' ? 'Ativo' : 'Inativo'}
                </button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={modal} onClose={() => setModal(false)} title="Novo Fabricante de Fio"
        footer={<><button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary" onClick={handleSave}>Salvar</button></>}>
        <div className="form-group"><label>Nome *</label><input className="form-control" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} /></div>
        <div className="form-group"><label>CNPJ</label><input className="form-control" placeholder="ex: 00.000.000/0001-00" value={form.cnpj} onChange={e => setForm(f => ({...f, cnpj: e.target.value}))} /></div>
      </Modal>
    </div>
  );
}

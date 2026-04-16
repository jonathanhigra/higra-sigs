import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';

export default function BitolaFioList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ descricao: '', awg: '', mm2: '' });

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/fabricacao/cadastros/bitola-fio'); setItems(data); }
    catch { toast.error('Erro ao carregar'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    try {
      await api.post('/api/fabricacao/cadastros/bitola-fio', { ...form, mm2: form.mm2 ? parseFloat(form.mm2) : null });
      toast.success('Bitola criada'); setModal(false); setForm({ descricao: '', awg: '', mm2: '' }); load();
    } catch { toast.error('Erro ao salvar'); }
  };

  const toggleAtivo = async (item) => {
    try { await api.put(`/api/fabricacao/cadastros/bitola-fio/${item.id}`, { ativo: item.ativo === 'S' ? 'N' : 'S' }); load(); }
    catch { toast.error('Erro'); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Bitola de Fio</h1>
        <button className="btn-primary" onClick={() => setModal(true)}>+ Nova</button>
      </div>
      {loading ? <p>Carregando...</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ borderBottom: '2px solid var(--border-primary)', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>Descrição</th>
            <th style={{ padding: '8px 12px' }}>AWG</th>
            <th style={{ padding: '8px 12px' }}>mm²</th>
            <th style={{ padding: '8px 12px' }}>Ativo</th>
          </tr></thead>
          <tbody>{items.map(i => (
            <tr key={i.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
              <td style={{ padding: '8px 12px' }}>{i.descricao}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{i.awg || '—'}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{i.mm2 || '—'}</td>
              <td style={{ padding: '8px 12px' }}>
                <button onClick={() => toggleAtivo(i)} style={{ padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: i.ativo === 'S' ? '#dcfce7' : '#fee2e2', color: i.ativo === 'S' ? '#166534' : '#991b1b' }}>
                  {i.ativo === 'S' ? 'Ativo' : 'Inativo'}
                </button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={modal} onClose={() => setModal(false)} title="Nova Bitola de Fio"
        footer={<><button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary" onClick={handleSave}>Salvar</button></>}>
        <div className="form-group"><label>Descrição *</label><input className="form-control" value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} /></div>
        <div className="form-group"><label>AWG</label><input className="form-control" placeholder="ex: 18 AWG" value={form.awg} onChange={e => setForm(f => ({...f, awg: e.target.value}))} /></div>
        <div className="form-group"><label>mm²</label><input className="form-control" type="number" step="0.001" placeholder="ex: 0.823" value={form.mm2} onChange={e => setForm(f => ({...f, mm2: e.target.value}))} /></div>
      </Modal>
    </div>
  );
}

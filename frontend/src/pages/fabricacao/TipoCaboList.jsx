import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../../components/Modal.css';

export default function TipoCaboList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ descricao: '', secao_mm2: '', cor: '', comprimento_m: '' });

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/fabricacao/cadastros/tipo-cabo'); setItems(data); }
    catch { toast.error('Erro ao carregar'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    try {
      await api.post('/api/fabricacao/cadastros/tipo-cabo', {
        ...form,
        secao_mm2: form.secao_mm2 ? parseFloat(form.secao_mm2) : null,
        comprimento_m: form.comprimento_m ? parseFloat(form.comprimento_m) : null,
      });
      toast.success('Tipo de cabo criado'); setModal(false); setForm({ descricao: '', secao_mm2: '', cor: '', comprimento_m: '' }); load();
    } catch { toast.error('Erro ao salvar'); }
  };

  const toggleAtivo = async (item) => {
    try { await api.put(`/api/fabricacao/cadastros/tipo-cabo/${item.id}`, { ativo: item.ativo === 'S' ? 'N' : 'S' }); load(); }
    catch { toast.error('Erro'); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Tipo de Cabo</h1>
        <button className="btn-primary" onClick={() => setModal(true)}>+ Novo</button>
      </div>
      {loading ? <p>Carregando...</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr style={{ borderBottom: '2px solid var(--border-primary)', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>Descrição</th>
            <th style={{ padding: '8px 12px' }}>Seção (mm²)</th>
            <th style={{ padding: '8px 12px' }}>Cor</th>
            <th style={{ padding: '8px 12px' }}>Comprimento (m)</th>
            <th style={{ padding: '8px 12px' }}>Ativo</th>
          </tr></thead>
          <tbody>{items.map(i => (
            <tr key={i.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
              <td style={{ padding: '8px 12px' }}>{i.descricao}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{i.secao_mm2 ?? '—'}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{i.cor || '—'}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{i.comprimento_m ?? '—'}</td>
              <td style={{ padding: '8px 12px' }}>
                <button onClick={() => toggleAtivo(i)} style={{ padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: i.ativo === 'S' ? '#dcfce7' : '#fee2e2', color: i.ativo === 'S' ? '#166534' : '#991b1b' }}>
                  {i.ativo === 'S' ? 'Ativo' : 'Inativo'}
                </button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={modal} onClose={() => setModal(false)} title="Novo Tipo de Cabo"
        footer={<><button className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn-primary" onClick={handleSave}>Salvar</button></>}>
        <div className="form-group"><label>Descrição *</label><input className="form-control" value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} /></div>
        <div className="form-group"><label>Seção (mm²)</label><input className="form-control" type="number" step="0.01" placeholder="ex: 1.5" value={form.secao_mm2} onChange={e => setForm(f => ({...f, secao_mm2: e.target.value}))} /></div>
        <div className="form-group"><label>Cor</label><input className="form-control" placeholder="ex: Azul" value={form.cor} onChange={e => setForm(f => ({...f, cor: e.target.value}))} /></div>
        <div className="form-group"><label>Comprimento (m)</label><input className="form-control" type="number" step="0.1" placeholder="ex: 10" value={form.comprimento_m} onChange={e => setForm(f => ({...f, comprimento_m: e.target.value}))} /></div>
      </Modal>
    </div>
  );
}

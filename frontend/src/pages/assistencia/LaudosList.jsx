import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';
import SignatureCanvas from '../../components/SignatureCanvas';
import api from '../../lib/api';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

export default function LaudosList() {
  const [items, setItems] = useState([]);
  const page = 1;
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', descricao: '', tipo: '', cliente: '' });
  const [assinarModal, setAssinarModal] = useState(false);
  const [assinarLaudo, setAssinarLaudo] = useState(null);
  const [assinarNome, setAssinarNome] = useState('');
  const [assinarB64, setAssinarB64] = useState(null);
  const [savingAssinatura, setSavingAssinatura] = useState(false);
  const toast = useToast();

  useEffect(() => { fetchData(); }, []);
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/laudos', { params: { page, per_page: 20 } });
      setItems(data.items || []);
    } catch { toast.error('Erro'); } finally { setLoading(false); }
  };
  const handleCreate = async () => {
    if (!form.titulo.trim()) { toast.error('Título obrigatório'); return; }
    try { await api.post('/api/laudos', form); toast.success('Laudo criado'); setModalOpen(false); fetchData(); }
    catch { toast.error('Erro'); }
  };

  const abrirAssinar = (laudo) => {
    setAssinarLaudo(laudo);
    setAssinarNome(laudo.cliente || '');
    setAssinarB64(null);
    setAssinarModal(true);
  };

  const handleAssinar = async () => {
    if (!assinarB64) { toast.error('Adicione a assinatura antes de salvar'); return; }
    setSavingAssinatura(true);
    try {
      await api.post(`/api/laudos/${assinarLaudo.id}/assinar`, { assinatura: assinarB64, nome: assinarNome });
      toast.success('Assinatura salva');
      setAssinarModal(false);
      fetchData();
    } catch { toast.error('Erro ao salvar assinatura'); }
    finally { setSavingAssinatura(false); }
  };

  return (
    <div className="tarefas-page">
      <div className="tarefas-header"><h1>Laudos Técnicos</h1><button className="btn-primary" onClick={() => setModalOpen(true)}>+ Novo Laudo</button></div>
      {loading ? <div className="empty-state">Carregando...</div> : items.length === 0 ? <div className="empty-state">Nenhum laudo</div> : (
        <table className="data-table">
          <thead><tr><th>Título</th><th>Tipo</th><th>Cliente</th><th>Técnico</th><th>Status</th><th>Data</th><th>Assinatura</th><th></th></tr></thead>
          <tbody>{items.map(l => (
            <tr key={l.id}>
              <td style={{ fontWeight: 600 }}>{l.titulo}</td>
              <td>{l.tipo || '—'}</td>
              <td>{l.cliente || '—'}</td>
              <td>{l.tecnico_nome || '—'}</td>
              <td><span className={`status-badge ${(l.status||'').toLowerCase()}`}>{l.status}</span></td>
              <td>{l.dt_laudo ? new Date(l.dt_laudo).toLocaleDateString('pt-BR') : '—'}</td>
              <td>
                {l.assinatura_cliente
                  ? <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>✓ {l.assinatura_nome || 'Assinado'}</span>
                  : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pendente</span>}
              </td>
              <td>
                <button
                  style={{ fontSize: '0.72rem', padding: '3px 9px', borderRadius: 5, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}
                  onClick={() => abrirAssinar(l)}
                >Assinar</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Laudo"
        footer={<><button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button><button className="btn-primary" onClick={handleCreate}>Criar</button></>}>
        <div className="form-group"><label>Título *</label><input className="form-control" value={form.titulo} onChange={e => setForm(f => ({...f, titulo: e.target.value}))} /></div>
        <div className="form-row">
          <div className="form-group"><label>Tipo</label><input className="form-control" value={form.tipo} onChange={e => setForm(f => ({...f, tipo: e.target.value}))} /></div>
          <div className="form-group"><label>Cliente</label><input className="form-control" value={form.cliente} onChange={e => setForm(f => ({...f, cliente: e.target.value}))} /></div>
        </div>
        <div className="form-group"><label>Descrição</label><textarea className="form-control" value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} /></div>
      </Modal>

      {/* Modal: Assinatura Digital (tarefa 252) */}
      <Modal
        open={assinarModal}
        onClose={() => setAssinarModal(false)}
        title={`Assinar Laudo — ${assinarLaudo?.titulo || ''}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAssinarModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleAssinar} disabled={savingAssinatura || !assinarB64}>
              {savingAssinatura ? 'Salvando...' : 'Confirmar Assinatura'}
            </button>
          </>
        }
      >
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Nome do signatário</label>
          <input className="form-control" value={assinarNome} onChange={e => setAssinarNome(e.target.value)} placeholder="Nome completo" />
        </div>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Assinatura digital</label>
        <SignatureCanvas
          onSave={b64 => setAssinarB64(b64)}
          onClear={() => setAssinarB64(null)}
          width={460}
          height={180}
          label="Assine aqui com o dedo ou mouse"
        />
        {assinarB64 && (
          <p style={{ fontSize: 12, color: '#22c55e', marginTop: 8 }}>Assinatura capturada — clique em "Confirmar Assinatura" para salvar.</p>
        )}
      </Modal>
    </div>
  );
}

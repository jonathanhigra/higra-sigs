/**
 * Motores / Engenharia — lista de motores, bombas, modelos
 * APEX pg 350, 355, 362, 356, 370
 */
import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { motorService } from '../../services/motores/motorService';
import Modal from '../../components/Modal';
import { SkeletonSimpleTable } from '../../components/SkeletonPlanos';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

export default function MotoresList() {
  const [tab, setTab] = useState('motores');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ descricao: '', codigo: '', potencia: '', tensao: '', carcaca: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { fetchData(); }, [tab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = tab === 'motores' ? await motorService.listarMotores() :
                        tab === 'bombas' ? await motorService.listarBombas() :
                        await motorService.modelos();
      setItems(data.items || []);
    } catch { toast.error(`Erro ao carregar ${tab}`); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    if (saving) return;
    setSaving(true);
    try {
      if (tab === 'motores') await motorService.criarMotor(form);
      else if (tab === 'bombas') await motorService.criarBomba(form);
      toast.success('Cadastrado com sucesso'); setModalOpen(false);
      setForm({ descricao: '', codigo: '', potencia: '', tensao: '', carcaca: '' }); fetchData();
    } catch { toast.error('Erro ao cadastrar'); }
    finally { setSaving(false); }
  };

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Motores / Engenharia</h1>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>+ Novo {tab === 'motores' ? 'Motor' : tab === 'bombas' ? 'Bomba' : 'Modelo'}</button>
      </div>
      <div className="detail-tabs" style={{ marginBottom: 16 }}>
        {[{k:'motores',l:'Motores'},{k:'bombas',l:'Bombas'},{k:'modelos',l:'Modelos'}].map(t =>
          <button key={t.k} className={tab === t.k ? 'active' : ''} onClick={() => setTab(t.k)}>{t.l}</button>
        )}
      </div>
      {loading ? (
        <table className="data-table">
          <thead><tr><th>Código</th><th>Descrição</th>{tab === 'motores' ? <><th>Potência</th><th>Tensão</th><th>Carcaça</th></> : <><th>Tipo</th><th>Vazão</th></>}<th>Modelo</th></tr></thead>
          <tbody><SkeletonSimpleTable rows={6} cols={[70, '35%', 80, 80, 80, 100]} /></tbody>
        </table>
      ) : items.length === 0 ? <div className="empty-state">Nenhum registro encontrado</div> : (
        <table className="data-table">
          <thead><tr><th>Código</th><th>Descrição</th>{tab === 'motores' && <><th>Potência</th><th>Tensão</th><th>Carcaça</th></>}{tab === 'bombas' && <><th>Tipo</th><th>Vazão</th></>}<th>Modelo</th></tr></thead>
          <tbody>{items.map(i => (
            <tr key={i.id}>
              <td style={{ fontWeight: 600 }}>{i.codigo || '—'}</td>
              <td>{i.descricao}</td>
              {tab === 'motores' && <><td>{i.potencia || '—'}</td><td>{i.tensao || '—'}</td><td>{i.carcaca || '—'}</td></>}
              {tab === 'bombas' && <><td>{i.tipo || '—'}</td><td>{i.vazao_nominal || '—'}</td></>}
              <td>{i.modelo_nome || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`Novo ${tab === 'motores' ? 'Motor' : tab === 'bombas' ? 'Bomba' : 'Modelo'}`}
        footer={<><button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button><button className="btn-primary" disabled={saving} onClick={handleCreate}>{saving ? 'Salvando...' : 'Criar'}</button></>}>
        <div className="form-group"><label>Descrição *</label><input className="form-control" value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} /></div>
        <div className="form-row">
          <div className="form-group"><label>Código</label><input className="form-control" value={form.codigo} onChange={e => setForm(f => ({...f, codigo: e.target.value}))} /></div>
          {tab === 'motores' && <div className="form-group"><label>Potência</label><input className="form-control" value={form.potencia} onChange={e => setForm(f => ({...f, potencia: e.target.value}))} /></div>}
        </div>
        {tab === 'motores' && <div className="form-row">
          <div className="form-group"><label>Tensão</label><input className="form-control" value={form.tensao} onChange={e => setForm(f => ({...f, tensao: e.target.value}))} /></div>
          <div className="form-group"><label>Carcaça</label><input className="form-control" value={form.carcaca} onChange={e => setForm(f => ({...f, carcaca: e.target.value}))} /></div>
        </div>}
      </Modal>
    </div>
  );
}

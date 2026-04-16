import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import Modal from '../../components/Modal';
import api from '../../lib/api';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

export default function AutorizadasList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ nome: '', cnpj: '', cidade: '', estado: '' });
  const [saving, setSaving] = useState(false);

  // Expanded row + tecnicos
  const [expandedId, setExpandedId] = useState(null);
  const [tecnicos, setTecnicos] = useState({});
  const [loadingTecnicos, setLoadingTecnicos] = useState(false);

  // Tecnico modal
  const [tecModal, setTecModal] = useState(false);
  const [tecAutorizadaId, setTecAutorizadaId] = useState(null);
  const [tecForm, setTecForm] = useState({ nome: '', especialidade: '', dt_validade_cert: '' });
  const [savingTec, setSavingTec] = useState(false);

  const toast = useToast();

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/laudos/autorizadas');
      setItems(data.items || data || []);
    } catch { toast.error('Erro ao carregar autorizadas'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }
    setSaving(true);
    try {
      await api.post('/api/laudos/autorizadas', form);
      toast.success('Autorizada criada');
      setModalOpen(false);
      setForm({ nome: '', cnpj: '', cidade: '', estado: '' });
      fetchData();
    } catch { toast.error('Erro ao criar'); }
    finally { setSaving(false); }
  };

  const handleRowClick = async (item) => {
    if (expandedId === item.id) { setExpandedId(null); return; }
    setExpandedId(item.id);
    if (tecnicos[item.id]) return;
    setLoadingTecnicos(true);
    try {
      const { data } = await api.get(`/api/laudos/autorizadas/${item.id}/tecnicos`);
      setTecnicos(prev => ({ ...prev, [item.id]: data.items || data || [] }));
    } catch { toast.error('Erro ao carregar técnicos'); }
    finally { setLoadingTecnicos(false); }
  };

  const openAddTecnico = (autorizadaId, e) => {
    e.stopPropagation();
    setTecAutorizadaId(autorizadaId);
    setTecForm({ nome: '', especialidade: '', dt_validade_cert: '' });
    setTecModal(true);
  };

  const handleAddTecnico = async () => {
    if (!tecForm.nome.trim()) { toast.error('Nome obrigatório'); return; }
    setSavingTec(true);
    try {
      await api.post(`/api/laudos/autorizadas/${tecAutorizadaId}/tecnicos`, tecForm);
      toast.success('Técnico adicionado');
      setTecModal(false);
      setTecnicos(prev => ({ ...prev, [tecAutorizadaId]: undefined }));
      // Reload tecnicos for this row
      const { data } = await api.get(`/api/laudos/autorizadas/${tecAutorizadaId}/tecnicos`);
      setTecnicos(prev => ({ ...prev, [tecAutorizadaId]: data.items || data || [] }));
    } catch { toast.error('Erro ao adicionar técnico'); }
    finally { setSavingTec(false); }
  };

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Autorizadas</h1>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>+ Nova Autorizada</button>
      </div>

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhuma autorizada cadastrada</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th><th>CNPJ</th><th>Cidade</th><th>Estado</th><th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <>
                <tr key={item.id} className="clickable"
                  onClick={() => handleRowClick(item)}
                  style={{ borderLeft: `3px solid ${item.ativo !== false ? '#22c55e' : '#6b7280'}` }}>
                  <td style={{ fontWeight: 600 }}>{item.nome}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{item.cnpj || '—'}</td>
                  <td>{item.cidade || '—'}</td>
                  <td>{item.estado || '—'}</td>
                  <td>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: item.ativo !== false ? '#22c55e' : '#6b7280' }}>
                      {item.ativo !== false ? 'Sim' : 'Não'}
                    </span>
                  </td>
                </tr>
                {expandedId === item.id && (
                  <tr key={`exp-${item.id}`}>
                    <td colSpan={5} style={{ background: 'var(--bg-secondary)', padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Técnicos</span>
                        <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '4px 12px' }}
                          onClick={(e) => openAddTecnico(item.id, e)}>+ Adicionar Técnico</button>
                      </div>
                      {loadingTecnicos && !tecnicos[item.id] ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Carregando...</div>
                      ) : (tecnicos[item.id] || []).length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Nenhum técnico cadastrado</div>
                      ) : (
                        <table className="data-table" style={{ marginBottom: 0 }}>
                          <thead><tr><th>Nome</th><th>Especialidade</th><th>Validade Cert.</th></tr></thead>
                          <tbody>
                            {(tecnicos[item.id] || []).map((t, idx) => (
                              <tr key={t.id || idx}>
                                <td style={{ fontWeight: 600 }}>{t.nome}</td>
                                <td>{t.especialidade || '—'}</td>
                                <td>{t.dt_validade_cert ? new Date(t.dt_validade_cert).toLocaleDateString('pt-BR') : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal: Nova Autorizada */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova Autorizada"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleCreate}>
              {saving ? 'Criando...' : 'Criar'}
            </button>
          </>
        }>
        <div className="form-group">
          <label>Nome *</label>
          <input className="form-control" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>CNPJ</label>
          <input className="form-control" value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
          <div className="form-group">
            <label>Cidade</label>
            <input className="form-control" value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Estado</label>
            <input className="form-control" style={{ width: 60 }} maxLength={2} value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value.toUpperCase() }))} placeholder="SP" />
          </div>
        </div>
      </Modal>

      {/* Modal: Adicionar Técnico */}
      <Modal open={tecModal} onClose={() => setTecModal(false)} title="Adicionar Técnico"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setTecModal(false)}>Cancelar</button>
            <button className="btn-primary" disabled={savingTec} onClick={handleAddTecnico}>
              {savingTec ? 'Salvando...' : 'Adicionar'}
            </button>
          </>
        }>
        <div className="form-group">
          <label>Nome *</label>
          <input className="form-control" value={tecForm.nome} onChange={e => setTecForm(f => ({ ...f, nome: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Especialidade</label>
          <input className="form-control" value={tecForm.especialidade} onChange={e => setTecForm(f => ({ ...f, especialidade: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>Validade do Certificado</label>
          <input className="form-control" type="date" value={tecForm.dt_validade_cert} onChange={e => setTecForm(f => ({ ...f, dt_validade_cert: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}

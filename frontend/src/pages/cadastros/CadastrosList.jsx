import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { empresaService } from '../../services/cadastros/empresaService';
import { filialService } from '../../services/cadastros/filialService';
import { processoService } from '../../services/cadastros/processoService';
import './CadastrosList.css';

const TABS = [
  { key: 'empresas', label: 'Empresas' },
  { key: 'filiais', label: 'Filiais' },
  { key: 'processos', label: 'Processos' },
];

export default function CadastrosList() {
  const [tab, setTab] = useState('empresas');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [newCnpj, setNewCnpj] = useState('');
  const [empresas, setEmpresas] = useState([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState('');
  const [editId, setEditId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const toast = useToast();

  useEffect(() => { fetchData(); }, [tab]);

  useEffect(() => {
    if (tab === 'filiais') {
      empresaService.listar({ per_page: 100 }).then(({ data }) => setEmpresas(data.items || [])).catch(() => {});
    }
  }, [tab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const service = tab === 'empresas' ? empresaService : tab === 'filiais' ? filialService : processoService;
      const { data } = await service.listar({ per_page: 100 });
      setItems(data.items || []);
    } catch {
      toast.error('Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newItem.trim()) return;
    try {
      if (tab === 'empresas') {
        await empresaService.criar({ descricao: newItem, cnpj: newCnpj });
      } else if (tab === 'filiais') {
        await filialService.criar({ descricao: newItem, sth_cad_empresa_id: selectedEmpresa ? Number(selectedEmpresa) : null });
      } else {
        await processoService.criar({ nome: newItem });
      }
      toast.success('Cadastrado com sucesso');
      setNewItem('');
      setNewCnpj('');
      fetchData();
    } catch {
      toast.error('Erro ao cadastrar');
    }
  };

  const handleSaveEdit = async (item) => {
    try {
      const service = tab === 'empresas' ? empresaService : tab === 'filiais' ? filialService : processoService;
      const payload = tab === 'processos' ? { nome: editValue } : { descricao: editValue };
      await service.atualizar(item.id, payload);
      toast.success('Atualizado');
      setEditId(null);
      fetchData();
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const getDisplayName = (item) => tab === 'processos' ? item.nome : item.descricao;

  return (
    <div className="cadastros-page">
      <h1>Cadastros</h1>

      <div className="cadastros-tabs">
        {TABS.map(t => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => { setTab(t.key); setEditId(null); }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="cadastro-form-inline">
        <input
          type="text"
          placeholder={tab === 'processos' ? 'Nome do processo' : `Nome da ${tab.slice(0, -1)}`}
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        {tab === 'empresas' && (
          <input type="text" placeholder="CNPJ" value={newCnpj} onChange={e => setNewCnpj(e.target.value)} style={{ maxWidth: 180 }} />
        )}
        {tab === 'filiais' && (
          <select value={selectedEmpresa} onChange={e => setSelectedEmpresa(e.target.value)} style={{ minWidth: 180 }}>
            <option value="">Empresa...</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.descricao}</option>)}
          </select>
        )}
        <button className="btn-primary" onClick={handleAdd}>Adicionar</button>
      </div>

      {loading ? (
        <div className="empty-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhum registro</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{tab === 'processos' ? 'Nome' : 'Descrição'}</th>
              {tab === 'empresas' && <th>CNPJ</th>}
              {tab === 'filiais' && <th>Empresa</th>}
              <th>Ativo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>
                  {editId === item.id ? (
                    <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveEdit(item)}
                      autoFocus
                      style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--accent)', borderRadius: 4, padding: '4px 8px', width: '100%' }} />
                  ) : (
                    getDisplayName(item)
                  )}
                </td>
                {tab === 'empresas' && <td>{item.cnpj || '—'}</td>}
                {tab === 'filiais' && <td>{item.empresa_descricao || '—'}</td>}
                <td>{item.ativo === 'S' ? '✓' : '✗'}</td>
                <td>
                  {editId === item.id ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleSaveEdit(item)}>Salvar</button>
                      <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => setEditId(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => { setEditId(item.id); setEditValue(getDisplayName(item)); }}>
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

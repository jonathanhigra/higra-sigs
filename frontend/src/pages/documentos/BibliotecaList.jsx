import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import api from '../../lib/api';
import { SkeletonSimpleTable } from '../../components/SkeletonPlanos';
import '../tarefas/TarefasList.css';

export default function BibliotecaList() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const toast = useToast();

  useEffect(() => { fetchData(); }, [page, search]);
  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, per_page: 20 };
      if (search) params.search = search;
      const { data } = await api.get('/api/biblioteca', { params });
      setItems(data.items || []);
    } catch { toast.error('Erro ao carregar biblioteca'); } finally { setLoading(false); }
  };

  return (
    <div className="tarefas-page">
      <div className="tarefas-header"><h1>Biblioteca</h1></div>
      <div className="tarefas-filters">
        <input type="text" placeholder="Pesquisar documentos..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: 1, background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '6px 10px' }} />
      </div>
      {loading ? (
        <table className="data-table">
          <thead><tr><th>Código</th><th>Título</th><th>Tipo</th><th>Rev.</th><th>Responsável</th><th>Processo</th></tr></thead>
          <tbody><SkeletonSimpleTable rows={6} cols={[70, '35%', 90, 40, 120, 100]} /></tbody>
        </table>
      ) : items.length === 0 ? <div className="empty-state">Nenhum documento na biblioteca</div> : (
        <table className="data-table">
          <thead><tr><th>Código</th><th>Título</th><th>Tipo</th><th>Rev.</th><th>Responsável</th><th>Processo</th></tr></thead>
          <tbody>{items.map(d => (
            <tr key={d.id}><td style={{ fontWeight: 600, color: 'var(--accent)' }}>{d.codigo || '—'}</td><td>{d.titulo}</td>
              <td>{d.tipo || '—'}</td><td style={{ textAlign: 'center' }}>{d.revisao_atual || 1}</td>
              <td>{d.responsavel_nome || '—'}</td><td>{d.processo_nome || '—'}</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

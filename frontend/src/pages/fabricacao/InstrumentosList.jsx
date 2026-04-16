import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import '../../components/Modal.css';
import { useToast } from '../../contexts/ToastContext';
import useAuthStore from '../../stores/authStore';
import { checklistService } from '../../services/fabricacao/checklistService';
import '../tarefas/TarefasList.css';

const PER_PAGE = 20;

const INITIAL_FORM = {
  descricao: '',
  codigo: '',
  fabricante: '',
  modelo: '',
  nr_serie: '',
  dt_calibracao: '',
  dt_prox_calibracao: '',
  localizacao: '',
};

function formatDate(value) {
  if (!value) return '—';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';

  return parsed.toLocaleDateString('pt-BR');
}

function getStatusMeta(status, nextCalibrationDate) {
  const normalized = String(status ?? '').trim().toUpperCase();

  if (normalized && !['S', 'A', 'ATIVO', '1', 'TRUE'].includes(normalized)) {
    return { label: 'Inativo', color: '#991b1b', background: '#fee2e2' };
  }

  if (!nextCalibrationDate) {
    return { label: 'Sem agenda', color: '#475569', background: '#e2e8f0' };
  }

  const nextDate = new Date(nextCalibrationDate);
  if (Number.isNaN(nextDate.getTime())) {
    return { label: 'Sem agenda', color: '#475569', background: '#e2e8f0' };
  }

  const diffMs = nextDate.getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / 86400000);

  if (diffDays < 0) {
    return { label: 'Vencido', color: '#991b1b', background: '#fee2e2' };
  }

  if (diffDays <= 30) {
    return { label: 'A vencer', color: '#9a3412', background: '#ffedd5' };
  }

  return { label: 'Em dia', color: '#166534', background: '#dcfce7' };
}

export default function InstrumentosList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(INITIAL_FORM);
  const canManage = useAuthStore((s) => s.canWrite('CHKL'));
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const { data } = await checklistService.instrumentos({ page, per_page: PER_PAGE });

        if (!cancelled) {
          setItems(data.items || []);
          setTotal(data.total || 0);
        }
      } catch {
        if (!cancelled) {
          toast.error('Erro ao carregar instrumentos');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, toast]);

  const filtered = items.filter((item) => {
    const haystack = [
      item.codigo,
      item.descricao,
      item.nr_serie,
      item.localizacao,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(search.trim().toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const handleCreate = async () => {
    if (!form.descricao.trim()) {
      toast.error('Descricao do instrumento e obrigatoria');
      return;
    }

    try {
      setSaving(true);
      await checklistService.criarInstrumento(form);
      toast.success('Instrumento cadastrado');
      setModalOpen(false);
      setForm(INITIAL_FORM);
      setPage(1);

      const { data } = await checklistService.instrumentos({ page: 1, per_page: PER_PAGE });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      toast.error('Erro ao cadastrar instrumento');
    } finally {
      setSaving(false);
    }
  };

  const vencidos = items.filter(i => {
    if (!i.dt_prox_calibracao) return false;
    return new Date(i.dt_prox_calibracao) < new Date();
  });

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Instrumentos de Medicao</h1>
        <div className="tarefas-actions">
          {canManage && (
            <button className="btn-primary" type="button" onClick={() => setModalOpen(true)}>
              + Novo Instrumento
            </button>
          )}
        </div>
      </div>

      {vencidos.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: 8, padding: '8px 14px', marginBottom: 12,
          fontSize: '0.82rem', color: '#ef4444', fontWeight: 500,
        }}>
          <span>&#9888;</span>
          <strong>{vencidos.length}</strong>
          {` instrumento${vencidos.length > 1 ? 's' : ''} com calibração vencida`}
        </div>
      )}

      <div className="tarefas-filters">
        <input
          type="text"
          placeholder="Pesquisar por codigo, descricao, serie ou localizacao..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 260 }}
        />
        <button className="btn-secondary" type="button" disabled>
          {total} registros
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Carregando instrumentos...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">Nenhum instrumento encontrado.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Codigo</th>
              <th>Descricao</th>
              <th style={{ width: 150 }}>Serie</th>
              <th style={{ width: 140 }}>Ult. calibracao</th>
              <th style={{ width: 140 }}>Prox. calibracao</th>
              <th style={{ width: 180 }}>Localizacao</th>
              <th style={{ width: 120 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const status = getStatusMeta(item.status, item.dt_prox_calibracao);
              const isVencido = status.label === 'Vencido';
              const isAVencer = status.label === 'A vencer';

              return (
                <tr key={item.id} style={isVencido ? { background: 'rgba(239,68,68,0.07)' } : isAVencer ? { background: 'rgba(255,152,0,0.07)' } : {}}>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{item.codigo || `#${item.id}`}</td>
                  <td>{item.descricao || '—'}</td>
                  <td>{item.nr_serie || '—'}</td>
                  <td>{formatDate(item.dt_calibracao)}</td>
                  <td>
                    {isVencido && <span title="Calibração vencida!" style={{ color: '#ef4444', marginRight: 4 }}>&#9888;</span>}
                    {isAVencer && <span title="A vencer em breve" style={{ color: '#ff9800', marginRight: 4 }}>&#9203;</span>}
                    <span style={isVencido ? { color: '#ef4444', fontWeight: 600 } : isAVencer ? { color: '#ff9800' } : {}}>
                      {formatDate(item.dt_prox_calibracao)}
                    </span>
                  </td>
                  <td>{item.localizacao || '—'}</td>
                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: status.color,
                        background: status.background,
                      }}
                    >
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Anterior
          </button>
          <span style={{ padding: '6px 12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Pagina {page} de {totalPages}
          </span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
            Proxima
          </button>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo Instrumento"
        footer={(
          <>
            <button className="btn-secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancelar
            </button>
            <button className="btn-primary" type="button" onClick={handleCreate} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        )}
      >
        <div className="form-group">
          <label>Descricao *</label>
          <input
            className="form-control"
            value={form.descricao}
            onChange={(e) => setForm((current) => ({ ...current, descricao: e.target.value }))}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Codigo</label>
            <input
              className="form-control"
              value={form.codigo}
              onChange={(e) => setForm((current) => ({ ...current, codigo: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Numero de serie</label>
            <input
              className="form-control"
              value={form.nr_serie}
              onChange={(e) => setForm((current) => ({ ...current, nr_serie: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Fabricante</label>
            <input
              className="form-control"
              value={form.fabricante}
              onChange={(e) => setForm((current) => ({ ...current, fabricante: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Modelo</label>
            <input
              className="form-control"
              value={form.modelo}
              onChange={(e) => setForm((current) => ({ ...current, modelo: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Data calibracao</label>
            <input
              type="date"
              className="form-control"
              value={form.dt_calibracao}
              onChange={(e) => setForm((current) => ({ ...current, dt_calibracao: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Proxima calibracao</label>
            <input
              type="date"
              className="form-control"
              value={form.dt_prox_calibracao}
              onChange={(e) => setForm((current) => ({ ...current, dt_prox_calibracao: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Localizacao</label>
          <input
            className="form-control"
            value={form.localizacao}
            onChange={(e) => setForm((current) => ({ ...current, localizacao: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}

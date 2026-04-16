/**
 * Tarefa 279 — Avaliação de Eficácia (RQ49 fechadas pendentes)
 * Lista RQ49 com status FECHADA que ainda precisam de avaliação de eficácia.
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import api from '../../lib/api';
import Modal from '../../components/Modal';
import '../../components/Modal.css';
import '../planos_acao/PlanosList.css';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

const NOTA_OPTIONS = [1, 2, 3, 4, 5];

export default function AvaliacaoEficaciaList() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ avaliacao: '', nota: '', eficaz: '', acao_tomada: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/qualidade/rq49/dashboard');
      setItems(data.pendentes_avaliacao || []);
    } catch {
      toast.error('Erro ao carregar pendências de avaliação');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openModal = (item) => {
    setSelected(item);
    setForm({ avaliacao: '', nota: '', eficaz: '', acao_tomada: '' });
    setModalOpen(true);
  };

  const handleSalvar = async () => {
    if (!form.avaliacao.trim()) { toast.error('Avaliação obrigatória'); return; }
    if (!form.nota) { toast.error('Nota obrigatória'); return; }
    if (!form.eficaz) { toast.error('Informe se foi eficaz'); return; }
    if (saving) return;
    setSaving(true);
    try {
      await api.post(`/api/qualidade/rq49/${selected.id}/avaliacoes`, {
        avaliacao: form.avaliacao,
        nota: Number(form.nota),
        eficaz: form.eficaz,
        acao_tomada: form.acao_tomada,
      });
      toast.success('Avaliação registrada com sucesso');
      setModalOpen(false);
      fetchData();
    } catch {
      toast.error('Erro ao salvar avaliação');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="planos-container">
      <main className="planos-main">
        <div className="planos-header">
          <h1>Avaliação de Eficácia — RQ49 Fechadas</h1>
        </div>

        {loading ? (
          <div className="planos-empty">
            <p>Carregando...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="planos-empty">
            <span style={{ fontSize: '2.5rem' }}>✅</span>
            <p>Nenhuma NO pendente de avaliação de eficácia</p>
          </div>
        ) : (
          <div className="planos-table-wrapper">
            <table className="planos-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Título</th>
                  <th>Data Fechamento</th>
                  <th>Responsável</th>
                  <th className="col-center">Avaliações</th>
                  <th className="col-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="planos-row">
                    <td className="col-mono">{item.codigo || `NO-${item.id}`}</td>
                    <td className="col-desc">{item.titulo || item.descricao?.substring(0, 80) || '—'}</td>
                    <td className="col-nowrap">{fmtDate(item.dt_fechamento)}</td>
                    <td>{item.responsavel_nome || '—'}</td>
                    <td className="col-center">
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: 10,
                        background: 'var(--bg-muted, rgba(120,120,120,0.12))',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}>
                        {item.total_avaliacoes ?? 0}
                      </span>
                    </td>
                    <td className="col-center">
                      <button
                        className="planos-btn-novo"
                        style={{ padding: '5px 14px', fontSize: '0.78rem' }}
                        onClick={() => openModal(item)}
                      >
                        Avaliar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Avaliação de Eficácia — ${selected?.codigo || (selected ? `NO-${selected.id}` : '')}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleSalvar}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Avaliação *</label>
          <textarea
            className="form-control"
            rows={4}
            placeholder="Descreva a avaliação de eficácia..."
            value={form.avaliacao}
            onChange={e => setForm(f => ({ ...f, avaliacao: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Nota (1–5) *</label>
            <select
              className="form-control"
              value={form.nota}
              onChange={e => setForm(f => ({ ...f, nota: e.target.value }))}
            >
              <option value="">Selecione...</option>
              {NOTA_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Eficaz? *</label>
            <select
              className="form-control"
              value={form.eficaz}
              onChange={e => setForm(f => ({ ...f, eficaz: e.target.value }))}
            >
              <option value="">Selecione...</option>
              <option value="S">Sim</option>
              <option value="N">Não</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Ação Tomada</label>
          <textarea
            className="form-control"
            rows={3}
            placeholder="Descreva a ação tomada (se houver)..."
            value={form.acao_tomada}
            onChange={e => setForm(f => ({ ...f, acao_tomada: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}

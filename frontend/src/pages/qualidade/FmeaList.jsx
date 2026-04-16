/**
 * Tarefa 300 — FMEA Lista
 * Tabela: Título, Processo, Status, Responsável, Total Itens
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { fmeaService } from '../../services/qualidade/qualidadeService';
import Modal from '../../components/Modal';
import '../../components/Modal.css';
import '../planos_acao/PlanosList.css';

const STATUS_MAP = {
  RASCUNHO:    { label: 'Rascunho',    color: '#6b7280' },
  EM_ANALISE:  { label: 'Em Análise',  color: '#f59e0b' },
  CONCLUIDO:   { label: 'Concluído',   color: '#22c55e' },
  CANCELADO:   { label: 'Cancelado',   color: '#ef4444' },
};

export default function FmeaList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ titulo: '', processo: '', descricao: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await fmeaService.listar();
      setItems(data.items || data || []);
    } catch {
      toast.error('Erro ao carregar FMEAs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.titulo.trim()) { toast.error('Título obrigatório'); return; }
    if (saving) return;
    setSaving(true);
    try {
      const { data } = await fmeaService.criar(form);
      toast.success('FMEA criado');
      setModalOpen(false);
      setForm({ titulo: '', processo: '', descricao: '' });
      navigate(`/qualidade/fmea/${data.id}`);
    } catch {
      toast.error('Erro ao criar FMEA');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="planos-container">
      <main className="planos-main">
        <div className="planos-header">
          <h1>FMEA — Análise de Modo e Efeito de Falha</h1>
          <button className="planos-btn-novo" onClick={() => setModalOpen(true)}>Novo FMEA +</button>
        </div>

        {loading ? (
          <div className="planos-empty"><p>Carregando...</p></div>
        ) : items.length === 0 ? (
          <div className="planos-empty">
            <span style={{ fontSize: '2.5rem' }}>📊</span>
            <p>Nenhum FMEA cadastrado</p>
          </div>
        ) : (
          <div className="planos-table-wrapper">
            <table className="planos-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Processo</th>
                  <th>Status</th>
                  <th>Responsável</th>
                  <th className="col-center">Itens</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const stInfo = STATUS_MAP[(item.status || '').toUpperCase()] || STATUS_MAP.RASCUNHO;
                  return (
                    <tr
                      key={item.id}
                      className="planos-row"
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/qualidade/fmea/${item.id}`)}
                    >
                      <td style={{ fontWeight: 600, fontSize: '0.88rem' }}>{item.titulo}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.processo || '—'}</td>
                      <td>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 600, padding: '2px 10px', borderRadius: 10,
                          background: stInfo.color + '22', color: stInfo.color,
                        }}>
                          {stInfo.label}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{item.responsavel_nome || '—'}</td>
                      <td className="col-center">
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 10,
                          background: 'var(--bg-muted, rgba(120,120,120,0.12))',
                          fontSize: '0.75rem', fontWeight: 600,
                        }}>
                          {item.total_itens ?? 0}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo FMEA"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleCreate}>
              {saving ? 'Criando...' : 'Criar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Título *</label>
          <input
            className="form-control"
            value={form.titulo}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Título do FMEA"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>Processo</label>
          <input
            className="form-control"
            value={form.processo}
            onChange={e => setForm(f => ({ ...f, processo: e.target.value }))}
            placeholder="Ex: Processo de soldagem"
          />
        </div>
        <div className="form-group">
          <label>Descrição</label>
          <textarea
            className="form-control"
            rows={3}
            value={form.descricao}
            onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            placeholder="Descreva o escopo do FMEA..."
          />
        </div>
      </Modal>
    </div>
  );
}

/**
 * Tarefa 300 — FMEA Detalhe
 * Tabela de itens com O, S, D, NPN (O×S×D colorido)
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { fmeaService } from '../../services/qualidade/qualidadeService';
import Modal from '../../components/Modal';
import '../../components/Modal.css';
import '../planos_acao/PlanoDetail.css';
import '../planos_acao/PlanosList.css';

const NPN_COLOR = (npn) => {
  if (npn > 100) return '#ef4444';
  if (npn > 50)  return '#f59e0b';
  return '#22c55e';
};

const OSD_OPTIONS = [1,2,3,4,5,6,7,8,9,10];

function NpnBadge({ o, s, d }) {
  const npn = (Number(o) || 0) * (Number(s) || 0) * (Number(d) || 0);
  if (!npn) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 10,
      background: NPN_COLOR(npn) + '22',
      color: NPN_COLOR(npn),
      fontWeight: 700,
      fontSize: '0.82rem',
    }}>
      {npn}
    </span>
  );
}

export default function FmeaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [fmea, setFmea] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    funcao: '', modo_falha: '', efeito: '', causa: '',
    ocorrencia: 1, severidade: 1, detectabilidade: 1,
    acao_recomendada: '', responsavel: '', status: '',
  });
  const [saving, setSaving] = useState(false);
  const [updatingItem, setUpdatingItem] = useState(null);

  const fetchData = async () => {
    try {
      const { data } = await fmeaService.obter(id);
      setFmea(data);
    } catch {
      toast.error('Erro ao carregar FMEA');
      navigate('/qualidade/fmea');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleAddItem = async () => {
    if (!form.funcao.trim()) { toast.error('Função obrigatória'); return; }
    if (saving) return;
    setSaving(true);
    try {
      await fmeaService.addItem(id, {
        ...form,
        ocorrencia: Number(form.ocorrencia),
        severidade: Number(form.severidade),
        detectabilidade: Number(form.detectabilidade),
      });
      toast.success('Item adicionado');
      setModalOpen(false);
      setForm({ funcao: '', modo_falha: '', efeito: '', causa: '', ocorrencia: 1, severidade: 1, detectabilidade: 1, acao_recomendada: '', responsavel: '', status: '' });
      fetchData();
    } catch {
      toast.error('Erro ao adicionar item');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateOSD = async (itemId, field, value) => {
    setUpdatingItem(itemId + field);
    try {
      await fmeaService.updateItem(id, itemId, { [field]: Number(value) });
      fetchData();
    } catch {
      toast.error('Erro ao atualizar');
    } finally {
      setUpdatingItem(null);
    }
  };

  if (loading) return <div className="plano-detail"><p style={{ padding: 32, color: 'var(--text-muted)' }}>Carregando...</p></div>;
  if (!fmea) return null;

  return (
    <div className="plano-detail">
      {/* Header */}
      <div className="plano-header-card">
        <div className="plano-header-left">
          <div className="plano-breadcrumb-text">
            <a onClick={() => navigate('/qualidade/fmea')} style={{ cursor: 'pointer' }}>FMEA</a>
            {' / '}{fmea.titulo}
          </div>
          <div className="plano-header-title-row">
            <h2 className="plano-title">{fmea.titulo}</h2>
            {fmea.processo && (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '3px 12px', background: 'var(--bg-muted)', borderRadius: 10 }}>
                {fmea.processo}
              </span>
            )}
          </div>
          {fmea.responsavel_nome && (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              Responsável: {fmea.responsavel_nome}
            </div>
          )}
        </div>
        <div className="plano-header-right">
          <button className="plano-btn plano-btn-voltar" onClick={() => navigate('/qualidade/fmea')}>
            ← Voltar
          </button>
        </div>
      </div>

      {/* Itens FMEA */}
      <div className="plano-section">
        <div className="plano-section-header">
          <h3>Itens FMEA ({(fmea.itens || []).length})</h3>
          <button className="plano-btn-participante" onClick={() => setModalOpen(true)}>+ Adicionar Item</button>
        </div>

        {(fmea.itens || []).length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', fontStyle: 'italic', padding: '24px 0' }}>
            Nenhum item cadastrado. Clique em "Adicionar Item" para começar a análise.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="planos-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Função</th>
                  <th>Modo de Falha</th>
                  <th>Efeito</th>
                  <th>Causa</th>
                  <th className="col-center" title="Ocorrência (1-10)">O</th>
                  <th className="col-center" title="Severidade (1-10)">S</th>
                  <th className="col-center" title="Detectabilidade (1-10)">D</th>
                  <th className="col-center" title="Número de Prioridade de Risco = O×S×D">NPN</th>
                  <th>Ação Recomendada</th>
                  <th>Responsável</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(fmea.itens || []).map(item => (
                  <tr key={item.id} className="planos-row">
                    <td style={{ fontSize: '0.82rem', fontWeight: 600 }}>{item.funcao}</td>
                    <td style={{ fontSize: '0.82rem' }}>{item.modo_falha || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>{item.efeito || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>{item.causa || '—'}</td>
                    <td className="col-center">
                      <select
                        value={item.ocorrencia || 1}
                        onChange={e => handleUpdateOSD(item.id, 'ocorrencia', e.target.value)}
                        disabled={updatingItem === item.id + 'ocorrencia'}
                        style={{ width: 52, fontSize: '0.8rem', padding: '3px', border: '1px solid var(--border-primary)', borderRadius: 4, background: 'var(--bg-input)', color: 'var(--text-primary)', cursor: 'pointer' }}
                      >
                        {OSD_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="col-center">
                      <select
                        value={item.severidade || 1}
                        onChange={e => handleUpdateOSD(item.id, 'severidade', e.target.value)}
                        disabled={updatingItem === item.id + 'severidade'}
                        style={{ width: 52, fontSize: '0.8rem', padding: '3px', border: '1px solid var(--border-primary)', borderRadius: 4, background: 'var(--bg-input)', color: 'var(--text-primary)', cursor: 'pointer' }}
                      >
                        {OSD_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="col-center">
                      <select
                        value={item.detectabilidade || 1}
                        onChange={e => handleUpdateOSD(item.id, 'detectabilidade', e.target.value)}
                        disabled={updatingItem === item.id + 'detectabilidade'}
                        style={{ width: 52, fontSize: '0.8rem', padding: '3px', border: '1px solid var(--border-primary)', borderRadius: 4, background: 'var(--bg-input)', color: 'var(--text-primary)', cursor: 'pointer' }}
                      >
                        {OSD_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </td>
                    <td className="col-center">
                      <NpnBadge o={item.ocorrencia} s={item.severidade} d={item.detectabilidade} />
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{item.acao_recomendada || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>{item.responsavel || '—'}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{item.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legenda NPN */}
      <div style={{ display: 'flex', gap: 16, padding: '8px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          NPN ≤ 50 (Baixo)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
          NPN 51–100 (Médio)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
          NPN &gt; 100 (Alto)
        </span>
      </div>

      {/* Modal Adicionar Item */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Adicionar Item FMEA"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={handleAddItem}>
              {saving ? 'Adicionando...' : 'Adicionar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Função *</label>
          <input
            className="form-control"
            value={form.funcao}
            onChange={e => setForm(f => ({ ...f, funcao: e.target.value }))}
            placeholder="Função do componente/processo"
            autoFocus
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Modo de Falha</label>
            <input className="form-control" value={form.modo_falha} onChange={e => setForm(f => ({ ...f, modo_falha: e.target.value }))} placeholder="Como pode falhar?" />
          </div>
          <div className="form-group">
            <label>Efeito</label>
            <input className="form-control" value={form.efeito} onChange={e => setForm(f => ({ ...f, efeito: e.target.value }))} placeholder="Efeito da falha" />
          </div>
        </div>
        <div className="form-group">
          <label>Causa</label>
          <input className="form-control" value={form.causa} onChange={e => setForm(f => ({ ...f, causa: e.target.value }))} placeholder="Causa potencial da falha" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Ocorrência (O) 1–10</label>
            <select className="form-control" value={form.ocorrencia} onChange={e => setForm(f => ({ ...f, ocorrencia: e.target.value }))}>
              {OSD_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Severidade (S) 1–10</label>
            <select className="form-control" value={form.severidade} onChange={e => setForm(f => ({ ...f, severidade: e.target.value }))}>
              {OSD_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Detectabilidade (D) 1–10</label>
            <select className="form-control" value={form.detectabilidade} onChange={e => setForm(f => ({ ...f, detectabilidade: e.target.value }))}>
              {OSD_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
        <div style={{ padding: '8px 0', fontSize: '0.85rem', fontWeight: 600 }}>
          NPN calculado: <NpnBadge o={form.ocorrencia} s={form.severidade} d={form.detectabilidade} />
        </div>
        <div className="form-group">
          <label>Ação Recomendada</label>
          <textarea className="form-control" rows={2} value={form.acao_recomendada} onChange={e => setForm(f => ({ ...f, acao_recomendada: e.target.value }))} placeholder="Ação para mitigar o risco..." />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Responsável</label>
            <input className="form-control" value={form.responsavel} onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))} placeholder="Nome do responsável" />
          </div>
          <div className="form-group">
            <label>Status</label>
            <input className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} placeholder="Ex: Pendente, Em andamento..." />
          </div>
        </div>
      </Modal>
    </div>
  );
}

/**
 * BombaDetail — detalhe + edição inline de uma bomba.
 * Route: /motores/bombas/:id
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { motorService } from '../../services/motores/motorService';
import '../tarefas/TarefasList.css';

const TABS = [
  { k: 'geral', l: 'Geral' },
  { k: 'especificacoes', l: 'Especificações' },
];

export default function BombaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [bomba, setBomba] = useState(null);
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('geral');
  const [modelos, setModelos] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: b }, { data: mods }] = await Promise.all([
        motorService.obterBomba(id),
        motorService.modelos(),
      ]);
      setBomba(b);
      setForm({ ...b });
      setModelos(mods.items || mods || []);
    } catch {
      toast.error('Erro ao carregar bomba');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await motorService.atualizarBomba(id, form);
      toast.success('Bomba atualizada');
      setDirty(false);
      setBomba(form);
    } catch {
      toast.error('Erro ao salvar bomba');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="tarefas-page"><p style={{ padding: 32 }}>Carregando...</p></div>;
  if (!bomba) return <div className="tarefas-page"><p style={{ padding: 32 }}>Bomba não encontrada.</p></div>;

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={() => navigate(-1)}>← Voltar</button>
          <h1 style={{ margin: 0 }}>{bomba.descricao || `Bomba #${id}`}</h1>
        </div>
        {dirty && (
          <button className="btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        )}
      </div>

      <div className="detail-tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.k} className={tab === t.k ? 'active' : ''} onClick={() => setTab(t.k)}>{t.l}</button>
        ))}
      </div>

      {/* ── GERAL ── */}
      {tab === 'geral' && (
        <div className="detail-card">
          <div className="form-row">
            <div className="form-group">
              <label>Descrição</label>
              <input className="form-control" value={form.descricao || ''} onChange={e => set('descricao', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Código</label>
              <input className="form-control" value={form.codigo || ''} onChange={e => set('codigo', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Tipo</label>
              <input className="form-control" value={form.tipo || ''} onChange={e => set('tipo', e.target.value)} placeholder="Ex: centrífuga, axial, peristáltica..." />
            </div>
            <div className="form-group">
              <label>Modelo</label>
              <select className="form-control" value={form.hgr_mot_cad_mod_id || ''} onChange={e => set('hgr_mot_cad_mod_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {modelos.map(m => <option key={m.id} value={m.id}>{m.descricao}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ maxWidth: 200 }}>
            <label>
              <input type="checkbox" checked={!!form.ativo} onChange={e => set('ativo', e.target.checked)} style={{ marginRight: 8 }} />
              Ativo
            </label>
          </div>
        </div>
      )}

      {/* ── ESPECIFICAÇÕES ── */}
      {tab === 'especificacoes' && (
        <div className="detail-card">
          <div className="form-row">
            <div className="form-group">
              <label>Vazão Nominal (m³/h)</label>
              <input className="form-control" type="number" step="0.01" value={form.vazao_nominal || ''} onChange={e => set('vazao_nominal', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Altura Nominal (m)</label>
              <input className="form-control" type="number" step="0.01" value={form.altura_nominal || ''} onChange={e => set('altura_nominal', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Rendimento (%)</label>
              <input className="form-control" type="number" step="0.1" min="0" max="100" value={form.rendimento || ''} onChange={e => set('rendimento', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Material</label>
            <input className="form-control" value={form.material || ''} onChange={e => set('material', e.target.value)} placeholder="Ex: ferro fundido, aço inox 316L..." />
          </div>
        </div>
      )}
    </div>
  );
}

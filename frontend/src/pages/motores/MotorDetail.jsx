/**
 * MotorDetail — detalhe + edição inline de um motor.
 * Route: /motores/motores/:id
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { motorService } from '../../services/motores/motorService';
import '../tarefas/TarefasList.css';

const EFI_COLORS = { IE4: '#27ae60', IE3: '#2980b9', IE2: '#e67e22', IE1: '#95a5a6' };

function EfiBadge({ value }) {
  if (!value) return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      backgroundColor: EFI_COLORS[value] || '#888', color: '#fff', fontSize: '0.78rem', fontWeight: 700,
    }}>{value}</span>
  );
}

const TABS = [
  { k: 'geral', l: 'Geral' },
  { k: 'especificacoes', l: 'Especificações' },
  { k: 'normas', l: 'Normas' },
  { k: 'sensores', l: 'Sensores' },
  { k: 'bombas_compat', l: 'Bombas Compatíveis' },
];

export default function MotorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [motor, setMotor] = useState(null);
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [tab, setTab] = useState('geral');

  const [modelos, setModelos] = useState([]);
  const [normas, setNormas] = useState([]);
  const [sensores, setSensores] = useState([]);
  const [bombas, setBombas] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: m }, { data: mods }, { data: norms }, { data: sens }] = await Promise.all([
        motorService.obterMotor(id),
        motorService.modelos(),
        motorService.listarNormas(),
        motorService.listarSensores(),
      ]);
      setMotor(m);
      setForm({ ...m });
      setModelos(mods.items || mods || []);
      setNormas(Array.isArray(norms) ? norms : norms.items || []);
      setSensores(Array.isArray(sens) ? sens : sens.items || []);
    } catch {
      toast.error('Erro ao carregar motor');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // When model changes, load compatible bombas
  useEffect(() => {
    if (!form.hgr_mot_cad_mod_id) { setBombas([]); return; }
    motorService.listarBombas({ modelo_id: form.hgr_mot_cad_mod_id, per_page: 100 })
      .then(({ data }) => setBombas(data.items || []))
      .catch(() => setBombas([]));
  }, [form.hgr_mot_cad_mod_id]);

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setDirty(true);
  };

  const toggleExtra = (key, itemId) => {
    const list = (form.dados_extra?.[key] || []);
    const next = list.includes(itemId) ? list.filter(x => x !== itemId) : [...list, itemId];
    setForm(f => ({ ...f, dados_extra: { ...(f.dados_extra || {}), [key]: next } }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await motorService.atualizarMotor(id, form);
      toast.success('Motor atualizado');
      setDirty(false);
      setMotor(form);
    } catch {
      toast.error('Erro ao salvar motor');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="tarefas-page"><p style={{ padding: 32 }}>Carregando...</p></div>;
  if (!motor) return <div className="tarefas-page"><p style={{ padding: 32 }}>Motor não encontrado.</p></div>;

  const normasAtivas = form.dados_extra?.normas || [];
  const sensoresAtivos = form.dados_extra?.sensores || [];

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={() => navigate(-1)}>← Voltar</button>
          <h1 style={{ margin: 0 }}>{motor.descricao || `Motor #${id}`}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" disabled={pdfLoading} onClick={async () => {
            setPdfLoading(true);
            try {
              const { data } = await motorService.baixarFolhaDadosMotorPdf(id);
              const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = `FolhaDados_${(motor.descricao || id).replace(/\s/g, '_').slice(0, 50)}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success('PDF gerado');
            } catch { toast.error('Erro ao gerar PDF'); }
            finally { setPdfLoading(false); }
          }}>
            {pdfLoading ? 'Gerando...' : 'Folha de Dados PDF'}
          </button>
          {dirty && (
            <button className="btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          )}
        </div>
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
              <label>Modelo</label>
              <select className="form-control" value={form.hgr_mot_cad_mod_id || ''} onChange={e => set('hgr_mot_cad_mod_id', e.target.value)}>
                <option value="">— Selecione —</option>
                {modelos.map(m => <option key={m.id} value={m.id}>{m.descricao}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Status Comercialização</label>
              <select className="form-control" value={form.status_comercializacao || ''} onChange={e => set('status_comercializacao', e.target.value)}>
                <option value="">— Selecione —</option>
                <option value="ativo">Ativo</option>
                <option value="descontinuado">Descontinuado</option>
                <option value="projeto">Projeto</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Eficiência Energética</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <select className="form-control" value={form.eficiencia_energetica || ''} onChange={e => set('eficiencia_energetica', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {['IE1', 'IE2', 'IE3', 'IE4'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <EfiBadge value={form.eficiencia_energetica} />
              </div>
            </div>
            <div className="form-group">
              <label>Fator de Serviço</label>
              <input className="form-control" type="number" step="0.01" value={form.fator_servico || ''} onChange={e => set('fator_servico', e.target.value)} />
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
              <label>Potência (cv/kW)</label>
              <input className="form-control" value={form.potencia || ''} onChange={e => set('potencia', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Tensão (V)</label>
              <input className="form-control" value={form.tensao || ''} onChange={e => set('tensao', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Corrente (A)</label>
              <input className="form-control" value={form.corrente || ''} onChange={e => set('corrente', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Rotação (RPM)</label>
              <input className="form-control" value={form.rotacao || ''} onChange={e => set('rotacao', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Frequência (Hz)</label>
              <input className="form-control" value={form.frequencia || ''} onChange={e => set('frequencia', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Classe de Isolamento</label>
              <input className="form-control" value={form.classe_isolamento || ''} onChange={e => set('classe_isolamento', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>IP</label>
              <input className="form-control" value={form.ip || ''} onChange={e => set('ip', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Carcaça</label>
              <input className="form-control" value={form.carcaca || ''} onChange={e => set('carcaca', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Peso (kg)</label>
              <input className="form-control" type="number" step="0.1" value={form.peso || ''} onChange={e => set('peso', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Dimensões</label>
            <input className="form-control" value={form.dimensoes || ''} onChange={e => set('dimensoes', e.target.value)} placeholder="Ex: 400x300x250 mm" />
          </div>
        </div>
      )}

      {/* ── NORMAS ── */}
      {tab === 'normas' && (
        <div className="detail-card">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: '0.88rem' }}>
            Marque as normas que se aplicam a este motor. Clique em "Salvar alterações" para confirmar.
          </p>
          {normas.length === 0 ? (
            <div className="empty-state">Nenhuma norma cadastrada</div>
          ) : (
            <table className="data-table">
              <thead><tr><th style={{ width: 40 }}></th><th>Código</th><th>Descrição</th></tr></thead>
              <tbody>
                {normas.map(n => (
                  <tr key={n.id}>
                    <td>
                      <input type="checkbox"
                        checked={normasAtivas.includes(n.id)}
                        onChange={() => toggleExtra('normas', n.id)}
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>{n.codigo || n.sigla || '—'}</td>
                    <td>{n.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── SENSORES ── */}
      {tab === 'sensores' && (
        <div className="detail-card">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: '0.88rem' }}>
            Marque os sensores compatíveis com este motor.
          </p>
          {sensores.length === 0 ? (
            <div className="empty-state">Nenhum sensor cadastrado</div>
          ) : (
            <table className="data-table">
              <thead><tr><th style={{ width: 40 }}></th><th>Nome</th><th>Tipo</th></tr></thead>
              <tbody>
                {sensores.map(s => (
                  <tr key={s.id}>
                    <td>
                      <input type="checkbox"
                        checked={sensoresAtivos.includes(s.id)}
                        onChange={() => toggleExtra('sensores', s.id)}
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.nome || s.descricao}</td>
                    <td>{s.tipo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── BOMBAS COMPATÍVEIS ── */}
      {tab === 'bombas_compat' && (
        <div className="detail-card">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: '0.88rem' }}>
            Bombas do mesmo modelo ({form.hgr_mot_cad_mod_id ? `modelo #${form.hgr_mot_cad_mod_id}` : 'nenhum modelo selecionado'}).
          </p>
          {!form.hgr_mot_cad_mod_id ? (
            <div className="empty-state">Selecione um modelo na aba Geral para ver bombas compatíveis.</div>
          ) : bombas.length === 0 ? (
            <div className="empty-state">Nenhuma bomba encontrada para este modelo</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Código</th><th>Descrição</th><th>Tipo</th><th>Vazão</th><th>Altura</th></tr></thead>
              <tbody>
                {bombas.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}>{b.codigo || '—'}</td>
                    <td>{b.descricao}</td>
                    <td>{b.tipo || '—'}</td>
                    <td>{b.vazao_nominal || '—'}</td>
                    <td>{b.altura_nominal || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

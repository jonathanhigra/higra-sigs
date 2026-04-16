import React, { useEffect, useState } from 'react';
import api from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

const BASE = '/api/assistencia/funis';

const FUNIL_EMPTY = { nome: '', descricao: '', ativo: 'S' };
const ETAPA_EMPTY = { nome: '', ordem: 0, cor: '#6c757d', tipo: 'normal', ativo: 'S' };

const TIPO_OPTS = [
  { value: 'normal', label: 'Normal' },
  { value: 'inicio', label: 'Início (entrada)' },
  { value: 'fim_ok', label: 'Fim — Resolvido' },
  { value: 'fim_nok', label: 'Fim — Cancelado' },
];

const TIPO_COLORS = {
  inicio: '#0d6efd',
  fim_ok: '#198754',
  fim_nok: '#dc3545',
  normal: '#6c757d',
};

export default function FunisAtendimentoList() {
  const { showToast } = useToast();

  // Funis
  const [funis, setFunis] = useState([]);
  const [loadingFunis, setLoadingFunis] = useState(true);
  const [funilModal, setFunilModal] = useState(false);
  const [funilForm, setFunilForm] = useState(FUNIL_EMPTY);
  const [funilEditId, setFunilEditId] = useState(null);
  const [savingFunil, setSavingFunil] = useState(false);
  const [selectedFunil, setSelectedFunil] = useState(null);

  // Etapas
  const [etapas, setEtapas] = useState([]);
  const [loadingEtapas, setLoadingEtapas] = useState(false);
  const [etapaModal, setEtapaModal] = useState(false);
  const [etapaForm, setEtapaForm] = useState(ETAPA_EMPTY);
  const [etapaEditId, setEtapaEditId] = useState(null);
  const [savingEtapa, setSavingEtapa] = useState(false);

  async function fetchFunis() {
    setLoadingFunis(true);
    try {
      const r = await api.get(BASE);
      setFunis(r.data);
    } catch {
      showToast('Erro ao carregar funis', 'error');
    } finally {
      setLoadingFunis(false);
    }
  }

  async function fetchEtapas(funilId) {
    setLoadingEtapas(true);
    try {
      const r = await api.get(`${BASE}/${funilId}/etapas`);
      setEtapas(r.data);
    } catch {
      showToast('Erro ao carregar etapas', 'error');
    } finally {
      setLoadingEtapas(false);
    }
  }

  useEffect(() => { fetchFunis(); }, []);

  function selectFunil(funil) {
    setSelectedFunil(funil);
    fetchEtapas(funil.id);
  }

  // ── Funil handlers ──────────────────────────────────────────────────────────
  function openNewFunil() {
    setFunilEditId(null);
    setFunilForm(FUNIL_EMPTY);
    setFunilModal(true);
  }

  function openEditFunil(f) {
    setFunilEditId(f.id);
    setFunilForm({ nome: f.nome, descricao: f.descricao || '', ativo: f.ativo });
    setFunilModal(true);
  }

  async function saveFunil() {
    if (!funilForm.nome.trim()) { showToast('Nome obrigatório', 'error'); return; }
    setSavingFunil(true);
    try {
      if (funilEditId) {
        const r = await api.put(`${BASE}/${funilEditId}`, funilForm);
        if (selectedFunil?.id === funilEditId) setSelectedFunil(r.data);
        showToast('Funil atualizado');
      } else {
        await api.post(BASE, funilForm);
        showToast('Funil criado');
      }
      setFunilModal(false);
      fetchFunis();
    } catch {
      showToast('Erro ao salvar funil', 'error');
    } finally {
      setSavingFunil(false);
    }
  }

  async function deleteFunil(id) {
    if (!window.confirm('Excluir este funil e todas as suas etapas?')) return;
    try {
      await api.delete(`${BASE}/${id}`);
      showToast('Funil excluído');
      if (selectedFunil?.id === id) setSelectedFunil(null);
      fetchFunis();
    } catch {
      showToast('Erro ao excluir funil', 'error');
    }
  }

  // ── Etapa handlers ──────────────────────────────────────────────────────────
  function openNewEtapa() {
    setEtapaEditId(null);
    setEtapaForm({ ...ETAPA_EMPTY, ordem: etapas.length });
    setEtapaModal(true);
  }

  function openEditEtapa(e) {
    setEtapaEditId(e.id);
    setEtapaForm({ nome: e.nome, ordem: e.ordem, cor: e.cor, tipo: e.tipo, ativo: e.ativo });
    setEtapaModal(true);
  }

  async function saveEtapa() {
    if (!etapaForm.nome.trim()) { showToast('Nome obrigatório', 'error'); return; }
    setSavingEtapa(true);
    try {
      if (etapaEditId) {
        await api.put(`${BASE}/${selectedFunil.id}/etapas/${etapaEditId}`, etapaForm);
        showToast('Etapa atualizada');
      } else {
        await api.post(`${BASE}/${selectedFunil.id}/etapas`, etapaForm);
        showToast('Etapa criada');
      }
      setEtapaModal(false);
      fetchEtapas(selectedFunil.id);
    } catch {
      showToast('Erro ao salvar etapa', 'error');
    } finally {
      setSavingEtapa(false);
    }
  }

  async function deleteEtapa(etapaId) {
    if (!window.confirm('Excluir esta etapa?')) return;
    try {
      await api.delete(`${BASE}/${selectedFunil.id}/etapas/${etapaId}`);
      showToast('Etapa excluída');
      fetchEtapas(selectedFunil.id);
    } catch {
      showToast('Erro ao excluir etapa', 'error');
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
          Funis de Atendimento
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
          Ref: P0544/P0545/P0546 — hgr_ass_cad_funil / hgr_ass_cad_funil_etapa
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
        {/* ── Funis panel ── */}
        <div style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Funis</span>
            <button
              onClick={openNewFunil}
              style={{ padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13 }}
            >
              + Novo
            </button>
          </div>

          {loadingFunis ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</p>
          ) : funis.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Nenhum funil cadastrado.</p>
          ) : funis.map(f => (
            <div
              key={f.id}
              onClick={() => selectFunil(f)}
              style={{
                padding: '10px 12px', borderRadius: 8, marginBottom: 6, cursor: 'pointer',
                background: selectedFunil?.id === f.id ? 'var(--accent)' : 'var(--hover-bg)',
                color: selectedFunil?.id === f.id ? '#fff' : 'var(--text-primary)',
                transition: 'background .15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{f.nome}</div>
                  <div style={{ fontSize: 12, opacity: .75, marginTop: 2 }}>
                    {f.total_etapas} etapa{f.total_etapas !== 1 ? 's' : ''}
                    {f.ativo !== 'S' && <span style={{ marginLeft: 8, background: 'rgba(255,255,255,.2)', padding: '1px 6px', borderRadius: 4 }}>Inativo</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={e => { e.stopPropagation(); openEditFunil(f); }}
                    style={{ padding: '3px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,.15)', color: 'inherit', fontSize: 12 }}
                  >
                    ✎
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteFunil(f.id); }}
                    style={{ padding: '3px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', background: 'rgba(220,53,69,.15)', color: selectedFunil?.id === f.id ? '#fff' : '#dc3545', fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Etapas panel ── */}
        <div style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
          {!selectedFunil ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'var(--text-muted)', fontSize: 14 }}>
              Selecione um funil para ver as etapas
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                    Etapas — {selectedFunil.nome}
                  </span>
                  {selectedFunil.descricao && (
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{selectedFunil.descricao}</p>
                  )}
                </div>
                <button
                  onClick={openNewEtapa}
                  style={{ padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13 }}
                >
                  + Nova Etapa
                </button>
              </div>

              {loadingEtapas ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</p>
              ) : etapas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 14 }}>
                  Nenhuma etapa cadastrada. Clique em "+ Nova Etapa" para começar.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {etapas.map((e, idx) => (
                    <div
                      key={e.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                        borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg)', transition: 'background .15s',
                      }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, background: e.cor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
                      }}>
                        {idx + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{e.nome}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                          <span style={{
                            fontSize: 11, padding: '1px 8px', borderRadius: 10,
                            background: TIPO_COLORS[e.tipo] + '22',
                            color: TIPO_COLORS[e.tipo], fontWeight: 600,
                          }}>
                            {TIPO_OPTS.find(t => t.value === e.tipo)?.label || e.tipo}
                          </span>
                          {e.ativo !== 'S' && (
                            <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, background: 'var(--muted-bg)', color: 'var(--text-muted)', fontWeight: 600 }}>
                              Inativo
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => openEditEtapa(e)}
                          style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => deleteEtapa(e.id)}
                          style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--danger, #dc3545)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--danger, #dc3545)' }}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Modal Funil ── */}
      {funilModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 28, width: 440, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {funilEditId ? 'Editar Funil' : 'Novo Funil'}
            </h2>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Nome *</label>
            <input
              value={funilForm.nome}
              onChange={e => setFunilForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Suporte Técnico, Manutenção…"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }}
            />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Descrição</label>
            <textarea
              value={funilForm.descricao}
              onChange={e => setFunilForm(f => ({ ...f, descricao: e.target.value }))}
              rows={3}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', resize: 'vertical', marginBottom: 14 }}
            />
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Ativo</label>
            <select
              value={funilForm.ativo}
              onChange={e => setFunilForm(f => ({ ...f, ativo: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', marginBottom: 24 }}
            >
              <option value="S">Sim</option>
              <option value="N">Não</option>
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setFunilModal(false)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}>Cancelar</button>
              <button onClick={saveFunil} disabled={savingFunil} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 14, opacity: savingFunil ? .6 : 1 }}>
                {savingFunil ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Etapa ── */}
      {etapaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 12, padding: 28, width: 460, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {etapaEditId ? 'Editar Etapa' : 'Nova Etapa'}
            </h2>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Nome *</label>
            <input
              value={etapaForm.nome}
              onChange={e => setEtapaForm(f => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Triagem, Em andamento, Concluído…"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Ordem</label>
                <input
                  type="number" min={0}
                  value={etapaForm.ordem}
                  onChange={e => setEtapaForm(f => ({ ...f, ordem: parseInt(e.target.value) || 0 }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Cor</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={etapaForm.cor}
                    onChange={e => setEtapaForm(f => ({ ...f, cor: e.target.value }))}
                    style={{ width: 40, height: 36, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }}
                  />
                  <input
                    value={etapaForm.cor}
                    onChange={e => setEtapaForm(f => ({ ...f, cor: e.target.value }))}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Tipo</label>
            <select
              value={etapaForm.tipo}
              onChange={e => setEtapaForm(f => ({ ...f, tipo: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', marginBottom: 14 }}
            >
              {TIPO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Ativo</label>
            <select
              value={etapaForm.ativo}
              onChange={e => setEtapaForm(f => ({ ...f, ativo: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box', marginBottom: 24 }}
            >
              <option value="S">Sim</option>
              <option value="N">Não</option>
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEtapaModal(false)} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}>Cancelar</button>
              <button onClick={saveEtapa} disabled={savingEtapa} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 14, opacity: savingEtapa ? .6 : 1 }}>
                {savingEtapa ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

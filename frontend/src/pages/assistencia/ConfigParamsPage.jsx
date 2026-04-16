/**
 * APEX P0444 — Configuração de Parâmetros da AT
 * SLAs, autoresponder, notificações, código prefixo, etc.
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import api from '../../lib/api';
import '../../components/DetailPage.css';

const BASE = '/api/assistencia/params';

const TYPE_LABELS = { INT: 'Número inteiro', TEXT: 'Texto', BOOL: 'Sim/Não' };

function ParamField({ param, onSave }) {
  const [value, setValue] = useState(param.valor ?? '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleChange = (v) => { setValue(v); setDirty(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(param.chave, value || null);
      setDirty(false);
    } finally { setSaving(false); }
  };

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto',
      gap: 8, alignItems: 'start',
      padding: '12px 0', borderBottom: '1px solid var(--border-primary)',
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: 2 }}>{param.descricao}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 6 }}>
          {param.chave} · {TYPE_LABELS[param.tipo] || param.tipo}
        </div>
        {param.tipo === 'BOOL' ? (
          <select
            className="form-control"
            style={{ maxWidth: 200 }}
            value={value}
            onChange={e => handleChange(e.target.value)}
          >
            <option value="">Não definido</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        ) : param.tipo === 'INT' ? (
          <input
            type="number"
            className="form-control"
            style={{ maxWidth: 160 }}
            value={value}
            onChange={e => handleChange(e.target.value)}
            placeholder="0"
          />
        ) : (
          <input
            className="form-control"
            value={value}
            onChange={e => handleChange(e.target.value)}
            placeholder="(vazio)"
          />
        )}
      </div>
      {dirty && (
        <button
          className="btn-primary"
          style={{ marginTop: 28, fontSize: '0.78rem', padding: '4px 12px' }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '...' : 'Salvar'}
        </button>
      )}
    </div>
  );
}

export default function ConfigParamsPage() {
  const toast = useToast();
  const [params, setParams] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(BASE);
      setParams(data);
    } catch { toast.error('Erro ao carregar parâmetros'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (chave, valor) => {
    try {
      await api.put(`${BASE}/${chave}`, { valor });
      toast.success('Parâmetro atualizado');
    } catch { toast.error('Erro ao salvar parâmetro'); }
  };

  // Group params by category
  const groups = {
    'SLA': params.filter(p => p.chave.startsWith('sla')),
    'Autoresponder': params.filter(p => p.chave.startsWith('autoresponder')),
    'Notificações': params.filter(p => p.chave.startsWith('notif')),
    'Geral': params.filter(p => !p.chave.startsWith('sla') && !p.chave.startsWith('autoresponder') && !p.chave.startsWith('notif')),
  };

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Assistência Técnica', to: '/assistencia' },
            { label: 'Parâmetros' },
          ]} />
          <h1>Configuração de Parâmetros AT</h1>
        </div>
      </div>

      {loading ? <div className="empty-state">Carregando...</div> : (
        <div style={{ maxWidth: 700 }}>
          {Object.entries(groups).map(([group, items]) =>
            items.length === 0 ? null : (
              <div key={group} style={{ marginBottom: 28 }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  {group}
                </div>
                {items.map(p => (
                  <ParamField key={p.chave} param={p} onSave={handleSave} />
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

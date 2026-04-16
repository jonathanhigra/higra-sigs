/**
 * APEX pg 112 — Permissões por Tipo de Usuário
 * Lista tipos de usuário (exceto Admin) + matriz de permissões por módulo
 * APEX pg 43 — Configurações (links para Permissões, Usuários, Domínios)
 */

import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { permissoesService } from '../../services/admin/permissoesService';
import '../tarefas/TarefasList.css';
import '../../components/Modal.css';

const MODULOS = [
  { key: 'GES', label: 'Indicadores' },
  { key: 'PRJT', label: 'Projetos' },
  { key: 'GACO', label: 'Planos de Ação' },
  { key: 'RNOE', label: 'Reuniões' },
  { key: 'DCMT', label: 'Documentos' },
  { key: 'CMNA', label: 'Notas Oportunidade' },
  { key: 'RNCO', label: 'Não Conformidades' },
  { key: 'EVT', label: 'Comunicação' },
  { key: 'LABS', label: 'Laboratório' },
  { key: 'CHKL', label: 'Produção' },
  { key: 'QLDD', label: 'Qualidade' },
  { key: 'BIBL', label: 'Biblioteca' },
  { key: 'CRM', label: 'CRM' },
];

const ACESSO_OPTIONS = [
  { value: '', label: '—', color: 'var(--text-muted)' },
  { value: 'C', label: 'Consulta', color: '#00A0DF' },
  { value: 'M', label: 'Manutenção', color: '#4caf50' },
];

export default function PermissoesPage() {
  const [tipos, setTipos] = useState([]);
  const [selectedTipo, setSelectedTipo] = useState(null);
  const [permissoes, setPermissoes] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => { fetchTipos(); }, []);

  const fetchTipos = async () => {
    try {
      const { data } = await permissoesService.listarTipos();
      setTipos(data.items || []);
      if (data.items?.length > 0 && !selectedTipo) {
        selectTipo(data.items[0]);
      }
    } catch { toast.error('Erro ao carregar tipos'); }
    finally { setLoading(false); }
  };

  const selectTipo = async (tipo) => {
    setSelectedTipo(tipo);
    try {
      const { data } = await permissoesService.obterPermissoes(tipo.id);
      const map = {};
      (data.items || []).forEach(p => { map[p.modulo_key] = p.acesso; });
      setPermissoes(map);
    } catch { toast.error('Erro ao carregar permissões'); }
  };

  const handleChange = (modKey, acesso) => {
    setPermissoes(prev => ({ ...prev, [modKey]: acesso }));
  };

  const handleSave = async () => {
    if (!selectedTipo) return;
    setSaving(true);
    try {
      await permissoesService.salvarPermissoes(selectedTipo.id, permissoes);
      toast.success('Permissões salvas');
    } catch { toast.error('Erro ao salvar'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="tarefas-page"><div className="empty-state">Carregando...</div></div>;

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Gestão de Permissões</h1>
        <button className="btn-primary" onClick={handleSave} disabled={saving || !selectedTipo}>
          {saving ? 'Salvando...' : 'Salvar Permissões'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Lista de tipos — APEX pg 112 sidebar */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-primary)', fontWeight: 600, fontSize: '0.9rem' }}>Tipos de Usuário</div>
          {tipos.map(t => (
            <div key={t.id} onClick={() => selectTipo(t)} style={{
              padding: '10px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: selectedTipo?.id === t.id ? 'var(--bg-hover)' : 'transparent',
              borderLeft: selectedTipo?.id === t.id ? '3px solid var(--accent)' : '3px solid transparent',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t.hgr_descricao || t.descricao}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.hgr_vlr_retorno}</div>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: 8 }}>
                {t.qtd_usuarios || 0}
              </span>
            </div>
          ))}
        </div>

        {/* Matriz de permissões — APEX pg 112 main content */}
        {selectedTipo ? (
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: '1rem', marginBottom: 16 }}>
              Permissões — {selectedTipo.hgr_descricao || selectedTipo.descricao}
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: 8 }}>({selectedTipo.hgr_vlr_retorno})</span>
            </h2>
            {selectedTipo.hgr_vlr_retorno === 'A' ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--accent-success)', fontWeight: 600 }}>
                Administrador tem acesso total a todos os módulos
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Módulo</th>
                    <th style={{ width: 120, textAlign: 'center' }}>Sem acesso</th>
                    <th style={{ width: 120, textAlign: 'center' }}>Consulta</th>
                    <th style={{ width: 120, textAlign: 'center' }}>Manutenção</th>
                  </tr>
                </thead>
                <tbody>
                  {MODULOS.map(mod => {
                    const acesso = permissoes[mod.key] || '';
                    return (
                      <tr key={mod.key}>
                        <td style={{ fontWeight: 600 }}>{mod.label}</td>
                        {['', 'C', 'M'].map(val => (
                          <td key={val} style={{ textAlign: 'center' }}>
                            <input type="radio" name={`perm_${mod.key}`} checked={acesso === val}
                              onChange={() => handleChange(mod.key, val)}
                              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: val === 'M' ? '#4caf50' : val === 'C' ? '#00A0DF' : '#6b7280' }} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="empty-state">Selecione um tipo de usuário</div>
        )}
      </div>
    </div>
  );
}

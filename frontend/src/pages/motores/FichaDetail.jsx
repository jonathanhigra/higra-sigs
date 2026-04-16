/**
 * FichaDetail — detalhe de uma ficha técnica motor+bomba.
 * Route: /motores/fichas/:id
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { motorService } from '../../services/motores/motorService';
import '../tarefas/TarefasList.css';

function JsonTable({ dados }) {
  if (!dados || typeof dados !== 'object' || Object.keys(dados).length === 0) {
    return <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Nenhum dado técnico registrado.</p>;
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th style={{ width: '35%' }}>Campo</th>
          <th>Valor</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(dados).map(([k, v]) => (
          <tr key={k}>
            <td style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{k}</td>
            <td>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function FichaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [ficha, setFicha] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await motorService.obterFicha(id);
      setFicha(data);
      setJsonText(data.dados_tecnicos ? JSON.stringify(data.dados_tecnicos, null, 2) : '');
    } catch {
      toast.error('Erro ao carregar ficha técnica');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (saving) return;
    let dados = {};
    if (jsonText.trim()) {
      try { dados = JSON.parse(jsonText); } catch { toast.error('JSON inválido'); return; }
    }
    setSaving(true);
    try {
      await motorService.atualizarFicha(id, { ...ficha, dados_tecnicos: dados });
      toast.success('Ficha atualizada');
      setFicha(f => ({ ...f, dados_tecnicos: dados }));
      setEditMode(false);
    } catch {
      toast.error('Erro ao salvar ficha');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setJsonText(ficha?.dados_tecnicos ? JSON.stringify(ficha.dados_tecnicos, null, 2) : '');
    setEditMode(false);
  };

  if (loading) return <div className="tarefas-page"><p style={{ padding: 32 }}>Carregando...</p></div>;
  if (!ficha) return <div className="tarefas-page"><p style={{ padding: 32 }}>Ficha não encontrada.</p></div>;

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={() => navigate(-1)}>← Voltar</button>
          <h1 style={{ margin: 0 }}>{ficha.descricao || `Ficha #${id}`}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {editMode ? (
            <>
              <button className="btn-secondary" onClick={cancelEdit}>Cancelar</button>
              <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Salvando...' : 'Salvar'}</button>
            </>
          ) : (
            <>
              <button className="btn-secondary" disabled={pdfLoading} onClick={async () => {
                setPdfLoading(true);
                try {
                  const { data } = await motorService.baixarFolhaDadosPdf(id);
                  const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `FolhaDados_${(ficha.descricao || id).replace(/\s/g, '_').slice(0, 50)}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success('PDF gerado com sucesso');
                } catch { toast.error('Erro ao gerar PDF'); }
                finally { setPdfLoading(false); }
              }}>
                {pdfLoading ? 'Gerando PDF...' : 'Folha de Dados PDF'}
              </button>
              <button className="btn-secondary" onClick={() => setEditMode(true)}>Editar Dados</button>
            </>
          )}
        </div>
      </div>

      {/* Cabeçalho informativo */}
      <div className="detail-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 4 }}>Motor</div>
            <div style={{ fontWeight: 600 }}>{ficha.motor_descricao || ficha.motor_id || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 4 }}>Bomba</div>
            <div style={{ fontWeight: 600 }}>{ficha.bomba_descricao || ficha.bomba_id || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 4 }}>Criada em</div>
            <div>{ficha.created_at ? new Date(ficha.created_at).toLocaleDateString('pt-BR') : '—'}</div>
          </div>
        </div>
      </div>

      {/* Dados técnicos */}
      <div className="detail-card">
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: '0.95rem', fontWeight: 600 }}>Dados Técnicos</h3>

        {editMode ? (
          <textarea
            className="form-control"
            rows={16}
            style={{ fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }}
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
          />
        ) : (
          <JsonTable dados={ficha.dados_tecnicos} />
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { rq49Service } from '../../services/qualidade/rq49Service';
import { Breadcrumbs } from '../../components/ui';
import '../../components/DetailPage.css';

export default function RQ49Create() {
  const navigate = useNavigate();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState({ origens: [], classificacoes: [], processos: [], usuarios: [] });
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    responsavel_id: '',
    hgr_rq49_cad_orig_id: '',
    hgr_rq49_cad_cla_pri_id: '',
    beg_processo_id: '',
  });

  useEffect(() => {
    rq49Service.formOptions().then(r => setOptions(r.data)).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.titulo.trim()) { toast.error('Titulo obrigatorio'); return; }
    if (!form.descricao.trim()) { toast.error('Descricao obrigatoria'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      for (const k of ['responsavel_id', 'hgr_rq49_cad_orig_id', 'hgr_rq49_cad_cla_pri_id', 'beg_processo_id']) {
        payload[k] = payload[k] ? Number(payload[k]) : null;
      }
      const { data } = await rq49Service.criar(payload);
      toast.success('Nota de Oportunidade criada');
      navigate(`/qualidade/rq49/${data.id}`);
    } catch {
      toast.error('Erro ao criar Nota de Oportunidade');
    } finally {
      setSaving(false);
    }
  };

  const upd = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Notas de Oportunidade', to: '/qualidade/rq49' },
            { label: 'Nova NO' },
          ]} />
          <h1>Cadastro de Nota de Oportunidade</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
        <div className="form-group">
          <label>Titulo *</label>
          <input className="form-control" value={form.titulo} onChange={upd('titulo')} placeholder="Titulo da oportunidade de melhoria" autoFocus />
        </div>

        <div className="form-group">
          <label>Descricao *</label>
          <textarea className="form-control" rows={5} value={form.descricao} onChange={upd('descricao')} placeholder="Descreva a oportunidade de melhoria identificada..." />
        </div>

        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label>Origem</label>
            <select className="form-control" value={form.hgr_rq49_cad_orig_id} onChange={upd('hgr_rq49_cad_orig_id')}>
              <option value="">Selecione...</option>
              {options.origens.map(o => <option key={o.id} value={o.id}>{o.descricao}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Classificacao</label>
            <select className="form-control" value={form.hgr_rq49_cad_cla_pri_id} onChange={upd('hgr_rq49_cad_cla_pri_id')}>
              <option value="">Selecione...</option>
              {options.classificacoes.map(c => (
                <option key={c.id} value={c.id}>{c.descricao}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label>Processo</label>
            <select className="form-control" value={form.beg_processo_id} onChange={upd('beg_processo_id')}>
              <option value="">Selecione...</option>
              {options.processos.map(p => <option key={p.id} value={p.id}>{p.descricao}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Responsavel</label>
            <select className="form-control" value={form.responsavel_id} onChange={upd('responsavel_id')}>
              <option value="">Selecione...</option>
              {options.usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Criando...' : 'Criar Nota de Oportunidade'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/qualidade/rq49')}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

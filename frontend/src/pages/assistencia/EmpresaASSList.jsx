/**
 * APEX P0424 — Cadastro de Empresa (Assistência Técnica)
 * CRUD de sth_cad_empresa com listagem de filiais
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { Breadcrumbs } from '../../components/ui';
import Modal from '../../components/Modal';
import ImageLightbox from '../../components/ImageLightbox';
import api from '../../lib/api';
import '../../components/Modal.css';
import '../../components/DetailPage.css';

const BASE = '/api/assistencia/empresas';
const FIL_BASE = '/api/assistencia/filiais';

export default function EmpresaASSList() {
  const toast = useToast();
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [filiais, setFiliais] = useState([]);
  const [loadingFiliais, setLoadingFiliais] = useState(false);

  // CRUD empresa
  const [empModal, setEmpModal] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const EMP_INIT = { descricao: '', cnpj: '', ativo: 'S' };
  const [empForm, setEmpForm] = useState(EMP_INIT);
  const [savingEmp, setSavingEmp] = useState(false);

  // CRUD filial
  const [filModal, setFilModal] = useState(false);
  const [editFil, setEditFil] = useState(null);
  const FIL_INIT = { descricao: '', cnpj: '', ativo: 'S' };
  const [filForm, setFilForm] = useState(FIL_INIT);
  const [savingFil, setSavingFil] = useState(false);

  // Logo / Capa
  const [logoModal, setLogoModal] = useState(false);
  const [logoTarget, setLogoTarget] = useState(null); // {emp, tipo: 'logo'|'capa'}
  const [logoFile, setLogoFile] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [lightboxImages, setLightboxImages] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const logoInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(BASE);
      setEmpresas(data);
    } catch { toast.error('Erro ao carregar empresas'); }
    finally { setLoading(false); }
  };

  const loadFiliais = useCallback(async (empId) => {
    setLoadingFiliais(true);
    try {
      const { data } = await api.get(FIL_BASE, { params: { empresa_id: empId } });
      setFiliais(data);
    } catch { setFiliais([]); }
    finally { setLoadingFiliais(false); }
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (selectedEmp) loadFiliais(selectedEmp.id);
    else setFiliais([]);
  }, [selectedEmp, loadFiliais]);

  const openCreateEmp = () => { setEditEmp(null); setEmpForm(EMP_INIT); setEmpModal(true); };
  const openEditEmp = (e) => { setEditEmp(e); setEmpForm({ descricao: e.descricao, cnpj: e.cnpj || '', ativo: e.ativo || 'S' }); setEmpModal(true); };

  const handleSaveEmp = async () => {
    if (!empForm.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    setSavingEmp(true);
    const payload = { ...empForm, cnpj: empForm.cnpj || null };
    try {
      if (editEmp) {
        await api.put(`${BASE}/${editEmp.id}`, payload);
        toast.success('Empresa atualizada');
      } else {
        await api.post(BASE, payload);
        toast.success('Empresa cadastrada');
      }
      setEmpModal(false);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Erro ao salvar empresa'); }
    finally { setSavingEmp(false); }
  };

  const openCreateFil = () => { setEditFil(null); setFilForm(FIL_INIT); setFilModal(true); };
  const openEditFil = (f) => { setEditFil(f); setFilForm({ descricao: f.descricao, cnpj: f.cnpj || '', ativo: f.ativo || 'S' }); setFilModal(true); };

  const handleSaveFil = async () => {
    if (!filForm.descricao.trim()) { toast.error('Descrição obrigatória'); return; }
    if (!selectedEmp) { toast.error('Selecione uma empresa primeiro'); return; }
    setSavingFil(true);
    const payload = { ...filForm, sth_cad_empresa_id: selectedEmp.id, cnpj: filForm.cnpj || null };
    try {
      if (editFil) {
        await api.put(`${FIL_BASE}/${editFil.id}`, payload);
        toast.success('Unidade atualizada');
      } else {
        await api.post(FIL_BASE, payload);
        toast.success('Unidade cadastrada');
      }
      setFilModal(false);
      loadFiliais(selectedEmp.id);
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Erro ao salvar unidade'); }
    finally { setSavingFil(false); }
  };

  const handleLogoUpload = async () => {
    if (!logoFile) { toast.error('Selecione um arquivo'); return; }
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('arquivo', logoFile);
      await api.post(`${BASE}/${logoTarget.emp.id}/${logoTarget.tipo}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`${logoTarget.tipo === 'logo' ? 'Logo' : 'Capa'} atualizado`);
      setLogoModal(false);
      setLogoFile(null);
      if (logoInputRef.current) logoInputRef.current.value = '';
    } catch { toast.error('Erro ao enviar imagem'); }
    finally { setUploadingLogo(false); }
  };

  const openLightboxForEmpresa = (emp) => {
    const imgs = [];
    imgs.push({ id: `logo-${emp.id}`, src: `${BASE}/${emp.id}/logo`, caption: `${emp.descricao} — Logo` });
    imgs.push({ id: `capa-${emp.id}`, src: `${BASE}/${emp.id}/capa`, caption: `${emp.descricao} — Capa` });
    setLightboxImages(imgs);
    setLightboxIndex(0);
  };

  const filtered = empresas.filter(e =>
    !search || e.descricao?.toLowerCase().includes(search.toLowerCase()) || e.cnpj?.includes(search)
  );

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div>
          <Breadcrumbs items={[
            { label: 'Assistência Técnica', to: '/assistencia' },
            { label: 'Cadastro de Empresas' },
          ]} />
          <h1>Empresas — Assistência Técnica</h1>
        </div>
        <button className="btn-primary" onClick={openCreateEmp}>+ Nova Empresa</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input
          className="form-control"
          style={{ maxWidth: 360 }}
          placeholder="Filtrar por nome ou CNPJ..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedEmp ? '1fr 1fr' : '1fr', gap: 20 }}>
        {/* Lista de empresas */}
        <div>
          {loading ? <div className="empty-state">Carregando...</div>
           : filtered.length === 0 ? <div className="empty-state">Nenhuma empresa encontrada</div>
           : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>Unidades</th>
                  <th>Ativo</th>
                  <th style={{ width: 80 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr
                    key={e.id}
                    className="clickable"
                    onClick={() => setSelectedEmp(selectedEmp?.id === e.id ? null : e)}
                    style={{ background: selectedEmp?.id === e.id ? 'color-mix(in srgb, var(--accent) 8%, var(--card-bg))' : undefined }}
                  >
                    <td style={{ fontWeight: 600 }}>{e.descricao}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{e.cnpj || '—'}</td>
                    <td>
                      <span style={{ background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600 }}>
                        {e.total_filiais}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${e.ativo === 'S' ? 'ativo' : 'inativo'}`}>
                        {e.ativo === 'S' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td onClick={ev => ev.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-secondary" style={{ fontSize: '0.74rem', padding: '2px 8px' }} onClick={() => openEditEmp(e)}>Editar</button>
                        <button className="btn-secondary" style={{ fontSize: '0.74rem', padding: '2px 8px' }} onClick={() => { setLogoTarget({ emp: e, tipo: 'logo' }); setLogoModal(true); }} title="Upload logo">🖼</button>
                        <button className="btn-secondary" style={{ fontSize: '0.74rem', padding: '2px 8px' }} onClick={() => openLightboxForEmpresa(e)} title="Ver imagens">👁</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Filiais da empresa selecionada */}
        {selectedEmp && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{selectedEmp.descricao}</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Unidades / Filiais</div>
              </div>
              <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '4px 12px' }} onClick={openCreateFil}>
                + Nova Unidade
              </button>
            </div>

            {loadingFiliais ? <div className="empty-state">Carregando...</div>
             : filiais.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div>Nenhuma unidade cadastrada</div>
              </div>
             ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Unidade / Filial</th>
                    <th>CNPJ</th>
                    <th>Ativo</th>
                    <th style={{ width: 80 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filiais.map(f => (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600 }}>{f.descricao}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{f.cnpj || '—'}</td>
                      <td>
                        <span className={`status-badge ${f.ativo === 'S' ? 'ativo' : 'inativo'}`}>
                          {f.ativo === 'S' ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        <button className="btn-secondary" style={{ fontSize: '0.74rem', padding: '2px 8px' }} onClick={() => openEditFil(f)}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Modal Empresa */}
      <Modal
        open={empModal}
        onClose={() => setEmpModal(false)}
        title={editEmp ? 'Editar Empresa' : 'Nova Empresa'}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEmpModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSaveEmp} disabled={savingEmp}>
              {savingEmp ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Razão Social / Nome *</label>
          <input
            className="form-control"
            value={empForm.descricao}
            onChange={e => setEmpForm(f => ({ ...f, descricao: e.target.value }))}
            autoFocus
          />
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label>CNPJ</label>
            <input
              className="form-control"
              placeholder="00.000.000/0000-00"
              value={empForm.cnpj}
              onChange={e => setEmpForm(f => ({ ...f, cnpj: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Ativo</label>
            <select className="form-control" value={empForm.ativo} onChange={e => setEmpForm(f => ({ ...f, ativo: e.target.value }))}>
              <option value="S">Sim</option>
              <option value="N">Não</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Modal Filial */}
      <Modal
        open={filModal}
        onClose={() => setFilModal(false)}
        title={editFil ? 'Editar Unidade' : `Nova Unidade — ${selectedEmp?.descricao || ''}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setFilModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSaveFil} disabled={savingFil}>
              {savingFil ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Nome da Unidade / Filial *</label>
          <input
            className="form-control"
            value={filForm.descricao}
            onChange={e => setFilForm(f => ({ ...f, descricao: e.target.value }))}
            autoFocus
          />
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label>CNPJ</label>
            <input
              className="form-control"
              placeholder="00.000.000/0000-00"
              value={filForm.cnpj}
              onChange={e => setFilForm(f => ({ ...f, cnpj: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label>Ativo</label>
            <select className="form-control" value={filForm.ativo} onChange={e => setFilForm(f => ({ ...f, ativo: e.target.value }))}>
              <option value="S">Sim</option>
              <option value="N">Não</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Modal Upload Logo / Capa */}
      <Modal
        open={logoModal}
        onClose={() => { setLogoModal(false); setLogoFile(null); if (logoInputRef.current) logoInputRef.current.value = ''; }}
        title={`${logoTarget?.tipo === 'logo' ? 'Logo' : 'Capa'} — ${logoTarget?.emp?.descricao || ''}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setLogoModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleLogoUpload} disabled={uploadingLogo || !logoFile}>
              {uploadingLogo ? 'Enviando...' : 'Enviar'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
          <div
            style={{ cursor: 'pointer', padding: '4px 12px', borderRadius: 6, fontSize: '0.82rem',
              background: logoTarget?.tipo === 'logo' ? 'var(--accent)' : 'var(--bg-surface)', color: logoTarget?.tipo === 'logo' ? '#fff' : 'inherit',
            }}
            onClick={() => setLogoTarget(t => ({ ...t, tipo: 'logo' }))}
          >Logo</div>
          <div
            style={{ cursor: 'pointer', padding: '4px 12px', borderRadius: 6, fontSize: '0.82rem',
              background: logoTarget?.tipo === 'capa' ? 'var(--accent)' : 'var(--bg-surface)', color: logoTarget?.tipo === 'capa' ? '#fff' : 'inherit',
            }}
            onClick={() => setLogoTarget(t => ({ ...t, tipo: 'capa' }))}
          >Capa</div>
        </div>
        <div className="form-group">
          <label>Imagem (PNG, JPG, SVG)</label>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="form-control"
            onChange={e => setLogoFile(e.target.files?.[0] || null)}
            autoFocus
          />
          {logoFile && (
            <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {logoFile.name} · {(logoFile.size / 1024).toFixed(0)} KB
            </div>
          )}
        </div>
      </Modal>

      {/* Lightbox */}
      <ImageLightbox
        images={lightboxImages}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </div>
  );
}

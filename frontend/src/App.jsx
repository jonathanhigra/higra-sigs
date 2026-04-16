import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import { ToastProvider } from './contexts/ToastContext';
import ToastContainer from './components/ToastContainer';
import ErrorBoundary from './components/ErrorBoundary';
import { useTheme } from './hooks/useTheme';
import useAuthStore from './stores/authStore';

// Lazy-loaded pages
const Login = lazy(() => import('./components/Login'));
const Register = lazy(() => import('./components/Register'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const Chat = lazy(() => import('./pages/Chat'));
const Feed = lazy(() => import('./pages/Feed'));
const Explore = lazy(() => import('./pages/Explore'));
const Messages = lazy(() => import('./pages/Messages'));
const Notifications = lazy(() => import('./pages/Notifications'));

// SIGS pages — FASE 1
const HomeDashboard = lazy(() => import('./pages/home/HomeDashboard'));
const CentroNotificacoes = lazy(() => import('./pages/home/CentroNotificacoes'));
const TarefasList = lazy(() => import('./pages/tarefas/TarefasList'));
const TarefaForm = lazy(() => import('./pages/tarefas/TarefaForm'));
const CadastrosList = lazy(() => import('./pages/cadastros/CadastrosList'));
// SIGS pages — FASE 2
const IndicadoresDashboard = lazy(() => import('./pages/indicadores/IndicadoresDashboard'));
const Ranking = lazy(() => import('./pages/indicadores/Ranking'));
const IndicadoresConfigPage = lazy(() => import('./pages/indicadores/IndicadoresConfigPage'));
const AnoFiscalList = lazy(() => import('./pages/indicadores/AnoFiscalList'));
const MetaDistribuicaoPage = lazy(() => import('./pages/indicadores/MetaDistribuicaoPage'));
const MetasRiscoReport = lazy(() => import('./pages/indicadores/MetasRiscoReport'));
const MetaHistoricoPage = lazy(() => import('./pages/indicadores/MetaHistoricoPage'));
// SIGS pages — FASE 3 (Qualidade)
const QualidadeHub = lazy(() => import('./pages/qualidade/QualidadeHub'));
const RQ03List = lazy(() => import('./pages/qualidade/RQ03List'));
const RQ03Detail = lazy(() => import('./pages/qualidade/RQ03Detail'));
const RQ49List = lazy(() => import('./pages/qualidade/RQ49List'));
const RQ49Create = lazy(() => import('./pages/qualidade/RQ49Create'));
const RQ49Detail = lazy(() => import('./pages/qualidade/RQ49Detail'));
const AgenteCausadorList = lazy(() => import('./pages/qualidade/AgenteCausadorList'));
const ClassificacaoPrimariaList = lazy(() => import('./pages/qualidade/ClassificacaoPrimariaList'));
const ClassificacaoSecundariaList = lazy(() => import('./pages/qualidade/ClassificacaoSecundariaList'));
const AvaliacaoEficaciaList = lazy(() => import('./pages/qualidade/AvaliacaoEficaciaList'));
const RQ80List = lazy(() => import('./pages/qualidade/RQ80List'));
const RQ80Detail = lazy(() => import('./pages/qualidade/RQ80Detail'));
const RQ94List = lazy(() => import('./pages/qualidade/RQ94List'));
const RQ94Detail = lazy(() => import('./pages/qualidade/RQ94Detail'));
const SSTHub = lazy(() => import('./pages/qualidade/SSTHub'));
const SSTPartesCorpoList = lazy(() => import('./pages/qualidade/SSTPartesCorpoList'));
const SSTTiposAcidenteList = lazy(() => import('./pages/qualidade/SSTTiposAcidenteList'));
const FmeaList = lazy(() => import('./pages/qualidade/FmeaList'));
const FmeaDetail = lazy(() => import('./pages/qualidade/FmeaDetail'));
const IndicadoresQualidade = lazy(() => import('./pages/qualidade/IndicadoresQualidade'));
const QualidadeConsolidada = lazy(() => import('./pages/qualidade/QualidadeConsolidada'));
// SIGS pages — FASE 4 (Industrial)
const FabricacaoList = lazy(() => import('./pages/fabricacao/FabricacaoList'));
const FabricacaoCadastroHub = lazy(() => import('./pages/fabricacao/FabricacaoCadastroHub'));
const BitolaFioList = lazy(() => import('./pages/fabricacao/BitolaFioList'));
const FabricanteFioList = lazy(() => import('./pages/fabricacao/FabricanteFioList'));
const CarcacaList = lazy(() => import('./pages/fabricacao/CarcacaList'));
const CorTintaList = lazy(() => import('./pages/fabricacao/CorTintaList'));
const InstrumentosList = lazy(() => import('./pages/fabricacao/InstrumentosList'));
const ChecklistDetail = lazy(() => import('./pages/fabricacao/ChecklistDetail'));
const DashboardFabricacao = lazy(() => import('./pages/fabricacao/DashboardFabricacao'));
const FormaConstrutivalList = lazy(() => import('./pages/fabricacao/FormaConstrutivalList'));
const TipoCaboList = lazy(() => import('./pages/fabricacao/TipoCaboList'));
const TipoSensorList = lazy(() => import('./pages/fabricacao/TipoSensorList'));
const TensaoList = lazy(() => import('./pages/fabricacao/TensaoList'));
const FornecedorFabList = lazy(() => import('./pages/fabricacao/FornecedorFabList'));
const AssistenciaList = lazy(() => import('./pages/assistencia/AssistenciaList'));
const AssistenciaDetail = lazy(() => import('./pages/assistencia/AssistenciaDetail'));
const TiposAtendimentoList = lazy(() => import('./pages/assistencia/TiposAtendimentoList'));
const StatusAtendimentoList = lazy(() => import('./pages/assistencia/StatusAtendimentoList'));
const PermissoesVisualizacaoList = lazy(() => import('./pages/assistencia/PermissoesVisualizacaoList'));
const AceCfgList = lazy(() => import('./pages/assistencia/AceCfgList'));
const UsuUniList = lazy(() => import('./pages/assistencia/UsuUniList'));
const UsuarioASSList = lazy(() => import('./pages/assistencia/UsuarioASSList'));
const EmpresaASSList = lazy(() => import('./pages/assistencia/EmpresaASSList'));
const CanaisEntradaList = lazy(() => import('./pages/assistencia/CanaisEntradaList'));
const ClienteASSList = lazy(() => import('./pages/assistencia/ClienteASSList'));
const ConfigParamsPage = lazy(() => import('./pages/assistencia/ConfigParamsPage'));
const TiposAtividadeList = lazy(() => import('./pages/assistencia/TiposAtividadeList'));
const CategTpAtnList = lazy(() => import('./pages/assistencia/CategTpAtnList'));
const FunisAtendimentoList = lazy(() => import('./pages/assistencia/FunisAtendimentoList'));
const AssistenciaDashboard = lazy(() => import('./pages/assistencia/AssistenciaDashboard'));
const ChamadosList = lazy(() => import('./pages/chamados/ChamadosList'));
const ChamadoDetail = lazy(() => import('./pages/chamados/ChamadoDetail'));
const ProjetosList = lazy(() => import('./pages/projetos/ProjetosList'));
const ProjetoCategoriasList = lazy(() => import('./pages/projetos/ProjetoCategoriasList'));
const ProjetoDetail = lazy(() => import('./pages/projetos/ProjetoDetail'));
const FoccoPVList = lazy(() => import('./pages/projetos/FoccoPVList'));
const ProjetoTarefasFixasList = lazy(() => import('./pages/projetos/ProjetoTarefasFixasList'));
const ApontamentosAvulsosList = lazy(() => import('./pages/tarefas/ApontamentosAvulsosList'));
const RelatorioApontamentos = lazy(() => import('./pages/tarefas/RelatorioApontamentos'));
const ReunioesList = lazy(() => import('./pages/reunioes/ReunioesList'));
const ReuniaoDetail = lazy(() => import('./pages/reunioes/ReuniaoDetail'));
const TiposReuniaoList = lazy(() => import('./pages/reunioes/TiposReuniaoList'));
const DocumentosList = lazy(() => import('./pages/documentos/DocumentosList'));
const DocumentoDetail = lazy(() => import('./pages/documentos/DocumentoDetail'));
const CategoriaDocumentoList = lazy(() => import('./pages/documentos/CategoriaDocumentoList'));
const PlanosList = lazy(() => import('./pages/planos_acao/PlanosList'));
const PlanoDetail = lazy(() => import('./pages/planos_acao/PlanoDetail'));
const PlanosVencidosReport = lazy(() => import('./pages/planos_acao/PlanosVencidosReport'));
// SIGS pages — FASE 5 (Laboratório)
const LaboratorioList = lazy(() => import('./pages/laboratorio/LaboratorioList'));
const DashboardLabs = lazy(() => import('./pages/laboratorio/DashboardLabs'));
const TiposTesteList = lazy(() => import('./pages/laboratorio/TiposTesteList'));
const LabsBancadasList = lazy(() => import('./pages/laboratorio/LabsBancadasList'));
// Admin + Config + Páginas adicionais
const PermissoesPage = lazy(() => import('./pages/admin/PermissoesPage'));
const UsuariosSIGSPage = lazy(() => import('./pages/admin/UsuariosSIGSPage'));
const HealthCheckPage = lazy(() => import('./pages/admin/HealthCheckPage'));
const ConfigPage = lazy(() => import('./pages/config/ConfigPage'));
const DominiosList = lazy(() => import('./pages/config/DominiosList'));
const MotoresList = lazy(() => import('./pages/motores/MotoresList'));
const MotoresHub = lazy(() => import('./pages/motores/MotoresHub'));
const MotorDetail = lazy(() => import('./pages/motores/MotorDetail'));
const BombaDetail = lazy(() => import('./pages/motores/BombaDetail'));
const FichasList = lazy(() => import('./pages/motores/FichasList'));
const FichaDetail = lazy(() => import('./pages/motores/FichaDetail'));
const NormasMotorList = lazy(() => import('./pages/motores/NormasMotorList'));
const FornecedorMotorList = lazy(() => import('./pages/motores/FornecedorMotorList'));
const SensoresMotorList = lazy(() => import('./pages/motores/SensoresMotorList'));
const ClasseProtecaoList = lazy(() => import('./pages/motores/ClasseProtecaoList'));
const CalculadoraPotencia = lazy(() => import('./pages/motores/CalculadoraPotencia'));
const ComparadorMotores = lazy(() => import('./pages/motores/ComparadorMotores'));
const LaudosList = lazy(() => import('./pages/assistencia/LaudosList'));
const LaudoDetail = lazy(() => import('./pages/assistencia/LaudoDetail'));
const AutorizadasList = lazy(() => import('./pages/assistencia/AutorizadasList'));
const DashboardService = lazy(() => import('./pages/assistencia/DashboardService'));
const TipoServicoChamadoList = lazy(() => import('./pages/assistencia/TipoServicoChamadoList'));
const TipoGarantiaList = lazy(() => import('./pages/assistencia/TipoGarantiaList'));
const ChamadosCategoriasPage = lazy(() => import('./pages/chamados/ChamadosCategoriasPage'));
const BibliotecaList = lazy(() => import('./pages/documentos/BibliotecaList'));
const EventosList = lazy(() => import('./pages/comunicacao/EventosList'));
const EventoDetail = lazy(() => import('./pages/comunicacao/EventoDetail'));
const CategoriasComunicadoList = lazy(() => import('./pages/comunicacao/CategoriasComunicadoList'));
const MeusEventos = lazy(() => import('./pages/comunicacao/MeusEventos'));
const LaboratorioDetail = lazy(() => import('./pages/laboratorio/LaboratorioDetail'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Global helpers
import CommandPalette from './components/CommandPalette';
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp';
import OfflineBanner from './components/OfflineBanner';
import ForbiddenToastBridge from './components/ForbiddenToastBridge';

const PageLoader = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '60vh', color: 'var(--feed-muted, #9a9aa2)',
  }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 32, height: 32, border: '3px solid currentColor', borderTopColor: 'transparent',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  </div>
);


const App = () => {
  const token = useAuthStore((s) => s.token);
  const setToken = useAuthStore((s) => s.setToken);
  const logout = useAuthStore((s) => s.logout);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { theme, toggleTheme, highContrast, toggleContrast } = useTheme();

  // Sincroniza o store com o localStorage em recarregamentos e outras abas
  useEffect(() => {
    const syncToken = () => setToken(localStorage.getItem('token'));

    syncToken();
    window.addEventListener('storage', syncToken);
    return () => window.removeEventListener('storage', syncToken);
  }, [setToken]);

  // Permite que páginas internas solicitem o colapso da sidebar
  useEffect(() => {
    const handler = () => setIsCollapsed(true);
    window.addEventListener('collapse-sidebar', handler);
    return () => window.removeEventListener('collapse-sidebar', handler);
  }, []);

  return (
    <ErrorBoundary>
    <Router>
      <ToastProvider>
      <OfflineBanner />
      <ForbiddenToastBridge />
      <a href="#main-content" className="skip-link">Pular para o conteúdo</a>
      {token && <CommandPalette />}
      {token && <KeyboardShortcutsHelp />}
      <div className="app">
        {token && (
          <Sidebar
            isCollapsed={isCollapsed}
            setIsCollapsed={setIsCollapsed}
            theme={theme}
            onToggleTheme={toggleTheme}
            highContrast={highContrast}
            onToggleContrast={toggleContrast}
            onLogout={logout}
          />
        )}
        <div id="main-content" className={`main-content ${token && !isCollapsed ? '' : 'collapsed'}`}>
          <ErrorBoundary compact>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route
              path="/"
              element={token ? <Navigate to="/feed" /> : <Navigate to="/login" />}
            />
            <Route
              path="/login"
              element={token ? <Navigate to="/feed" /> : <Login setToken={setToken} />}
            />
            <Route
              path="/register"
              element={token ? <Navigate to="/feed" /> : <Register setToken={setToken} />}
            />
            <Route
              path="/feed"
              element={token ? <Feed /> : <Navigate to="/login" />}
            />
            <Route
              path="/feed/user/:userId"
              element={token ? <Feed /> : <Navigate to="/login" />}
            />
            <Route
              path="/feed/:postId"
              element={token ? <Feed /> : <Navigate to="/login" />}
            />
            <Route
              path="/explore"
              element={token ? <Explore /> : <Navigate to="/login" />}
            />
            <Route
              path="/explore/:tag"
              element={token ? <Explore /> : <Navigate to="/login" />}
            />
            <Route
              path="/messages"
              element={token ? <Messages /> : <Navigate to="/login" />}
            />
            <Route
              path="/messages/:conversationId"
              element={token ? <Messages /> : <Navigate to="/login" />}
            />
            <Route
              path="/notifications"
              element={token ? <Notifications /> : <Navigate to="/login" />}
            />
            <Route
              path="/profile"
              element={token ? <ProfilePage /> : <Navigate to="/login" />}
            />
            <Route
              path="/profile/:userId"
              element={token ? <ProfilePage /> : <Navigate to="/login" />}
            />
            <Route
              path="/chat"
              element={token ? <Chat /> : <Navigate to="/login" />}
            />
            {/* SIGS Routes */}
            <Route path="/sigs" element={<Navigate to="/feed" replace />} />
            <Route path="/notificacoes" element={token ? <CentroNotificacoes /> : <Navigate to="/login" />} />
            <Route path="/tarefas" element={token ? <TarefasList /> : <Navigate to="/login" />} />
            <Route path="/tarefas/apontamentos" element={token ? <ApontamentosAvulsosList /> : <Navigate to="/login" />} />
            <Route path="/tarefas/relatorio" element={token ? <RelatorioApontamentos /> : <Navigate to="/login" />} />
            <Route path="/tarefas/nova" element={token ? <TarefaForm /> : <Navigate to="/login" />} />
            <Route path="/tarefas/:id" element={token ? <TarefaForm /> : <Navigate to="/login" />} />
            <Route path="/cadastros" element={token ? <CadastrosList /> : <Navigate to="/login" />} />
            {/* SIGS FASE 2 */}
            <Route path="/indicadores" element={token ? <IndicadoresDashboard /> : <Navigate to="/login" />} />
            <Route path="/indicadores/config" element={token ? <IndicadoresConfigPage /> : <Navigate to="/login" />} />
            <Route path="/indicadores/ranking" element={token ? <Ranking /> : <Navigate to="/login" />} />
            <Route path="/indicadores/ano-fiscal" element={token ? <AnoFiscalList /> : <Navigate to="/login" />} />
            <Route path="/indicadores/risco" element={token ? <MetasRiscoReport /> : <Navigate to="/login" />} />
            <Route path="/indicadores/historico" element={token ? <MetaHistoricoPage /> : <Navigate to="/login" />} />
            <Route path="/indicadores/:id/distribuicao" element={token ? <MetaDistribuicaoPage /> : <Navigate to="/login" />} />
            <Route path="/projetos" element={token ? <ProjetosList /> : <Navigate to="/login" />} />
            <Route path="/projetos/categorias" element={token ? <ProjetoCategoriasList /> : <Navigate to="/login" />} />
            <Route path="/projetos/focco" element={token ? <FoccoPVList /> : <Navigate to="/login" />} />
            <Route path="/projetos/tarefas-fixas" element={token ? <ProjetoTarefasFixasList /> : <Navigate to="/login" />} />
            <Route path="/projetos/:id" element={token ? <ProjetoDetail /> : <Navigate to="/login" />} />
            <Route path="/reunioes" element={token ? <ReunioesList /> : <Navigate to="/login" />} />
            <Route path="/reunioes/tipos" element={token ? <TiposReuniaoList /> : <Navigate to="/login" />} />
            <Route path="/reunioes/:id" element={token ? <ReuniaoDetail /> : <Navigate to="/login" />} />
            <Route path="/documentos" element={token ? <DocumentosList /> : <Navigate to="/login" />} />
            <Route path="/documentos/categorias" element={token ? <CategoriaDocumentoList /> : <Navigate to="/login" />} />
            <Route path="/documentos/:id" element={token ? <DocumentoDetail /> : <Navigate to="/login" />} />
            <Route path="/planos-acao" element={token ? <PlanosList /> : <Navigate to="/login" />} />
            <Route path="/planos-acao/vencidos" element={token ? <PlanosVencidosReport /> : <Navigate to="/login" />} />
            <Route path="/planos-acao/novo" element={token ? <PlanoDetail /> : <Navigate to="/login" />} />
            <Route path="/planos-acao/:id" element={token ? <PlanoDetail /> : <Navigate to="/login" />} />
            {/* SIGS FASE 3 — Qualidade */}
            <Route path="/qualidade" element={token ? <QualidadeHub /> : <Navigate to="/login" />} />
            <Route path="/qualidade/rq03" element={token ? <RQ03List /> : <Navigate to="/login" />} />
            <Route path="/qualidade/rq03/:id" element={token ? <RQ03Detail /> : <Navigate to="/login" />} />
            <Route path="/qualidade/rq49" element={token ? <RQ49List /> : <Navigate to="/login" />} />
            <Route path="/qualidade/rq49/novo" element={token ? <RQ49Create /> : <Navigate to="/login" />} />
            <Route path="/qualidade/rq49/avaliacao-eficacia" element={token ? <AvaliacaoEficaciaList /> : <Navigate to="/login" />} />
            <Route path="/qualidade/rq49/:id" element={token ? <RQ49Detail /> : <Navigate to="/login" />} />
            <Route path="/qualidade/config/agentes-causadores" element={token ? <AgenteCausadorList /> : <Navigate to="/login" />} />
            <Route path="/qualidade/config/class-prim" element={token ? <ClassificacaoPrimariaList /> : <Navigate to="/login" />} />
            <Route path="/qualidade/config/class-sec" element={token ? <ClassificacaoSecundariaList /> : <Navigate to="/login" />} />
            <Route path="/qualidade/rq80" element={token ? <RQ80List /> : <Navigate to="/login" />} />
            <Route path="/qualidade/rq80/:id" element={token ? <RQ80Detail /> : <Navigate to="/login" />} />
            <Route path="/qualidade/rq94" element={token ? <RQ94List /> : <Navigate to="/login" />} />
            <Route path="/qualidade/rq94/:id" element={token ? <RQ94Detail /> : <Navigate to="/login" />} />
            <Route path="/qualidade/sst" element={token ? <SSTHub /> : <Navigate to="/login" />} />
            <Route path="/qualidade/sst/partes-corpo" element={token ? <SSTPartesCorpoList /> : <Navigate to="/login" />} />
            <Route path="/qualidade/sst/tipos-acidente" element={token ? <SSTTiposAcidenteList /> : <Navigate to="/login" />} />
            <Route path="/qualidade/fmea" element={token ? <FmeaList /> : <Navigate to="/login" />} />
            <Route path="/qualidade/fmea/:id" element={token ? <FmeaDetail /> : <Navigate to="/login" />} />
            <Route path="/qualidade/indicadores" element={token ? <IndicadoresQualidade /> : <Navigate to="/login" />} />
            <Route path="/qualidade/consolidado" element={token ? <QualidadeConsolidada /> : <Navigate to="/login" />} />
            {/* SIGS FASE 4 — Industrial */}
            <Route path="/fabricacao" element={token ? <FabricacaoList /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/instrumentos" element={token ? <InstrumentosList /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/cadastros" element={token ? <FabricacaoCadastroHub /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/cadastros/bitola-fio" element={token ? <BitolaFioList /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/cadastros/fabricante-fio" element={token ? <FabricanteFioList /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/cadastros/carcaca" element={token ? <CarcacaList /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/cadastros/cor-tinta" element={token ? <CorTintaList /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/dashboard" element={token ? <DashboardFabricacao /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/cadastros/forma-construtiva" element={token ? <FormaConstrutivalList /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/cadastros/tipo-cabo" element={token ? <TipoCaboList /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/cadastros/tipo-sensor" element={token ? <TipoSensorList /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/cadastros/tensao" element={token ? <TensaoList /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/cadastros/fornecedor" element={token ? <FornecedorFabList /> : <Navigate to="/login" />} />
            <Route path="/fabricacao/:id" element={token ? <ChecklistDetail /> : <Navigate to="/login" />} />
            <Route path="/assistencia" element={token ? <AssistenciaList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/:id" element={token ? <AssistenciaDetail /> : <Navigate to="/login" />} />
            <Route path="/assistencia/config/tipos-atn" element={token ? <TiposAtendimentoList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/config/status" element={token ? <StatusAtendimentoList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/config/permissoes-vw" element={token ? <PermissoesVisualizacaoList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/config/ace-cfg" element={token ? <AceCfgList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/config/usu-uni" element={token ? <UsuUniList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/config/usuarios" element={token ? <UsuarioASSList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/config/empresas" element={token ? <EmpresaASSList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/config/canais" element={token ? <CanaisEntradaList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/clientes" element={token ? <ClienteASSList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/config/params" element={token ? <ConfigParamsPage /> : <Navigate to="/login" />} />
            <Route path="/assistencia/config/tipos-ativ" element={token ? <TiposAtividadeList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/config/cat-tp-atn" element={token ? <CategTpAtnList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/config/funis" element={token ? <FunisAtendimentoList /> : <Navigate to="/login" />} />
            <Route path="/assistencia/dashboard" element={token ? <AssistenciaDashboard /> : <Navigate to="/login" />} />
            <Route path="/chamados" element={token ? <ChamadosList /> : <Navigate to="/login" />} />
            <Route path="/chamados/:id" element={token ? <ChamadoDetail /> : <Navigate to="/login" />} />
            {/* SIGS FASE 5 — Laboratório */}
            <Route path="/laboratorio" element={token ? <LaboratorioList /> : <Navigate to="/login" />} />
            <Route path="/laboratorio/dashboard" element={token ? <DashboardLabs /> : <Navigate to="/login" />} />
            <Route path="/laboratorio/tipos-teste" element={token ? <TiposTesteList /> : <Navigate to="/login" />} />
            <Route path="/laboratorio/bancadas" element={token ? <LabsBancadasList /> : <Navigate to="/login" />} />
            <Route path="/laboratorio/:id" element={token ? <LaboratorioDetail /> : <Navigate to="/login" />} />
            {/* Admin + Config */}
            <Route path="/admin/permissoes" element={token ? <PermissoesPage /> : <Navigate to="/login" />} />
            <Route path="/admin/usuarios" element={token ? <UsuariosSIGSPage /> : <Navigate to="/login" />} />
            <Route path="/admin/health" element={token ? <HealthCheckPage /> : <Navigate to="/login" />} />
            <Route path="/config" element={token ? <ConfigPage /> : <Navigate to="/login" />} />
            <Route path="/config/dominios" element={token ? <DominiosList /> : <Navigate to="/login" />} />
            {/* Motores / Engenharia */}
            <Route path="/motores" element={token ? <MotoresList /> : <Navigate to="/login" />} />
            <Route path="/motores/hub" element={token ? <MotoresHub /> : <Navigate to="/login" />} />
            <Route path="/motores/motores/:id" element={token ? <MotorDetail /> : <Navigate to="/login" />} />
            <Route path="/motores/bombas/:id" element={token ? <BombaDetail /> : <Navigate to="/login" />} />
            <Route path="/motores/fichas" element={token ? <FichasList /> : <Navigate to="/login" />} />
            <Route path="/motores/fichas/:id" element={token ? <FichaDetail /> : <Navigate to="/login" />} />
            <Route path="/motores/normas" element={token ? <NormasMotorList /> : <Navigate to="/login" />} />
            <Route path="/motores/fornecedores" element={token ? <FornecedorMotorList /> : <Navigate to="/login" />} />
            <Route path="/motores/sensores" element={token ? <SensoresMotorList /> : <Navigate to="/login" />} />
            <Route path="/motores/classes-protecao" element={token ? <ClasseProtecaoList /> : <Navigate to="/login" />} />
            <Route path="/motores/calculadora" element={token ? <CalculadoraPotencia /> : <Navigate to="/login" />} />
            <Route path="/motores/comparador" element={token ? <ComparadorMotores /> : <Navigate to="/login" />} />
            <Route path="/laudos" element={token ? <LaudosList /> : <Navigate to="/login" />} />
            <Route path="/laudos/dashboard" element={token ? <DashboardService /> : <Navigate to="/login" />} />
            <Route path="/laudos/autorizadas" element={token ? <AutorizadasList /> : <Navigate to="/login" />} />
            <Route path="/laudos/tipos-servico" element={token ? <TipoServicoChamadoList /> : <Navigate to="/login" />} />
            <Route path="/laudos/tipos-garantia" element={token ? <TipoGarantiaList /> : <Navigate to="/login" />} />
            <Route path="/laudos/:id" element={token ? <LaudoDetail /> : <Navigate to="/login" />} />
            <Route path="/chamados/categorias" element={token ? <ChamadosCategoriasPage /> : <Navigate to="/login" />} />
            <Route path="/biblioteca" element={token ? <BibliotecaList /> : <Navigate to="/login" />} />
            <Route path="/comunicacao" element={token ? <EventosList /> : <Navigate to="/login" />} />
            <Route path="/comunicacao/categorias" element={token ? <CategoriasComunicadoList /> : <Navigate to="/login" />} />
            <Route path="/comunicacao/meus-eventos" element={token ? <MeusEventos /> : <Navigate to="/login" />} />
            <Route path="/comunicacao/:id" element={token ? <EventoDetail /> : <Navigate to="/login" />} />
            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </div>
        {token && <BottomNav />}
      </div>
      <ToastContainer />
      </ToastProvider>
    </Router>
    </ErrorBoundary>
  );
};

export default App;

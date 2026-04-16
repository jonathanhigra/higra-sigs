/**
 * Motores — Calculadora de Potência de Bomba
 * Route: /motores/calculadora
 * Pure frontend math, no backend calls
 */
import { useState, useMemo } from 'react';
import '../tarefas/TarefasList.css';
import './CalculadoraPotencia.css';

const POTENCIAS_COMERCIAIS = [
  0.25, 0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3.0, 4.0, 5.5, 7.5,
  11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 185, 220, 250, 315,
];

const DEFAULTS = {
  vazao: '',
  altura_manometrica: '',
  rendimento_bomba: '75',
  rendimento_motor: '92',
  fator_seguranca: '15',
  densidade_fluido: '1000',
};

function potenciaComercial(kw) {
  return POTENCIAS_COMERCIAIS.find((p) => p >= kw) ?? POTENCIAS_COMERCIAIS[POTENCIAS_COMERCIAIS.length - 1];
}

function fmt(val, decimals = 2) {
  return isFinite(val) ? val.toFixed(decimals) : '—';
}

export default function CalculadoraPotencia() {
  const [inp, setInp] = useState(DEFAULTS);

  const set = (field) => (e) => setInp((prev) => ({ ...prev, [field]: e.target.value }));

  const result = useMemo(() => {
    const vazao = parseFloat(inp.vazao);
    const altura = parseFloat(inp.altura_manometrica);
    const rBomba = parseFloat(inp.rendimento_bomba) / 100;
    const rMotor = parseFloat(inp.rendimento_motor) / 100;
    const fSeg = parseFloat(inp.fator_seguranca) / 100;
    const densidade = parseFloat(inp.densidade_fluido);

    if (!vazao || !altura || !rBomba || !rMotor || !densidade) return null;

    const pHidW = (vazao / 3600) * densidade * 9.81 * altura / rBomba;
    const pMotW = pHidW / rMotor;
    const pInstW = pMotW * (1 + fSeg);

    const pHidKW = pHidW / 1000;
    const pMotKW = pMotW / 1000;
    const pInstKW = pInstW / 1000;

    return {
      pHidW, pHidKW,
      pMotW, pMotKW,
      pInstW, pInstKW,
      comercial: potenciaComercial(pInstKW),
    };
  }, [inp]);

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Calculadora de Potência de Bomba</h1>
      </div>

      <div className="calc-layout">
        {/* Inputs */}
        <div className="detail-card calc-inputs">
          <h3>Dados de Entrada</h3>

          <div className="form-group">
            <label>Vazão (m³/h) *</label>
            <input className="form-control" type="number" min="0" step="any" value={inp.vazao} onChange={set('vazao')} placeholder="Ex: 120" />
          </div>

          <div className="form-group">
            <label>Altura Manométrica (mCA) *</label>
            <input className="form-control" type="number" min="0" step="any" value={inp.altura_manometrica} onChange={set('altura_manometrica')} placeholder="Ex: 35" />
          </div>

          <div className="form-group">
            <label>Rendimento da Bomba (%)</label>
            <input className="form-control" type="number" min="1" max="100" step="any" value={inp.rendimento_bomba} onChange={set('rendimento_bomba')} />
          </div>

          <div className="form-group">
            <label>Rendimento do Motor (%)</label>
            <input className="form-control" type="number" min="1" max="100" step="any" value={inp.rendimento_motor} onChange={set('rendimento_motor')} />
          </div>

          <div className="form-group">
            <label>Fator de Segurança (%)</label>
            <input className="form-control" type="number" min="0" max="100" step="any" value={inp.fator_seguranca} onChange={set('fator_seguranca')} />
          </div>

          <div className="form-group">
            <label>Densidade do Fluido (kg/m³)</label>
            <input className="form-control" type="number" min="1" step="any" value={inp.densidade_fluido} onChange={set('densidade_fluido')} />
          </div>
        </div>

        {/* Results */}
        <div className="detail-card calc-results">
          <h3>Resultados</h3>

          {!result ? (
            <p className="calc-hint">Preencha os campos obrigatórios (Vazão e Altura Manométrica) para calcular.</p>
          ) : (
            <>
              <div className="calc-result-row">
                <span className="calc-result-label">Potência Hidráulica</span>
                <span className="calc-result-value">
                  {fmt(result.pHidW)} W<br />
                  <strong>{fmt(result.pHidKW)} kW</strong>
                </span>
              </div>

              <div className="calc-result-row">
                <span className="calc-result-label">Potência do Motor</span>
                <span className="calc-result-value">
                  {fmt(result.pMotW)} W<br />
                  <strong>{fmt(result.pMotKW)} kW</strong>
                </span>
              </div>

              <div className="calc-result-row">
                <span className="calc-result-label">Potência Instalada</span>
                <span className="calc-result-value">
                  {fmt(result.pInstW)} W<br />
                  <strong>{fmt(result.pInstKW)} kW</strong>
                </span>
              </div>

              <div className="calc-result-row calc-comercial">
                <span className="calc-result-label">Potência Comercial Sugerida</span>
                <span className="calc-result-value calc-comercial-val">
                  {result.comercial} kW
                </span>
              </div>

              <p className="calc-note">
                Fórmulas: P_hid = (Q/3600 × ρ × g × H) / η_bomba &nbsp;|&nbsp;
                P_motor = P_hid / η_motor &nbsp;|&nbsp;
                P_inst = P_motor × (1 + fs)
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

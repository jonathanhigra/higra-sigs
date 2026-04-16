/**
 * Motores — Comparador lado a lado
 * Route: /motores/comparador
 */
import { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { motorService } from '../../services/motores/motorService';
import '../tarefas/TarefasList.css';
import './ComparadorMotores.css';

// Fields shown in comparison table, in order
const CAMPOS = [
  { key: 'codigo',            label: 'Código' },
  { key: 'descricao',         label: 'Descrição' },
  { key: 'potencia',          label: 'Potência (kW)' },
  { key: 'tensao',            label: 'Tensão (V)' },
  { key: 'corrente',          label: 'Corrente (A)' },
  { key: 'rotacao',           label: 'Rotação (rpm)' },
  { key: 'frequencia',        label: 'Frequência (Hz)' },
  { key: 'carcaca',           label: 'Carcaça' },
  { key: 'classe_isolamento', label: 'Classe Isolamento' },
  { key: 'ip',                label: 'IP' },
  { key: 'peso',              label: 'Peso (kg)' },
  { key: 'eficiencia',        label: 'Eficiência (%)' },
];

// Fields where "higher is better" for highlighting
const HIGHER_IS_BETTER = new Set(['ip', 'classe_isolamento', 'eficiencia', 'potencia']);

// IE class order for comparison
const IE_ORDER = { IE1: 1, IE2: 2, IE3: 3, IE4: 4, IE5: 5 };

function numericVal(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(String(val).replace(/[^\d.]/g, ''));
  return isFinite(n) ? n : null;
}

function compareHigherIsBetter(key, v1, v2) {
  if (key === 'classe_isolamento') {
    const a = IE_ORDER[String(v1).toUpperCase()] ?? 0;
    const b = IE_ORDER[String(v2).toUpperCase()] ?? 0;
    if (a > b) return 1;
    if (b > a) return -1;
    return 0;
  }
  const a = numericVal(v1);
  const b = numericVal(v2);
  if (a === null || b === null) return 0;
  if (a > b) return 1;
  if (b > a) return -1;
  return 0;
}

function cellStyle(key, val, otherVal, colIndex) {
  if (!HIGHER_IS_BETTER.has(key)) return {};
  const cmp = compareHigherIsBetter(key, val, otherVal);
  // colIndex 0 = motor1, colIndex 1 = motor2
  const isBetter = colIndex === 0 ? cmp > 0 : cmp < 0;
  if (isBetter) return { background: 'var(--success-bg, #ecfdf5)', color: 'var(--success-color, #059669)', fontWeight: 600 };
  return {};
}

export default function ComparadorMotores() {
  const [motores, setMotores] = useState([]);
  const [motor1Id, setMotor1Id] = useState('');
  const [motor2Id, setMotor2Id] = useState('');
  const [motor1Data, setMotor1Data] = useState(null);
  const [motor2Data, setMotor2Data] = useState(null);
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const toast = useToast();

  useEffect(() => {
    motorService.listarMotores({ page_size: 200 })
      .then(({ data }) => setMotores(data.items || []))
      .catch(() => toast.error('Erro ao carregar lista de motores'));
  }, []);

  useEffect(() => {
    if (!motor1Id) { setMotor1Data(null); return; }
    setLoading1(true);
    motorService.obterMotor(motor1Id)
      .then(({ data }) => setMotor1Data(data))
      .catch(() => toast.error('Erro ao carregar motor 1'))
      .finally(() => setLoading1(false));
  }, [motor1Id]);

  useEffect(() => {
    if (!motor2Id) { setMotor2Data(null); return; }
    setLoading2(true);
    motorService.obterMotor(motor2Id)
      .then(({ data }) => setMotor2Data(data))
      .catch(() => toast.error('Erro ao carregar motor 2'))
      .finally(() => setLoading2(false));
  }, [motor2Id]);

  const bothSelected = motor1Data && motor2Data;

  return (
    <div className="tarefas-page">
      <div className="tarefas-header">
        <h1>Comparador de Motores</h1>
      </div>

      <div className="comp-selectors">
        <div className="form-group comp-selector-item">
          <label>Motor 1</label>
          <select className="form-control" value={motor1Id} onChange={(e) => setMotor1Id(e.target.value)}>
            <option value="">Selecione...</option>
            {motores.map((m) => (
              <option key={m.id} value={m.id} disabled={String(m.id) === String(motor2Id)}>
                {m.codigo ? `[${m.codigo}] ` : ''}{m.descricao}
              </option>
            ))}
          </select>
        </div>

        <div className="comp-vs">VS</div>

        <div className="form-group comp-selector-item">
          <label>Motor 2</label>
          <select className="form-control" value={motor2Id} onChange={(e) => setMotor2Id(e.target.value)}>
            <option value="">Selecione...</option>
            {motores.map((m) => (
              <option key={m.id} value={m.id} disabled={String(m.id) === String(motor1Id)}>
                {m.codigo ? `[${m.codigo}] ` : ''}{m.descricao}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(loading1 || loading2) && <p>Carregando dados dos motores...</p>}

      {!bothSelected && !loading1 && !loading2 && (
        <div className="empty-state">Selecione dois motores para comparar.</div>
      )}

      {bothSelected && (
        <table className="data-table comp-table">
          <thead>
            <tr>
              <th>Campo</th>
              <th>{motor1Data.codigo || motor1Data.descricao || 'Motor 1'}</th>
              <th>{motor2Data.codigo || motor2Data.descricao || 'Motor 2'}</th>
            </tr>
          </thead>
          <tbody>
            {CAMPOS.map(({ key, label }) => {
              const v1 = motor1Data[key] ?? '—';
              const v2 = motor2Data[key] ?? '—';
              return (
                <tr key={key}>
                  <td className="comp-field-label">{label}</td>
                  <td style={cellStyle(key, v1, v2, 0)}>{String(v1)}</td>
                  <td style={cellStyle(key, v1, v2, 1)}>{String(v2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

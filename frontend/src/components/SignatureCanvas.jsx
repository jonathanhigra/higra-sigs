/**
 * SignatureCanvas — Componente de assinatura digital touch/mouse (tarefa 252)
 * Props:
 *   onSave: (base64: string) => void — chamado com PNG base64 ao salvar
 *   onClear: () => void — chamado ao limpar
 *   width: number (default 400)
 *   height: number (default 160)
 *   label: string (default 'Assine aqui')
 */
import { useRef, useEffect, useState } from 'react';

export default function SignatureCanvas({ onSave, onClear, width = 400, height = 160, label = 'Assine aqui' }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  function getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e) {
    e.preventDefault();
    drawing.current = true;
    const canvas = canvasRef.current;
    lastPos.current = getPos(e, canvas);
  }

  function draw(e) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasSignature(true);
  }

  function endDraw(e) {
    e.preventDefault();
    drawing.current = false;
    lastPos.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onClear?.();
  }

  function save() {
    const canvas = canvasRef.current;
    const dataUrl = canvas.toDataURL('image/png');
    onSave?.(dataUrl);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      <div style={{
        border: '1.5px solid var(--border)', borderRadius: 8, overflow: 'hidden',
        touchAction: 'none', cursor: 'crosshair', background: '#fff', width: '100%', maxWidth: width,
        position: 'relative',
      }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ display: 'block', width: '100%', height: 'auto' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasSignature && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#ccc', fontSize: 14, fontStyle: 'italic', pointerEvents: 'none',
          }}>
            {label}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button" onClick={clear}
          style={{ padding: '6px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}
        >Limpar</button>
        <button
          type="button" onClick={save} disabled={!hasSignature}
          style={{ padding: '6px 16px', borderRadius: 7, border: 'none', cursor: hasSignature ? 'pointer' : 'not-allowed', background: hasSignature ? 'var(--accent)' : '#ccc', color: '#fff', fontSize: 13, fontWeight: 600, opacity: hasSignature ? 1 : 0.6 }}
        >Salvar Assinatura</button>
      </div>
    </div>
  );
}

/**
 * ImageLightbox — Visualizador de imagens com zoom e navegação
 * Usado em: AssistenciaDetail (P0427), LaboratorioDetail (P0426), etc.
 * Sem dependências externas. Suporta: zoom via scroll, prev/next, fechar com Esc.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import './ImageLightbox.css';

/**
 * @param {Object} props
 * @param {Array}  props.images   — [{src, caption, id}]
 * @param {number} props.index    — índice inicial (null = fechado)
 * @param {Function} props.onClose
 */
export default function ImageLightbox({ images, index, onClose }) {
  const [current, setCurrent] = useState(index ?? 0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);
  const imgRef = useRef(null);

  const open = index !== null && index !== undefined;

  useEffect(() => {
    if (open) { setCurrent(index); setZoom(1); setOffset({ x: 0, y: 0 }); }
  }, [index, open]);

  const resetZoom = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

  const prev = useCallback(() => {
    setCurrent(c => (c - 1 + images.length) % images.length);
    resetZoom();
  }, [images.length]);

  const next = useCallback(() => {
    setCurrent(c => (c + 1) % images.length);
    resetZoom();
  }, [images.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, prev, next]);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom(z => Math.min(5, Math.max(0.5, z + delta)));
  };

  const handleMouseDown = (e) => {
    if (zoom <= 1) return;
    setDragging(true);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  const handleMouseMove = (e) => {
    if (!dragging || !dragStart.current) return;
    setOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };

  const handleMouseUp = () => { setDragging(false); };

  if (!open || !images?.length) return null;

  const img = images[current];

  return (
    <div className="lb-overlay" onClick={onClose}>
      <div className="lb-container" onClick={e => e.stopPropagation()}>

        {/* Toolbar */}
        <div className="lb-toolbar">
          <div className="lb-counter">{current + 1} / {images.length}</div>
          {img.caption && <div className="lb-caption">{img.caption}</div>}
          <div className="lb-zoom-controls">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} title="Zoom −">−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(5, z + 0.25))} title="Zoom +">+</button>
            <button onClick={resetZoom} title="100%">⊙</button>
          </div>
          <a
            href={img.src}
            target="_blank"
            rel="noopener noreferrer"
            className="lb-download"
            title="Abrir em nova aba"
            onClick={e => e.stopPropagation()}
          >↗</a>
          <button className="lb-close" onClick={onClose} title="Fechar (Esc)">×</button>
        </div>

        {/* Image area */}
        <div
          className="lb-img-area"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
        >
          {images.length > 1 && (
            <button className="lb-nav lb-prev" onClick={prev} title="Anterior (←)">‹</button>
          )}

          <img
            ref={imgRef}
            src={img.src}
            alt={img.caption || `Imagem ${current + 1}`}
            className="lb-img"
            style={{
              transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
              transition: dragging ? 'none' : 'transform 0.15s ease',
            }}
            draggable={false}
          />

          {images.length > 1 && (
            <button className="lb-nav lb-next" onClick={next} title="Próxima (→)">›</button>
          )}
        </div>

        {/* Thumbnails strip (if > 1 image) */}
        {images.length > 1 && (
          <div className="lb-thumbs">
            {images.map((img, i) => (
              <button
                key={img.id ?? i}
                className={`lb-thumb ${i === current ? 'lb-thumb-active' : ''}`}
                onClick={() => { setCurrent(i); resetZoom(); }}
              >
                <img src={img.src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

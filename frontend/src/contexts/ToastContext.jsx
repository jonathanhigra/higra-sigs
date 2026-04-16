/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useState, useRef } from 'react';

const ToastContext = createContext(null);

const MAX_TOASTS = 5;

// Duração padrão por tipo (segundos)
const DEFAULT_DURATIONS = {
  success: 2500,
  info:    3000,
  warning: 4500,
  error:   5000,
};

let toastId = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timersRef.current[id];
    if (t) { clearTimeout(t); delete timersRef.current[id]; }
  }, []);

  const addToast = useCallback((message, type = 'info', optionsOrDuration) => {
    // Compat: terceiro argumento pode ser número (duração) ou objeto de opções
    const opts = typeof optionsOrDuration === 'number'
      ? { duration: optionsOrDuration }
      : (optionsOrDuration || {});
    const duration = opts.duration != null ? opts.duration : DEFAULT_DURATIONS[type] || 3000;

    const id = ++toastId;
    const entry = {
      id,
      message,
      type,
      duration,
      action: opts.action,        // { label, onClick }
      dedupeKey: opts.dedupeKey,
    };

    setToasts((prev) => {
      // Dedupe: se já existe uma toast com o mesmo dedupeKey ou mesma mensagem+tipo, reutiliza
      const key = opts.dedupeKey || `${type}::${message}`;
      const existing = prev.findIndex(t => (t.dedupeKey || `${t.type}::${t.message}`) === key);
      if (existing !== -1) {
        // Recicla — limpa timer antigo, atualiza duração
        const old = prev[existing];
        const oldTimer = timersRef.current[old.id];
        if (oldTimer) { clearTimeout(oldTimer); delete timersRef.current[old.id]; }
        const next = [...prev];
        next[existing] = { ...old, ...entry, id: old.id }; // mantém ID antigo
        if (duration > 0) {
          timersRef.current[old.id] = setTimeout(() => removeToast(old.id), duration);
        }
        return next;
      }
      // Limita MAX_TOASTS (remove a mais antiga)
      let base = prev;
      if (prev.length >= MAX_TOASTS) {
        const dropped = prev[0];
        const dt = timersRef.current[dropped.id];
        if (dt) { clearTimeout(dt); delete timersRef.current[dropped.id]; }
        base = prev.slice(1);
      }
      if (duration > 0) {
        timersRef.current[id] = setTimeout(() => removeToast(id), duration);
      }
      return [...base, entry];
    });

    return id;
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');

  const { addToast, removeToast } = ctx;
  const toast = (msg, type, optsOrDur) => addToast(msg, type || 'info', optsOrDur);
  toast.success = (msg, opts) => addToast(msg, 'success', opts);
  toast.error   = (msg, opts) => addToast(msg, 'error',   opts);
  toast.info    = (msg, opts) => addToast(msg, 'info',    opts);
  toast.warning = (msg, opts) => addToast(msg, 'warning', opts);
  toast.remove  = removeToast;
  return toast;
};

export default ToastContext;

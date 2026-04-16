import { useEffect, useRef, useCallback, useState } from 'react';

const WS_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000')
  .replace(/^http/, 'ws');

export const useWebSocket = (onEvent) => {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const ws = new WebSocket(`${WS_BASE}/ws/social?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // Send ping every 30s to keep alive
        ws._pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'pong') {
            onEventRef.current?.(data);
          }
        } catch (error) {
          console.warn('Mensagem WebSocket invalida:', error);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (ws._pingInterval) clearInterval(ws._pingInterval);
        // Reconnect after 5s
        reconnectTimer.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (error) {
      console.error('Erro ao conectar WebSocket:', error);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        if (wsRef.current._pingInterval) clearInterval(wsRef.current._pingInterval);
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }, []);

  return { connected, send };
};

import { useEffect, useRef, useState, useCallback } from 'react';
import { SessionState } from '../types/session';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001';

export interface HistoryMessage { role: string; text: string; }

export function useWebSocket() {
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<{ sessionId: string; messages: HistoryMessage[] } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let ws: WebSocket;
    let retryTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'snapshot' || msg.type === 'update') setSessions(msg.sessions);
          if (msg.type === 'history') setHistory({ sessionId: msg.sessionId, messages: msg.messages });
        } catch (e) { console.error('WS parse error', e); }
      };
      ws.onclose = () => { setConnected(false); retryTimeout = setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => { clearTimeout(retryTimeout); ws?.close(); };
  }, []);

  const sendMessage = useCallback((sessionId: string, message: string) => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ type: 'send_message', sessionId, message }));
  }, []);

  const terminateSession = useCallback((sessionId: string) => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ type: 'terminate_session', sessionId }));
  }, []);

  const interruptSession = useCallback((sessionId: string) => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ type: 'interrupt', sessionId }));
  }, []);

  const startSession = useCallback((prompt: string, model?: string) => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ type: 'start_session', prompt, model }));
  }, []);

  const getHistory = useCallback((sessionId: string) => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ type: 'get_history', sessionId }));
  }, []);

  const clearHistory = useCallback(() => setHistory(null), []);

  return { sessions, sendMessage, terminateSession, interruptSession, startSession, getHistory, clearHistory, history, connected };
}

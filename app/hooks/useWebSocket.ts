import { useEffect, useRef, useState, useCallback } from 'react';
import { SessionState } from '../types/session';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001';

export interface HistoryMessage { role: string; text: string; }

export interface OrchestratorActivity {
  timestamp: number;
  sessionId: string;
  action: string;
  issues?: string[];
}

export interface OrchestratorStatus {
  ready: boolean;
  activity: OrchestratorActivity[];
}

export function useWebSocket() {
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState<{ sessionId: string; messages: HistoryMessage[] } | null>(null);
  const [orchestratorStatus, setOrchestratorStatus] = useState<OrchestratorStatus>({ ready: false, activity: [] });
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
          if (msg.type === 'review_result') {
            setSessions(prev => prev.map(s =>
              s.id === msg.sessionId
                ? { ...s, reviewState: msg.reviewState, reviewCount: msg.reviewCount, reviewIssues: msg.issues }
                : s
            ));
          }
          if (msg.type === 'orchestrator_status') {
            setOrchestratorStatus({ ready: msg.ready, activity: msg.activity });
          }
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

  const reviewSession = useCallback((sessionId: string) => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ type: 'review', sessionId }));
  }, []);

  const startSession = useCallback((prompt: string, model?: string) => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ type: 'start_session', prompt, model }));
  }, []);

  const getOrchestratorStatus = useCallback(() => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ type: 'get_orchestrator' }));
  }, []);

  const getHistory = useCallback((sessionId: string) => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ type: 'get_history', sessionId }));
  }, []);

  const clearHistory = useCallback(() => setHistory(null), []);

  return { sessions, sendMessage, terminateSession, interruptSession, reviewSession, startSession, getHistory, clearHistory, history, connected, orchestratorStatus, getOrchestratorStatus };
}

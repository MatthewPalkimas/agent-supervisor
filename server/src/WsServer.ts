import { WebSocketServer, WebSocket } from 'ws';
import { SessionState } from './SessionPoller';

export class WsServer {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();

  constructor(port: number) {
    this.wss = new WebSocketServer({ host: '0.0.0.0', port });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
    console.log(`[WS] WebSocket server listening on 0.0.0.0:${port}`);
  }

  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    ws.on('error', (err) => {
      console.error('[WS] client error:', err);
      this.clients.delete(ws);
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'send_message' && msg.sessionId && msg.message) {
          this.emit('sendMessage', { sessionId: msg.sessionId, message: msg.message });
        }
        if (msg.type === 'terminate_session' && msg.sessionId) {
          this.emit('terminateSession', { sessionId: msg.sessionId });
        }
        if (msg.type === 'start_session' && msg.prompt !== undefined) {
          this.emit('startSession', { prompt: msg.prompt, model: msg.model });
        }
        if (msg.type === 'get_history' && msg.sessionId) {
          this.emit('getHistory', { sessionId: msg.sessionId, ws });
        }
      } catch (e) {
        console.error('[WS] Failed to parse client message:', e);
      }
    });
    // Emit event so the main server can send a snapshot to this new client
    this.emit('newClient', ws);
  }

  sendSnapshot(ws: WebSocket, sessions: SessionState[]): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'snapshot', sessions }));
    }
  }

  broadcast(sessions: SessionState[]): void {
    const msg = JSON.stringify({ type: 'update', sessions });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  // Allow external code to listen for 'newClient' and other events
  on(event: string, listener: (...args: unknown[]) => void): this {
    this.wss.on(event as 'connection', listener as () => void);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    return this.wss.emit(event, ...args);
  }
}

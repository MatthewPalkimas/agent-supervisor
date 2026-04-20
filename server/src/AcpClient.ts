import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  method?: string;
  params?: unknown;
}

/**
 * ACP client that communicates with kiro-cli acp over JSON-RPC 2.0 stdin/stdout.
 *
 * Key protocol constraint: session/prompt is a BLOCKING call — the response
 * only arrives when the agent's entire turn is complete (all tool calls, model
 * responses, etc.). You CANNOT send a second session/prompt while one is in-flight.
 *
 * This class enforces that constraint with a prompt queue. If a prompt is sent
 * while another is in-flight, it's queued and dispatched when the current turn ends.
 */
export class AcpClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private buffer = '';
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
  }>();
  private sessionId: string | null = null;

  /** Whether a session/prompt call is currently in-flight (waiting for turn to end). */
  private promptInFlight = false;

  /** Queue of prompts waiting to be sent after the current turn completes. */
  private promptQueue: Array<{
    sessionId: string;
    message: string;
    resolve: () => void;
    reject: (e: Error) => void;
  }> = [];

  constructor(private model?: string) {
    super();
  }

  spawn(): void {
    const args = ['acp', '--trust-all-tools'];
    if (this.model) args.push('--model', this.model);
    this.process = spawn('kiro-cli', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.process.stderr!.on('data', (chunk: Buffer) => {
      console.error('[ACP stderr]', chunk.toString().trim());
    });

    this.process.stdout!.on('end', () => {
      console.log('[ACP] stdout closed');
    });

    this.process.on('exit', (code) => {
      console.log('[ACP] process exited with code', code);
      // Reject all pending requests so nothing hangs
      for (const [, { reject }] of this.pendingRequests) {
        reject(new Error(`ACP process exited with code ${code}`));
      }
      this.pendingRequests.clear();
      // Reject all queued prompts
      for (const queued of this.promptQueue) {
        queued.reject(new Error(`ACP process exited with code ${code}`));
      }
      this.promptQueue = [];
      this.promptInFlight = false;
      this.emit('exit', code);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg: JsonRpcResponse = JSON.parse(trimmed);
        this.handleMessage(msg);
      } catch (e) {
        console.error('[ACP] Failed to parse message:', trimmed, e);
      }
    }
  }

  private handleMessage(msg: JsonRpcResponse): void {
    if (msg.id !== undefined && this.pendingRequests.has(msg.id as number)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id as number)!;
      this.pendingRequests.delete(msg.id as number);
      if (msg.error) {
        console.error('[ACP] RPC error:', { code: msg.error.code, message: msg.error.message, data: msg.error.data, requestId: msg.id });
        reject(new Error(msg.error.message));
      } else {
        resolve(msg.result);
      }
    } else if (msg.method) {
      this.emit('notification', msg);
      if (msg.method === 'session/update') {
        const params = msg.params as {
          sessionId: string;
          update: { sessionUpdate: string; [key: string]: unknown };
        };
        if (params?.update?.sessionUpdate) {
          this.emit(params.update.sessionUpdate, params.update);
        }
      }
      if (msg.method === 'session/notification') {
        const params = msg.params as {
          sessionId: string;
          type: string;
          [key: string]: unknown;
        };
        if (params?.type) {
          this.emit(params.type, params);
        }
      }
    }
  }

  private send(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin?.writable) {
        console.error('[ACP] Cannot send, process not running. Method:', method);
        reject(new Error('ACP process not running'));
        return;
      }
      const id = ++this.requestId;
      const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this.pendingRequests.set(id, { resolve, reject });
      console.log('[ACP] →', method, `(id=${id})`);
      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  /** Send a JSON-RPC notification (no id, no response expected). */
  private notify(method: string, params?: unknown): void {
    if (!this.process?.stdin?.writable) {
      console.error('[ACP] Cannot notify, process not running. Method:', method);
      return;
    }
    const notification = { jsonrpc: '2.0', method, params };
    console.log('[ACP] → (notify)', method);
    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  async initialize(): Promise<void> {
    await this.send('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: 'agent-supervisor', version: '1.0.0' },
    });
  }

  async newSession(cwd?: string): Promise<string> {
    const result = (await this.send('session/new', {
      cwd: cwd ?? process.cwd(),
      mcpServers: [],
    })) as { sessionId: string };
    this.sessionId = result.sessionId;
    return this.sessionId;
  }

  /**
   * Send a prompt to the current session. This is a BLOCKING call —
   * it won't resolve until the agent's entire turn is complete.
   *
   * If another prompt is already in-flight, this queues the message
   * and resolves when it eventually gets sent and completes.
   */
  async prompt(message: string): Promise<void> {
    if (!this.sessionId) throw new Error('No active session');
    return this.enqueuePrompt(this.sessionId, message);
  }

  /**
   * Send a message to a session. If a prompt is in-flight, the message is queued
   * and will be sent once the current turn completes (or is cancelled).
   */
  async sendMessage(sessionId: string, message: string): Promise<void> {
    if (this.promptInFlight) {
      console.log('[ACP] Prompt in-flight, queueing message for session', sessionId.slice(0, 8));
    }
    return this.enqueuePrompt(sessionId, message);
  }

  /**
   * Interrupt the current in-flight operation by killing the ACP process.
   * The process exit handler will reject pending requests and clear the queue.
   * Callers should respawn if they need to send a follow-up message.
   */
  kill(): void {
    if (this.process && !this.process.killed) {
      console.log('[ACP] Killing process to interrupt');
      this.process.kill('SIGTERM');
    }
  }

  /**
   * Cancel queued prompts (does not interrupt the in-flight prompt).
   */
  clearQueue(): void {
    for (const queued of this.promptQueue) {
      queued.reject(new Error('Cancelled'));
    }
    this.promptQueue = [];
  }

  /**
   * Send session/cancel notification per ACP spec. The in-flight session/prompt
   * will resolve with stopReason: "cancelled", which unblocks the queue.
   */
  cancelSession(sessionId: string): void {
    console.log('[ACP] Sending cancel notification for session', sessionId.slice(0, 8));
    this.clearQueue();
    this.notify('session/cancel', { sessionId });
  }

  /**
   * Cancel/interrupt. Sends the cancel notification and clears the queue.
   */
  async cancel(sessionId: string): Promise<void> {
    this.cancelSession(sessionId);
  }

  /**
   * Core prompt serialization. Ensures only one session/prompt is in-flight
   * at a time per ACP process.
   */
  private enqueuePrompt(sessionId: string, message: string): Promise<void> {
    if (this.promptInFlight) {
      return new Promise<void>((resolve, reject) => {
        this.promptQueue.push({ sessionId, message, resolve, reject });
      });
    }
    return this.executePrompt(sessionId, message);
  }

  private executePrompt(sessionId: string, message: string): Promise<void> {
    this.promptInFlight = true;
    console.log('[ACP] Sending prompt to session', sessionId.slice(0, 8), '| message:', message.startsWith('Parse the following session logs') ? '<supervisor poll>' : message.slice(0, 100));
    return this.send('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: message }],
    }).then(() => {
      console.log('[ACP] Prompt completed for session', sessionId.slice(0, 8));
      this.promptInFlight = false;
      this.drainPromptQueue();
    }, (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Prompt already in progress')) {
        // Race condition — another prompt is still in-flight on the ACP side.
        // Re-queue but do NOT reset promptInFlight. The original in-flight RPC's
        // resolution will eventually trigger drainPromptQueue.
        console.log('[ACP] Prompt collision, requeueing for session', sessionId.slice(0, 8));
        return new Promise<void>((resolve, reject) => {
          this.promptQueue.push({ sessionId, message, resolve, reject });
        });
      }
      this.promptInFlight = false;
      this.drainPromptQueue();
      throw e;
    });
  }

  private drainPromptQueue(): void {
    if (this.promptInFlight || this.promptQueue.length === 0) return;
    const next = this.promptQueue.shift()!;
    this.executePrompt(next.sessionId, next.message)
      .then(next.resolve)
      .catch(next.reject);
  }

  async setModel(sessionId: string, modelId: string): Promise<void> {
    await this.send('session/set_model', { sessionId, modelId });
  }

  async resetSession(): Promise<string> {
    const result = (await this.send('session/new', {
      cwd: process.cwd(),
      mcpServers: [],
    })) as { sessionId: string };
    this.sessionId = result.sessionId;
    console.log('[ACP] Session reset, new ID:', this.sessionId.slice(0, 8));
    return this.sessionId;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isProcessAlive(): boolean {
    return this.process !== null && !this.process.killed;
  }
}

import { WebSocket } from 'ws';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AcpClient } from './AcpClient';
import { SessionPoller, SessionState } from './SessionPoller';
import { SupervisorPoller } from './Supervisor';
import { WsServer } from './WsServer';
import { spawnWorkerSession } from './WorkerSession';
import { Orchestrator, ReviewResult } from './Orchestrator';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL ?? '30000', 10);

const wsServer = new WsServer(PORT);
const filePoller = new SessionPoller();
let supervisorPoller: SupervisorPoller | null = null;
let currentAcp: AcpClient | null = null;
let usingSupervisor = false;

// Worker ACP clients keyed by real session ID — used for message routing
const workerClients = new Map<string, AcpClient>();

// Orchestrator agent for reviewing worker output
let orchestrator: Orchestrator | null = null;
// Tracks sessions currently being reviewed to avoid duplicate triggers
const reviewsInFlight = new Set<string>();

(async () => {
  try {
    orchestrator = new Orchestrator();
    orchestrator.on('activity', () => {
      if (!orchestrator) return;
      wsServer.broadcast(mergePending(getPollerSessions()), {
        type: 'orchestrator_status', ready: orchestrator.isReady(), activity: orchestrator.activityLog,
      });
    });
    await orchestrator.start();
    // Exclude the orchestrator's entire ACP process from both pollers — race-free,
    // covers session resets that happen between reviews.
    const orchPid = orchestrator.getPid();
    if (orchPid) {
      filePoller.addExcludePid(orchPid);
      (supervisorPoller as SupervisorPoller | null)?.addExcludePid(orchPid);
    }
  } catch (e) {
    console.error('[Server] Orchestrator failed to start:', e);
  }
})();

/** Build a sendToWorker function for a given session ID. */
function makeSendToWorker(sessionId: string) {
  return async (message: string) => {
    const workerAcp = workerClients.get(sessionId);
    if (workerAcp) {
      await workerAcp.sendMessage(sessionId, message);
    } else if (currentAcp) {
      await currentAcp.sendMessage(sessionId, message);
    }
  };
}

/** Trigger an auto-review for a session. Non-blocking — runs in background. */
function triggerAutoReview(sessionId: string): void {
  if (!orchestrator?.isReady() || reviewsInFlight.has(sessionId)) return;
  reviewsInFlight.add(sessionId);
  console.log(`[AutoReview] Triggering review for ${sessionId.slice(0, 8)}`);
  orchestrator.review(sessionId, makeSendToWorker(sessionId))
    .then(result => {
      console.log(`[AutoReview] ${sessionId.slice(0, 8)}: ${result.reviewState} (${result.reviewCount} reviews)`);
      wsServer.broadcast(mergePending(getPollerSessions()), { type: 'review_result', sessionId, ...result });
      // Also broadcast updated activity log
      wsServer.broadcast(mergePending(getPollerSessions()), {
        type: 'orchestrator_status', ready: true, activity: orchestrator!.activityLog,
      });
    })
    .catch(e => console.error(`[AutoReview] ${sessionId.slice(0, 8)} error:`, e))
    .finally(() => reviewsInFlight.delete(sessionId));
}

// Pending sessions waiting for their real session ID from spawnWorkerSession.
// Once the real ID arrives, we keep the entry until the poller picks it up with real data.
interface PendingSession {
  placeholder: SessionState;
  realId?: string;          // set once spawnWorkerSession resolves
  createdAt: number;
}
const pendingSessions = new Map<string, PendingSession>(); // keyed by tempId

/**
 * Get the best session data available.
 * The file poller provides real-time status (busy/idle) via fs.watch.
 * The supervisor provides AI assessments (summary, stuck detection).
 * When both are available, merge them: file poller status + supervisor enrichment.
 */
function getPollerSessions(): SessionState[] {
  const fileSessions = filePoller.getSessions();

  if (!usingSupervisor || !supervisorPoller) return fileSessions;

  const supervisorSessions = supervisorPoller.getSessions();
  const supervisorMap = new Map(supervisorSessions.map(s => [s.id, s]));

  // Start with file poller data (most up-to-date status), overlay supervisor enrichment
  return fileSessions.map(fs => {
    const sv = supervisorMap.get(fs.id);
    if (!sv) return fs;
    return {
      ...fs,
      // Keep file poller's real-time status, but use supervisor's enrichment
      summary: sv.summary || fs.summary,
      stuck: sv.stuck,
      nudged: sv.nudged,
      hasPendingTasks: sv.hasPendingTasks,
    };
  });
}

/**
 * Merge pending placeholders with poller results.
 * Rules:
 *  - If a pending session has no realId yet, always show the placeholder.
 *  - If it has a realId and the poller found that session with real data (summary/lastMessage),
 *    drop the pending entry entirely — the poller owns it now.
 *  - If it has a realId but the poller data is still empty, overlay placeholder info
 *    so the card stays stable.
 *  - Expire stale pending entries after 2 minutes as a safety net.
 */
function mergePending(sessions: SessionState[]): SessionState[] {
  if (pendingSessions.size === 0) return sessions;

  const now = Date.now();
  const result = [...sessions];
  const toDelete: string[] = [];

  for (const [tempId, pending] of pendingSessions) {
    // Safety: expire after 2 minutes
    if (now - pending.createdAt > 120_000) {
      toDelete.push(tempId);
      continue;
    }

    if (!pending.realId) {
      // Still spawning — show placeholder (not in poller results yet)
      // stableKey = tempId so React key stays constant through the transition
      result.unshift({
        ...pending.placeholder,
        stableKey: tempId,
        elapsedMs: now - pending.placeholder.startTime,
      });
      continue;
    }

    // We have a real ID — check if the poller has picked it up with meaningful data
    const polled = result.find(s => s.id === pending.realId);
    if (!polled) {
      // Poller hasn't seen it yet — show placeholder with the real ID but same stableKey
      result.unshift({
        ...pending.placeholder,
        id: pending.realId,
        stableKey: tempId,
        elapsedMs: now - pending.placeholder.startTime,
      });
    } else if (polled.summary || polled.lastMessage) {
      // Poller has real data — transfer stableKey one last time, then we're done
      polled.stableKey = tempId;
      toDelete.push(tempId);
    } else {
      // Poller found it but no real data yet — overlay placeholder info for stability
      polled.stableKey = tempId;
      polled.name = pending.placeholder.name;
      polled.status = polled.status === 'terminated' ? 'terminated' : 'starting';
      polled.summary = 'Initializing…';
      polled.model = pending.placeholder.model || polled.model;
    }
  }

  for (const id of toDelete) pendingSessions.delete(id);
  return result;
}

/** Broadcast current state (poller + pending) to all clients */
function broadcastAll(): void {
  wsServer.broadcast(mergePending(getPollerSessions()));
}

// --- WebSocket event handlers ---

wsServer.on('newClient', (ws: unknown) => {
  wsServer.sendSnapshot(ws as WebSocket, mergePending(getPollerSessions()));
});

wsServer.on('sendMessage', (payload: unknown) => {
  const { sessionId, message } = payload as { sessionId: string; message: string };
  const workerAcp = workerClients.get(sessionId);
  if (workerAcp) {
    workerAcp.sendMessage(sessionId, message).catch(e =>
      console.error('[Server] Failed to send message via worker:', e)
    );
  } else if (currentAcp) {
    currentAcp.sendMessage(sessionId, message).catch(e =>
      console.error('[Server] Failed to send message via supervisor:', e)
    );
  }
});

wsServer.on('interrupt', (payload: unknown) => {
  const { sessionId } = payload as { sessionId: string };
  const workerAcp = workerClients.get(sessionId);
  if (workerAcp) {
    workerAcp.cancelSession(sessionId);
  } else if (currentAcp) {
    currentAcp.cancelSession(sessionId);
  }
});

wsServer.on('review', async (payload: unknown) => {
  const { sessionId, ws } = payload as { sessionId: string; ws: WebSocket };
  if (!orchestrator?.isReady()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'review_result', sessionId, error: 'Orchestrator not ready' }));
    }
    return;
  }
  try {
    const result = await orchestrator.review(sessionId, makeSendToWorker(sessionId));
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'review_result', sessionId, ...result }));
    }
  } catch (e) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'review_result', sessionId, error: String(e) }));
    }
  }
});

wsServer.on('getOrchestrator', (payload: unknown) => {
  const { ws } = payload as { ws: WebSocket };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'orchestrator_status',
      ready: orchestrator?.isReady() ?? false,
      activity: orchestrator?.activityLog ?? [],
    }));
  }
});

wsServer.on('terminateSession', (payload: unknown) => {
  const { sessionId } = payload as { sessionId: string };
  const lockPath = path.join(os.homedir(), '.kiro', 'sessions', 'cli', `${sessionId}.lock`);
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (lock.pid) {
      process.kill(lock.pid, 'SIGTERM');
      console.log(`[Server] Terminated session ${sessionId.slice(0, 8)} (pid ${lock.pid})`);
    }
  } catch (e) {
    console.error('[Server] Failed to terminate session:', e);
  }
});

wsServer.on('startSession', (payload: unknown) => {
  const { prompt, model } = payload as { prompt: string; model?: string };
  const tempId = `pending-${Date.now()}`;
  const now = Date.now();

  const placeholder: SessionState = {
    id: tempId,
    name: prompt.trim() || 'New Session',
    status: 'starting',
    currentTask: 'kiro_default',
    lastMessage: '',
    summary: 'Initializing…',
    stuck: false,
    nudged: false,
    model: model ?? 'auto',
    startTime: now,
    elapsedMs: 0,
    lastActivityMs: now,
    hasPendingTasks: false,
  };

  pendingSessions.set(tempId, { placeholder, createdAt: now });
  broadcastAll();

  spawnWorkerSession(prompt, model)
    .then(({ sessionId, acp: workerAcp }) => {
      workerClients.set(sessionId, workerAcp);
      workerAcp.on('exit', () => workerClients.delete(sessionId));

      // Attach real ID so mergePending can transition cleanly
      const pending = pendingSessions.get(tempId);
      if (pending) pending.realId = sessionId;

      broadcastAll();
      supervisorPoller?.triggerPoll();
    })
    .catch(e => {
      pendingSessions.delete(tempId);
      broadcastAll();
      console.error('[Server] Failed to start worker session:', e);
    });
});

wsServer.on('getHistory', (payload: unknown) => {
  const { sessionId, ws } = payload as { sessionId: string; ws: WebSocket };
  const jsonlPath = path.join(os.homedir(), '.kiro', 'sessions', 'cli', `${sessionId}.jsonl`);
  const messages: Array<{ role: string; text: string }> = [];
  try {
    const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (ev.kind === 'AssistantMessage') {
          const text = (ev.data?.content ?? [])
            .filter((b: { kind: string }) => b.kind === 'text')
            .map((b: { data: unknown }) => String(b.data))
            .join('');
          if (text) messages.push({ role: 'assistant', text });
          // Extract tool calls
          for (const block of (ev.data?.content ?? [])) {
            if (block.kind === 'toolUse') {
              const name = block.data?.name ?? 'unknown';
              const purpose = block.data?.input?.__tool_use_purpose ?? '';
              messages.push({ role: 'tool', text: purpose ? `${name}: ${purpose}` : name });
            }
          }
        } else if (ev.kind === 'HumanMessage' || ev.kind === 'UserMessage' || ev.kind === 'Prompt') {
          const text = (ev.data?.content ?? [])
            .filter((b: { kind: string }) => b.kind === 'text')
            .map((b: { data: unknown }) => String(b.data))
            .join('');
          if (text) messages.push({ role: 'user', text });
        }
      } catch { /* skip */ }
    }
  } catch { /* file not found */ }
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'history', sessionId, messages }));
  }
});

// --- Pollers ---

filePoller.on('update', () => {
  if (!usingSupervisor) broadcastAll();
});

// When the file poller detects a status transition, trigger a supervisor poll
// so the AI assessment catches up quickly
filePoller.on('stateChange', () => {
  if (usingSupervisor) {
    broadcastAll(); // broadcast the raw status change immediately
    supervisorPoller?.triggerPoll(); // then get AI assessment
  }
});

// Per-session transitions feed the ReviewTracker for auto-review
filePoller.on('sessionTransition', (payload: unknown) => {
  const { sessionId, status } = payload as { sessionId: string; status: string };
  if (orchestrator?.isReady()) {
    const mappedStatus = status === 'busy' ? 'busy' : 'idle';
    const shouldReview = orchestrator.tracker.onStatusUpdate(sessionId, mappedStatus);
    if (shouldReview) {
      triggerAutoReview(sessionId);
    }
  }
});
filePoller.start(10000);

async function startSupervisor(): Promise<void> {
  const acp = new AcpClient();
  currentAcp = acp;

  acp.on('exit', (code: number) => {
    console.warn(`[Server] kiro-cli acp exited (${code}). Falling back to file poller. Reconnecting in 10s...`);
    usingSupervisor = false;
    supervisorPoller?.stop();
    filePoller.start(10000);
    setTimeout(() => startSupervisor().catch(console.error), 10000);
  });

  acp.spawn();
  await acp.initialize();
  await acp.newSession();
  console.log('[Server] Supervisor ACP session ready:', acp.getSessionId());

  // Exclude the supervisor's ACP process from the file poller — race-free across resets
  const supPid = acp.getPid();
  if (supPid) filePoller.addExcludePid(supPid);

  // Prime the supervisor with its role so it never tries to use tools
  await acp.prompt(
    'You are a JSON-only analysis assistant. Your sole job is to read session data I provide and respond with a JSON array. ' +
    'You have NO tools available — do not attempt to call any tools, list tools, or request tool access. ' +
    'Never mention tools like list_sessions or any other tool name. ' +
    'When I send session data, respond ONLY with a JSON array. Say "understood" now.'
  );
  await new Promise(r => setTimeout(r, 2000));

  supervisorPoller = new SupervisorPoller(acp, supPid ?? undefined);

  // Exclude orchestrator process from supervisor if it's already running
  const orchPid = orchestrator?.getPid();
  if (orchPid) supervisorPoller.addExcludePid(orchPid);

  supervisorPoller.on('update', () => {
    if (!usingSupervisor) {
      usingSupervisor = true;
      console.log('[Server] Supervisor active — file poller provides reactivity, supervisor provides AI assessment');
    }
    broadcastAll();
  });

  supervisorPoller.start(POLL_INTERVAL);
  console.log(`[Server] Supervisor polling every ${POLL_INTERVAL / 1000}s`);
}

startSupervisor()
  .then(() => console.log(`[Server] Agent Supervisor running on port ${PORT}`))
  .catch(e => console.error('[Server] Supervisor startup error:', e));

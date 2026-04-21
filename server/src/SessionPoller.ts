import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SessionState {
  id: string;
  /** Stable key for UI rendering — doesn't change during pending→real ID transition. */
  stableKey?: string;
  name: string;
  status: 'starting' | 'active' | 'idle' | 'busy' | 'terminated';
  currentTask: string;
  lastMessage: string;
  summary: string;
  stuck: boolean;
  nudged: boolean;
  model: string;
  startTime: number;
  elapsedMs: number;
  /** Timestamp (ms) of the last activity (last .jsonl write) */
  lastActivityMs: number;
  hasPendingTasks: boolean;
}

/**
 * Reactive session poller that uses fs.watch on the sessions directory
 * to detect changes instantly, with a fallback poll interval for safety.
 *
 * When a .jsonl or .json file changes, we re-read that session immediately
 * and broadcast. A debounce prevents spamming during rapid tool-call bursts.
 */
export class SessionPoller extends EventEmitter {
  private sessions = new Map<string, SessionState>();
  private sessionStartTimes = new Map<string, number>();
  private sessionsDir: string;

  // Timers
  private fallbackInterval: NodeJS.Timeout | null = null;
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs = 500;

  // Track previous status per session to detect transitions
  private prevStatus = new Map<string, string>();
  private excludeSessionIds = new Set<string>();

  constructor() {
    super();
    this.sessionsDir = path.join(os.homedir(), '.kiro', 'sessions', 'cli');
  }

  /** Exclude a session ID from results (e.g. the supervisor's own session) */
  setExcludeSessionId(id: string): void {
    this.excludeSessionIds.add(id);
  }

  start(fallbackIntervalMs = 10000): void {
    // Ensure directory exists
    if (!fs.existsSync(this.sessionsDir)) {
      try { fs.mkdirSync(this.sessionsDir, { recursive: true }); } catch { /* ignore */ }
    }

    // Initial full scan
    this.fullScan();

    // Watch for file changes — instant reactivity
    try {
      this.watcher = fs.watch(this.sessionsDir, { persistent: false }, (_event, filename) => {
        if (!filename) return;
        // Only care about .jsonl (activity) and .json (metadata) and .lock (alive/dead)
        if (filename.endsWith('.jsonl') || filename.endsWith('.json') || filename.endsWith('.lock')) {
          this.debouncedUpdate();
        }
      });
      console.log('[SessionPoller] Watching', this.sessionsDir);
    } catch (e) {
      console.warn('[SessionPoller] fs.watch unavailable, using poll-only mode:', e);
    }

    // Fallback poll for anything fs.watch might miss (e.g. process death)
    this.fallbackInterval = setInterval(() => this.fullScan(), fallbackIntervalMs);
  }

  stop(): void {
    if (this.fallbackInterval) { clearInterval(this.fallbackInterval); this.fallbackInterval = null; }
    if (this.watcher) { this.watcher.close(); this.watcher = null; }
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
  }

  /** Debounce rapid file changes (e.g. tool call bursts) into a single scan */
  private debouncedUpdate(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.fullScan();
    }, this.debounceMs);
  }

  private fullScan(): void {
    try {
      if (!fs.existsSync(this.sessionsDir)) return;

      const files = fs.readdirSync(this.sessionsDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      const now = Date.now();
      const cutoff = now - 4 * 60 * 60 * 1000;
      const updated = new Map<string, SessionState>();
      let hasChanges = false;

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.sessionsDir, file);
          const stat = fs.statSync(filePath);

          const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const id: string = raw.session_id;
          if (!id) continue;
          if (this.excludeSessionIds.has(id)) continue;

          // Check if process is alive
          const lockPath = path.join(this.sessionsDir, `${id}.lock`);
          let processAlive = false;
          if (fs.existsSync(lockPath)) {
            try {
              const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
              if (lock.pid) {
                try { process.kill(lock.pid, 0); processAlive = true; } catch { /* dead */ }
              }
            } catch { /* ignore */ }
          }

          // Skip old dead sessions, but never skip alive ones
          if (!processAlive && stat.mtimeMs < cutoff) continue;
          if (!processAlive) continue;

          if (!this.sessionStartTimes.has(id)) {
            const createdAt = raw.created_at ? new Date(raw.created_at).getTime() : stat.birthtimeMs;
            this.sessionStartTimes.set(id, createdAt);
          }
          const startTime = this.sessionStartTimes.get(id)!;

          const jsonlPath = path.join(this.sessionsDir, `${id}.jsonl`);
          const { lastKind, lastText, hasUnresolvedTool } = this.readLastJsonlEvents(jsonlPath);
          let lastActivityMs = now;
          try { lastActivityMs = fs.statSync(jsonlPath).mtimeMs; } catch { /* use now */ }

          const status: SessionState['status'] = (hasUnresolvedTool || lastKind === 'ToolResults') ? 'busy' : 'idle';
          const title = raw.title ?? `Session ${id.slice(0, 8)}`;
          const agentName: string = raw.session_state?.agent_name ?? 'kiro';

          // Detect status transitions
          const prev = this.prevStatus.get(id);
          if (prev !== status) {
            hasChanges = true;
            this.prevStatus.set(id, status);
            // Emit per-session transition so listeners can react to individual changes
            this.emit('sessionTransition', { sessionId: id, status, previousStatus: prev ?? 'unknown' });
          }

          updated.set(id, {
            id,
            name: title,
            status,
            currentTask: agentName,
            lastMessage: lastText.slice(0, 200),
            summary: '',
            stuck: false,
            nudged: false,
            model: raw.session_state?.rts_model_state?.model_info?.model_id ?? '',
            startTime,
            elapsedMs: now - startTime,
            lastActivityMs,
            hasPendingTasks: false,
          });
        } catch { /* skip */ }
      }

      // Detect sessions that disappeared (terminated)
      for (const id of this.sessions.keys()) {
        if (!updated.has(id)) {
          hasChanges = true;
          this.prevStatus.delete(id);
        }
      }

      // Detect new sessions
      for (const id of updated.keys()) {
        if (!this.sessions.has(id)) hasChanges = true;
      }

      this.sessions = updated;

      // Always emit on first scan or when there are changes
      // (also emit periodically from fallback to keep elapsed times fresh)
      this.emit('update', this.getSessions());

      if (hasChanges) {
        this.emit('stateChange', this.getSessions());
      }
    } catch (e) {
      console.error('[SessionPoller] scan error:', e);
    }
  }

  private readLastJsonlEvents(jsonlPath: string): { lastKind: string; lastText: string; hasUnresolvedTool: boolean } {
    try {
      const content = fs.readFileSync(jsonlPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      if (!lines.length) return { lastKind: '', lastText: '', hasUnresolvedTool: false };

      const recent = lines.slice(-10).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      if (!recent.length) return { lastKind: '', lastText: '', hasUnresolvedTool: false };

      const last = recent[recent.length - 1];
      const lastKind: string = last?.kind ?? '';

      let lastText = '';
      for (let i = recent.length - 1; i >= 0; i--) {
        const ev = recent[i];
        if (ev?.kind === 'AssistantMessage') {
          const textBlock = (ev.data?.content ?? []).find((c: { kind: string }) => c.kind === 'text');
          if (textBlock?.data) { lastText = textBlock.data; break; }
        }
      }

      let hasUnresolvedTool = false;
      const lastAssistantIdx = [...recent].reverse().findIndex(e => e?.kind === 'AssistantMessage');
      if (lastAssistantIdx >= 0) {
        const actualIdx = recent.length - 1 - lastAssistantIdx;
        const lastAssistant = recent[actualIdx];
        const hasToolUse = (lastAssistant?.data?.content ?? []).some((c: { kind: string }) => c.kind === 'toolUse');
        const hasToolResultAfter = recent.slice(actualIdx + 1).some(e => e?.kind === 'ToolResults');
        hasUnresolvedTool = hasToolUse && !hasToolResultAfter;
      }

      return { lastKind, lastText, hasUnresolvedTool };
    } catch {
      return { lastKind: '', lastText: '', hasUnresolvedTool: false };
    }
  }

  getSessions(): SessionState[] {
    const now = Date.now();
    return Array.from(this.sessions.values())
      .filter(s => !this.excludeSessionIds.has(s.id))
      .map(s => ({ ...s, elapsedMs: now - s.startTime }));
  }
}

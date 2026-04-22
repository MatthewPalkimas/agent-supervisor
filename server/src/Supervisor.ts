import { EventEmitter } from 'events';
import { AcpClient } from './AcpClient';
import { SessionState } from './SessionPoller';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface RawSession {
  id: string; name: string; agent: string; alive: boolean;
  recentActivity: string; lastMessage: string;
  lastToolCalls: string[]; lastEventKind: string;
  model: string;
}

type Assessment = { id: string; status: string; summary: string; stuck: boolean };

export class SupervisorPoller extends EventEmitter {
  private pollInterval: NodeJS.Timeout | null = null;
  private responseBuffer = '';
  private sessions: SessionState[] = [];
  private sessionStartTimes = new Map<string, number>();
  private consecutiveIdlePolls = 0;
  private watching = false;
  private watcher: fs.FSWatcher | null = null;
  private intervalMs = 30000;
  private sessionsDir = path.join(os.homedir(), '.kiro', 'sessions', 'cli');

  private excludePids: Set<number>;

  constructor(private acp: AcpClient, supervisorPid?: number) {
    super();
    this.excludePids = new Set(supervisorPid ? [supervisorPid] : []);
    this.acp.on('agent_message_chunk', (u: { content?: { text?: string } }) => {
      if (u.content?.text) this.responseBuffer += u.content.text;
    });
  }

  addExcludePid(pid: number): void {
    this.excludePids.add(pid);
  }

  /** Check if `pid` is an excluded PID or a descendant of one. */
  private isExcludedProcess(pid: number): boolean {
    let cur: number | null = pid;
    for (let depth = 0; depth < 5 && cur != null && cur > 1; depth++) {
      if (this.excludePids.has(cur)) return true;
      try {
        const txt: string = fs.readFileSync(`/proc/${cur}/status`, 'utf8');
        const match: RegExpMatchArray | null = txt.match(/^PPid:\s*(\d+)/m);
        cur = match ? parseInt(match[1], 10) : null;
      } catch { return false; }
    }
    return false;
  }

  start(intervalMs = 30000): void {
    this.intervalMs = intervalMs;
    this.poll();
    this.pollInterval = setInterval(() => this.poll(), intervalMs);
  }

  triggerPoll(): void {
    // Small delay to avoid race conditions with newly started sessions
    setTimeout(() => this.poll(), 3000);
  }

  stop(): void {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
    if (this.watcher) { this.watcher.close(); this.watcher = null; }
    this.watching = false;
  }

  getSessions(): SessionState[] {
    const now = Date.now();
    return this.sessions.map(s => ({ ...s, elapsedMs: now - s.startTime }));
  }

  private enterWatchMode(): void {
    if (this.watching) return;
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
    this.watching = true;
    console.log('[SupervisorPoller] All idle — switching to watch mode');

    try {
      this.watcher = fs.watch(this.sessionsDir, { persistent: false }, (_, filename) => {
        if (!this.watching) return;
        if (!filename) return;
        console.log('[SupervisorPoller] Activity detected — resuming polling');
        this.exitWatchMode();
        this.poll();
      });
    } catch (e) {
      // fs.watch not available, fall back to slow polling
      console.warn('[SupervisorPoller] fs.watch unavailable, using slow poll fallback');
      this.pollInterval = setInterval(() => this.poll(), 60000);
      this.watching = false;
    }
  }

  private exitWatchMode(): void {
    if (this.watcher) { this.watcher.close(); this.watcher = null; }
    this.watching = false;
    this.consecutiveIdlePolls = 0;
    this.pollInterval = setInterval(() => this.poll(), this.intervalMs);
  }

  private async poll(): Promise<void> {
    const all = this.gatherSessionData();
    if (!all.length) return;
    const alive = all.filter(s => s.alive);
    const terminated = all.filter(s => !s.alive);
    this.responseBuffer = '';
    if (!alive.length) { this.buildAndEmit([], terminated); return; }

    const blocks = alive.map(s =>
      `SESSION ${s.id.slice(0, 8)}\n  Title: ${s.name.slice(0, 50)}\n  Agent: ${s.agent}\n  Last event: ${s.lastEventKind}\n  Tools: ${s.lastToolCalls.slice(-3).join(', ') || 'none'}\n  Activity:\n${s.recentActivity}`
    ).join('\n---\n');

    // Cap total prompt to avoid internal errors from kiro-cli acp
    const MAX_PROMPT = 4000;
    const header = `Parse the following session logs and return a JSON array. No tools are available. Respond with ONLY the JSON array, nothing else.\n\nSessions:\n\n`;
    const footer = `\n\nOutput format — respond with ONLY this JSON array, no other text:\n[{"id":"<8-char id from above>","status":"busy"|"idle","summary":"<1 sentence>","stuck":true|false}]\n\nField rules: status="busy" if tools are running, else "idle". summary=what the session is doing. stuck=true if error loops or repeated tool calls.`;
    const maxBlocks = MAX_PROMPT - header.length - footer.length;
    const prompt = header + blocks.slice(0, maxBlocks) + footer;
    console.log(`[SupervisorPoller] Prompt size: ${prompt.length} chars for ${alive.length} sessions`);
    try {
      await this.acp.prompt(prompt);
      await this.processResponse(this.responseBuffer, alive, terminated);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Internal error')) {
        // Context too large — compact and retry once
        console.log('[SupervisorPoller] Context too large, compacting...');
        try {
          this.responseBuffer = '';
          await this.acp.prompt('/compact');
          await new Promise(r => setTimeout(r, 2000)); // wait for compaction
          this.responseBuffer = '';
          await this.acp.prompt(prompt);
          await this.processResponse(this.responseBuffer, alive, terminated);
        } catch (e2) {
          console.error('[SupervisorPoller] Retry after compact failed:', e2);
          this.buildAndEmit(alive, terminated);
        }
      } else {
        console.error('[SupervisorPoller] poll error:', e);
        this.buildAndEmit(alive, terminated);
      }
    }
  }

  private async processResponse(text: string, alive: RawSession[], terminated: RawSession[]): Promise<void> {
    // Extract JSON array by finding balanced brackets — the LLM sometimes adds
    // commentary before/after the JSON, or the response contains other brackets.
    const jsonArray = this.extractJsonArray(text);
    if (!jsonArray) {
      console.log('[SupervisorPoller] No valid JSON array in response, using fallback. Response:', text.slice(0, 200));
      this.buildAndEmit(alive, terminated);
      return;
    }
    try {
      const assessments: Assessment[] = JSON.parse(jsonArray);

      const now = Date.now();
      const aliveSessions: SessionState[] = alive.map(s => {
        if (!this.sessionStartTimes.has(s.id)) this.sessionStartTimes.set(s.id, now);
        const startTime = this.sessionStartTimes.get(s.id)!;
        const a = assessments.find(x => s.id.startsWith(x.id) || x.id.startsWith(s.id.slice(0, 8)));
        return {
          id: s.id, name: s.name,
          status: (a?.status as SessionState['status']) ?? (s.lastEventKind === 'ToolResults' ? 'busy' : 'idle'),
          currentTask: s.agent, lastMessage: s.lastMessage,
          summary: a?.summary ?? '', stuck: a?.stuck ?? false,
          nudged: false,
          model: s.model,
          startTime, elapsedMs: now - startTime, lastActivityMs: now, hasPendingTasks: false,
        };
      });

      const terminatedSessions = this.buildTerminated(terminated, now);
      this.sessions = [...aliveSessions, ...terminatedSessions];

      const busy = aliveSessions.filter(s => s.status === 'busy').length;
      const stuck = aliveSessions.filter(s => s.stuck).length;
      console.log(`[SupervisorPoller] ${aliveSessions.length} alive (${busy} busy${stuck ? `, ${stuck} stuck` : ''}), ${terminatedSessions.length} terminated`);
      this.emit('update', this.getSessions());

      // Adaptive polling: enter watch mode after 2 consecutive polls with no active work
      // "no active work" = all sessions are idle or stuck (nothing is progressing)
      const noActiveWork = aliveSessions.length > 0 && aliveSessions.every(s => s.status === 'idle' || s.stuck);
      if (noActiveWork) {
        this.consecutiveIdlePolls++;
        if (this.consecutiveIdlePolls >= 2) this.enterWatchMode();
      } else {
        this.consecutiveIdlePolls = 0;
        if (this.watching) this.exitWatchMode();
      }
    } catch (e) {
      console.error('[SupervisorPoller] parse error:', e);
      this.buildAndEmit(alive, terminated);
    }
  }

  private buildAndEmit(alive: RawSession[], terminated: RawSession[]): void {
    const now = Date.now();
    const aliveSessions: SessionState[] = alive.map(s => {
      if (!this.sessionStartTimes.has(s.id)) this.sessionStartTimes.set(s.id, now);
      const startTime = this.sessionStartTimes.get(s.id)!;
      return {
        id: s.id, name: s.name,
        status: s.lastEventKind === 'ToolResults' ? 'busy' : 'idle',
        currentTask: s.agent, lastMessage: s.lastMessage,
        summary: '', stuck: false, nudged: false, model: s.model,
        startTime, elapsedMs: now - startTime, lastActivityMs: now, hasPendingTasks: false,
      };
    });
    this.sessions = [...aliveSessions, ...this.buildTerminated(terminated, now)];
    this.emit('update', this.getSessions());

    const noActiveWork = aliveSessions.length > 0 && aliveSessions.every(s => s.status === 'idle' || s.stuck);
    if (noActiveWork) {
      this.consecutiveIdlePolls++;
      if (this.consecutiveIdlePolls >= 2) this.enterWatchMode();
    } else {
      this.consecutiveIdlePolls = 0;
    }
  }

  private buildTerminated(terminated: RawSession[], now: number): SessionState[] {
    return terminated.map(s => {
      if (!this.sessionStartTimes.has(s.id)) this.sessionStartTimes.set(s.id, now);
      const startTime = this.sessionStartTimes.get(s.id)!;
      return {
        id: s.id, name: s.name, status: 'terminated' as const,
        currentTask: s.agent, lastMessage: s.lastMessage,
        summary: '', stuck: false, nudged: false, model: s.model,
        startTime, elapsedMs: now - startTime, lastActivityMs: now, hasPendingTasks: false,
      };
    });
  }

  /**
   * Extract a JSON array from LLM response text. Handles cases where the LLM
   * wraps the JSON in markdown code fences or adds commentary around it.
   */
  private extractJsonArray(text: string): string | null {
    // Try 1: Look for ```json ... ``` fenced block
    const fenced = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (fenced) {
      try { JSON.parse(fenced[1]); return fenced[1]; } catch { /* fall through */ }
    }

    // Try 2: Find the first '[' and walk forward counting brackets to find the matching ']'
    const start = text.indexOf('[');
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '[') depth++;
      if (ch === ']') { depth--; if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { return null; }
      }}
    }
    return null;
  }

  private gatherSessionData(): RawSession[] {
    const sessionsDir = path.join(os.homedir(), '.kiro', 'sessions', 'cli');
    const result: RawSession[] = [];
    const cutoff = Date.now() - 4 * 60 * 60 * 1000;
    try {
      for (const file of fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'))) {
        try {
          const fp = path.join(sessionsDir, file);
          const fileMtime = fs.statSync(fp).mtimeMs;
          const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
          const id: string = raw.session_id;
          if (!id) continue;

          let alive = false;
          let lockPid: number | null = null;
          const lockPath = path.join(sessionsDir, `${id}.lock`);
          if (fs.existsSync(lockPath)) {
            try {
              const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
              if (lock.pid) {
                lockPid = lock.pid;
                try { process.kill(lock.pid, 0); alive = true; } catch { /* dead */ }
              }
            } catch { /* ignore */ }
          }

          // Skip sessions owned by excluded processes (supervisor, orchestrator)
          if (lockPid != null && this.isExcludedProcess(lockPid)) continue;

          // Only skip old sessions if they're not alive
          if (!alive && fileMtime < cutoff) continue;

          let lastEventKind = '', lastMessage = '';
          const lastToolCalls: string[] = [], activityLines: string[] = [];
          let unresolvedToolName = '';
          let lastEventTimestamp = 0;
          const jsonlPath = path.join(sessionsDir, `${id}.jsonl`);
          if (fs.existsSync(jsonlPath)) {
            // Use file mtime as proxy for when the last event was written
            lastEventTimestamp = fs.statSync(jsonlPath).mtimeMs;
            const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean).slice(-15);
            let lastAssistantIdx = -1;
            const parsed = lines.map(l => { try { return JSON.parse(l); } catch { return null; } });

            for (let i = parsed.length - 1; i >= 0; i--) {
              const ev = parsed[i];
              if (!ev) continue;
              if (!lastEventKind) lastEventKind = ev.kind ?? '';
              if (ev.kind === 'AssistantMessage' && lastAssistantIdx === -1) lastAssistantIdx = i;
            }

            // Check for unresolved tool call in last AssistantMessage
            if (lastAssistantIdx >= 0) {
              const lastAssistant = parsed[lastAssistantIdx];
              const hasToolResultAfter = parsed.slice(lastAssistantIdx + 1).some(e => e?.kind === 'ToolResults');
              if (!hasToolResultAfter) {
                for (const b of (lastAssistant?.data?.content ?? []) as Array<{ kind: string; data: unknown }>) {
                  if (b.kind === 'toolUse') {
                    const td = b.data as { name?: string; input?: Record<string, unknown> };
                    unresolvedToolName = td?.name ?? 'unknown';
                  }
                }
              }
            }

            // Extract last message from the most recent AssistantMessage (found by backward scan)
            if (lastAssistantIdx >= 0) {
              const lastAssistant = parsed[lastAssistantIdx];
              for (const b of (lastAssistant?.data?.content ?? []) as Array<{ kind: string; data: unknown }>) {
                if (b.kind === 'text') { lastMessage = String(b.data).slice(0, 200); break; }
              }
            }

            for (const ev of parsed) {
              if (!ev) continue;
              const kind: string = ev.kind ?? '';
              if (kind === 'AssistantMessage') {
                for (const b of (ev.data?.content ?? []) as Array<{ kind: string; data: unknown }>) {
                  if (b.kind === 'text') {
                    activityLines.push(`  [assistant] ${String(b.data).slice(0, 80)}`);
                  }                  if (b.kind === 'toolUse') {
                    const td = b.data as { name?: string; input?: Record<string, unknown> };
                    lastToolCalls.push(td?.name ?? 'unknown');
                    const isUnresolved = td?.name === unresolvedToolName;
                    const elapsedNote = isUnresolved && lastEventTimestamp
                      ? ` (running for ${Math.round((Date.now() - lastEventTimestamp) / 60000)}m, still in progress)`
                      : '';
                    activityLines.push(`  [tool] ${td?.name}: ${JSON.stringify(td?.input ?? {}).slice(0, 50)}${elapsedNote}`);
                  }
                }
              } else if (kind === 'ToolResults') {
                for (const b of (ev.data?.content ?? []) as Array<{ kind: string; data: unknown }>) {
                  if (b.kind === 'toolResult') {
                    const rd = b.data as { content?: Array<{ data: unknown }> };
                    const txt = (rd?.content ?? []).map((c: { data: unknown }) => JSON.stringify(c.data).slice(0, 40)).join(' ');
                    if (txt) activityLines.push(`  [result] ${txt}`);
                  }
                }
              }
            }
          }

          result.push({
            id,
            name: (raw.title ?? `Session ${id.slice(0, 8)}`).slice(0, 80),
            agent: raw.session_state?.agent_name ?? 'kiro',
            model: raw.session_state?.rts_model_state?.model_info?.model_id ?? '',
            alive,
            recentActivity: activityLines.slice(-5).join('\n') || '  (no recent activity)',
            lastMessage,
            lastToolCalls: [...new Set(lastToolCalls)].slice(-5),
            lastEventKind,
          });
        } catch { /* skip */ }
      }
    } catch (e) {
      console.error('[SupervisorPoller] gatherSessionData error:', e);
    }
    return result;
  }
}

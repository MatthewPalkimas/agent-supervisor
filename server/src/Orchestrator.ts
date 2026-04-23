import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import { AcpClient } from './AcpClient';
import { ReviewTracker, ReviewState } from './ReviewTracker';

const SYSTEM_PROMPT = `You are an orchestrator agent that reviews other coding agents' work. Your job:

1. Read the session context I provide (original task, git diff, errors, conversation tail)
2. Evaluate whether the agent completed its task correctly
3. If there are problems, compose a clear, actionable corrective message

Review checklist:
- Does the code solve the ORIGINAL TASK stated at the top?
- Are there build or test errors in the session that were never resolved?
- Are there obvious bugs, missing error handling, or logic errors?
- Did the agent leave TODOs or incomplete sections?
- Did it break existing functionality?

Respond with ONLY a JSON object:
{"verdict":"pass"|"fail","message":"<corrective instruction for the agent, empty if pass>","issues":["<short issue descriptions>"]}

If verdict=fail, the message must be a direct instruction telling the agent exactly what to fix. Be specific — reference file names, function names, and concrete problems.`;

export interface ReviewResult {
  verdict: string;
  issues: string[];
  message: string;
  reviewState: ReviewState;
  reviewCount: number;
}

export interface OrchestratorActivity {
  timestamp: number;
  sessionId: string;
  action: 'review_started' | 'review_passed' | 'correction_sent' | 'review_failed_max';
  issues?: string[];
}

export class Orchestrator extends EventEmitter {
  private acp: AcpClient;
  private sessionId: string | null = null;
  private ready = false;
  readonly tracker = new ReviewTracker();
  readonly activityLog: OrchestratorActivity[] = [];

  constructor() {
    super();
    this.acp = new AcpClient();
  }

  getSessionId(): string | null { return this.sessionId; }

  /** PID of the underlying kiro-cli acp process (for excluding its sessions from polling). */
  getPid(): number | null { return this.acp.getPid(); }

  async start(): Promise<void> {
    this.acp.spawn();
    await this.acp.initialize();
    this.sessionId = await this.acp.newSession();
    await this.acp.prompt(SYSTEM_PROMPT + '\n\nSay "ready" to confirm.');
    this.ready = true;
    console.log('[Orchestrator] Ready, session:', this.sessionId!.slice(0, 8));
  }

  isReady(): boolean { return this.ready; }

  /**
   * Review a worker session. If verdict is "fail" and under retry cap,
   * sends correction to the worker automatically.
   */
  async review(
    workerSessionId: string,
    sendToWorker: (message: string) => Promise<void>,
  ): Promise<ReviewResult> {
    if (!this.ready) throw new Error('Orchestrator not ready');

    this.tracker.markReviewing(workerSessionId);
    this.logActivity(workerSessionId, 'review_started');
    const history = this.loadHistory(workerSessionId);
    if (!history) {
      this.tracker.markPassed(workerSessionId);
      return this.result(workerSessionId);
    }

    // Reset context before each review to avoid cross-contamination
    try {
      this.sessionId = await this.acp.resetSession();
      await this.acp.prompt(SYSTEM_PROMPT + '\n\nSay "ready" to confirm.');
    } catch {
      console.warn('[Orchestrator] Failed to reset session, continuing with existing context');
    }

    await this.acp.prompt(`Review this agent session:\n\n${history}`);
    const response = this.getLastAssistantMessage();
    if (!response) {
      this.tracker.markPassed(workerSessionId);
      return this.result(workerSessionId);
    }

    try {
      // Try to extract JSON from response — handle code fences, prose wrapping, etc.
      const stripped = response.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');
      const jsonMatch = stripped.match(/\{[\s\S]*?"verdict"[\s\S]*?\}/);
      if (!jsonMatch) { this.tracker.markPassed(workerSessionId); return this.result(workerSessionId); }

      const parsed = JSON.parse(jsonMatch[0]) as { verdict: string; issues: string[]; message: string };

      if (parsed.verdict === 'fail' && parsed.message) {
        this.tracker.markCorrectionSent(workerSessionId, parsed.issues);
        const info = this.tracker.getInfo(workerSessionId);
        if (info.state !== 'failed_max_retries') {
          console.log(`[Orchestrator] ${workerSessionId.slice(0, 8)} failed review (${info.reviewCount}/${3}):`, parsed.issues);
          this.logActivity(workerSessionId, 'correction_sent', parsed.issues);
          await sendToWorker(parsed.message);
        } else {
          console.log(`[Orchestrator] ${workerSessionId.slice(0, 8)} hit max retries, not sending correction`);
          this.logActivity(workerSessionId, 'review_failed_max', parsed.issues);
        }
      } else {
        this.tracker.markPassed(workerSessionId);
        this.logActivity(workerSessionId, 'review_passed');
        console.log(`[Orchestrator] ${workerSessionId.slice(0, 8)} passed review`);
      }

      return this.result(workerSessionId);
    } catch {
      console.error('[Orchestrator] Failed to parse review response');
      this.tracker.markPassed(workerSessionId);
      return this.result(workerSessionId);
    }
  }

  private result(sessionId: string): ReviewResult {
    const info = this.tracker.getInfo(sessionId);
    return { verdict: info.state === 'passed' ? 'pass' : 'fail', issues: info.lastIssues, message: '', reviewState: info.state, reviewCount: info.reviewCount };
  }

  /**
   * Build a rich review context from the worker's JSONL:
   * 1. Original task (first user message)
   * 2. Git diff (from shell tool calls containing git diff output)
   * 3. Error signals (failed builds/tests from tool results)
   * 4. Conversation tail
   */
  private loadHistory(sessionId: string): string | null {
    const jsonlPath = path.join(os.homedir(), '.kiro', 'sessions', 'cli', `${sessionId}.jsonl`);
    let lines: string[];
    try {
      lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
    } catch { return null; }

    let originalTask = '';
    const errors: string[] = [];
    const modifiedFiles = new Set<string>();
    const tail: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let ev: Record<string, unknown>;
      try { ev = JSON.parse(lines[i]); } catch { continue; }

      const kind = ev.kind as string;
      const content = ((ev.data as Record<string, unknown>)?.content ?? []) as Array<{ kind: string; data: unknown }>;

      // 1. First user message = original task
      if (!originalTask && (kind === 'Prompt' || kind === 'HumanMessage' || kind === 'UserMessage')) {
        originalTask = content
          .filter(b => b.kind === 'text')
          .map(b => String(b.data))
          .join('');
      }

      // 2. Extract file paths from write/shell tool calls
      if (kind === 'AssistantMessage') {
        for (const b of content) {
          if (b.kind !== 'toolUse') continue;
          const td = b.data as { name?: string; input?: Record<string, unknown> };
          if (td?.name === 'write' && td.input?.path) {
            modifiedFiles.add(String(td.input.path));
          }
          if (td?.name === 'shell') {
            const cmd = String(td.input?.command ?? '');
            // Extract file paths from git add, common edit commands
            const gitAddMatch = cmd.match(/git\s+add\s+(.+)/);
            if (gitAddMatch) {
              gitAddMatch[1].split(/\s+/).forEach(f => { if (!f.startsWith('-')) modifiedFiles.add(f); });
            }
          }
        }
      }

      // 3. Scan tool results for errors
      if (kind === 'ToolResults') {
        for (const b of content) {
          if (b.kind !== 'toolResult') continue;
          const rd = b.data as { content?: Array<{ data: unknown }>; isError?: boolean };
          if (!rd?.isError) {
            // Also check for error patterns in output text
            const text = (rd?.content ?? []).map(c => String(c.data ?? '')).join('');
            if (text.match(/error|FAILED|Error:|BUILD FAILURE|npm ERR!/i) && text.length < 2000) {
              errors.push(text.slice(0, 500));
            }
          } else {
            const text = (rd?.content ?? []).map(c => String(c.data ?? '')).join('');
            errors.push(text.slice(0, 500));
          }
        }
      }

      // 4. Build conversation tail from last N events
      if (kind === 'AssistantMessage') {
        const text = content.filter(b => b.kind === 'text').map(b => String(b.data)).join('');
        const tools = content.filter(b => b.kind === 'toolUse').map(b => {
          const td = b.data as { name?: string; input?: { __tool_use_purpose?: string } };
          return `[TOOL] ${td?.name}: ${td?.input?.__tool_use_purpose ?? ''}`;
        });
        if (text) tail.push(`[AGENT] ${text}`);
        tail.push(...tools);
      } else if (kind === 'Prompt' || kind === 'HumanMessage') {
        const text = content.filter(b => b.kind === 'text').map(b => String(b.data)).join('');
        if (text) tail.push(`[USER] ${text}`);
      }
    }

    // Assemble the review prompt sections
    const sections: string[] = [];

    if (originalTask) {
      sections.push(`## ORIGINAL TASK\n${originalTask.slice(0, 1000)}`);
    }

    if (modifiedFiles.size > 0) {
      sections.push(`## MODIFIED FILES\n${[...modifiedFiles].join('\n')}`);
    }

    // Try to get a git diff scoped to files this agent modified
    if (modifiedFiles.size > 0) {
      const gitDiff = this.getGitDiff(modifiedFiles);
      if (gitDiff) {
        sections.push(`## GIT DIFF\n${gitDiff}`);
      }
    }

    if (errors.length > 0) {
      const uniqueErrors = [...new Set(errors)].slice(0, 5);
      sections.push(`## ERRORS ENCOUNTERED\n${uniqueErrors.join('\n---\n')}`);
    }

    // Conversation tail — keep last portion
    const tailText = tail.join('\n');
    const maxTail = 2000 - sections.reduce((n, s) => n + s.length, 0);
    if (maxTail > 200) {
      sections.push(`## CONVERSATION TAIL\n${tailText.length > maxTail ? tailText.slice(-maxTail) : tailText}`);
    }

    const full = sections.join('\n\n');
    return full.length > 4000 ? full.slice(0, 4000) : full;
  }

  /** Get git diff scoped to specific files the agent modified. */
  private getGitDiff(files: Set<string>): string | null {
    try {
      const { execSync } = require('child_process');
      const fileArgs = [...files].map(f => `"${f}"`).join(' ');
      const diff = execSync(`git diff --no-color -- ${fileArgs}`, {
        timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      });
      return diff.trim() ? diff.slice(0, 1500) : null;
    } catch { return null; }
  }

  private getLastAssistantMessage(): string | null {
    if (!this.sessionId) return null;
    const jsonlPath = path.join(os.homedir(), '.kiro', 'sessions', 'cli', `${this.sessionId}.jsonl`);
    try {
      const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const ev = JSON.parse(lines[i]);
          if (ev.kind === 'AssistantMessage') {
            return (ev.data?.content ?? [])
              .filter((b: { kind: string }) => b.kind === 'text')
              .map((b: { data: unknown }) => String(b.data))
              .join('');
          }
        } catch { /* skip */ }
      }
    } catch { /* file not found */ }
    return null;
  }

  private logActivity(sessionId: string, action: OrchestratorActivity['action'], issues?: string[]): void {
    this.activityLog.push({ timestamp: Date.now(), sessionId, action, issues });
    // Keep last 100 entries
    if (this.activityLog.length > 100) this.activityLog.splice(0, this.activityLog.length - 100);
    this.emit('activity');
  }
}

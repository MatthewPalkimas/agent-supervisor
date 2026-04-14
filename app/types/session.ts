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

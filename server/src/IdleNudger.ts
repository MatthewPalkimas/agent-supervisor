import { AcpClient } from './AcpClient';
import { SessionState } from './SessionPoller';

export class IdleNudger {
  // Set of session IDs that have been nudged in their current idle period
  private nudgedSessions = new Set<string>();

  constructor(private acp: AcpClient) {}

  async processUpdate(sessions: SessionState[]): Promise<void> {
    for (const session of sessions) {
      if (session.status === 'idle' && session.hasPendingTasks) {
        // Only nudge once per idle period
        if (!this.nudgedSessions.has(session.id)) {
          this.nudgedSessions.add(session.id);
          console.log(`[IdleNudger] Nudging session ${session.name} (${session.id})`);
          try {
            await this.acp.sendMessage(
              session.id,
              'You have pending tasks. Please continue working on them.'
            );
          } catch (e) {
            console.error(`[IdleNudger] Failed to nudge session ${session.id}:`, e);
          }
        }
      } else if (session.status === 'busy' || session.status === 'active') {
        // Reset nudge state when session becomes busy/active again
        this.nudgedSessions.delete(session.id);
      }
    }
  }
}

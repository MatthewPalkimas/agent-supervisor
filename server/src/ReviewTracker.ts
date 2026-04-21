export type ReviewState =
  | 'unreviewed'       // never reviewed
  | 'pending_review'   // queued for review (busy→idle detected)
  | 'reviewing'        // orchestrator is actively reviewing
  | 'correction_sent'  // review failed, correction sent to worker
  | 'awaiting_fix'     // worker is busy applying the fix
  | 'passed'           // review passed
  | 'failed_max_retries'; // hit retry cap

interface SessionReviewInfo {
  state: ReviewState;
  previousStatus: 'busy' | 'idle' | 'unknown';
  reviewCount: number;
  lastIssues: string[];
}

const MAX_REVIEWS = 3;

export class ReviewTracker {
  private sessions = new Map<string, SessionReviewInfo>();

  /** Update a session's observed status and return its ID if it should be reviewed now. */
  onStatusUpdate(sessionId: string, status: 'busy' | 'idle'): boolean {
    let info = this.sessions.get(sessionId);
    if (!info) {
      info = { state: 'unreviewed', previousStatus: 'unknown', reviewCount: 0, lastIssues: [] };
      this.sessions.set(sessionId, info);
    }

    const prev = info.previousStatus;
    info.previousStatus = status;

    // busy→idle transition: check if we should trigger a review
    if (prev === 'busy' && status === 'idle') {
      if (info.state === 'unreviewed' || info.state === 'awaiting_fix') {
        info.state = 'pending_review';
        return true;
      }
    }

    // If worker goes busy after we sent a correction, it's applying the fix
    if (status === 'busy' && info.state === 'correction_sent') {
      info.state = 'awaiting_fix';
    }

    return false;
  }

  markReviewing(sessionId: string): void {
    const info = this.sessions.get(sessionId);
    if (info) info.state = 'reviewing';
  }

  markPassed(sessionId: string): void {
    const info = this.sessions.get(sessionId);
    if (info) {
      info.state = 'passed';
      info.lastIssues = [];
    }
  }

  markCorrectionSent(sessionId: string, issues: string[]): void {
    const info = this.sessions.get(sessionId);
    if (info) {
      info.reviewCount++;
      info.lastIssues = issues;
      if (info.reviewCount >= MAX_REVIEWS) {
        info.state = 'failed_max_retries';
      } else {
        info.state = 'correction_sent';
      }
    }
  }

  getState(sessionId: string): ReviewState {
    return this.sessions.get(sessionId)?.state ?? 'unreviewed';
  }

  getInfo(sessionId: string): { state: ReviewState; reviewCount: number; lastIssues: string[] } {
    const info = this.sessions.get(sessionId);
    if (!info) return { state: 'unreviewed', reviewCount: 0, lastIssues: [] };
    return { state: info.state, reviewCount: info.reviewCount, lastIssues: info.lastIssues };
  }

  /** Remove tracking for terminated sessions. */
  cleanup(aliveIds: Set<string>): void {
    for (const id of this.sessions.keys()) {
      if (!aliveIds.has(id)) this.sessions.delete(id);
    }
  }
}

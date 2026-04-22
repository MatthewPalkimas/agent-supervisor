import { useEffect, useMemo, useState } from 'react';
import { useWebSocket, OrchestratorActivity } from '../hooks/useWebSocket';
import { Layout } from '../components/Layout';
import { Sparkline } from '../components/Sparkline';
import { SessionState } from '../types/session';

const ACTION_CONFIG: Record<string, { label: string; color: string; glow: string; icon: string }> = {
  review_started:    { label: 'Review started',       color: 'var(--info)',   glow: 'var(--info-glow)',   icon: '🔍' },
  review_passed:     { label: 'Passed',               color: 'var(--ok)',     glow: 'var(--ok-glow)',     icon: '✓' },
  correction_sent:   { label: 'Correction sent',      color: '#EE8434',       glow: '238, 132, 52',         icon: '↻' },
  review_failed_max: { label: 'Failed (max retries)', color: 'var(--danger)', glow: 'var(--danger-glow)', icon: '✕' },
};

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

function groupByDate(activity: OrchestratorActivity[]) {
  const groups: { label: string; items: OrchestratorActivity[] }[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  activity.forEach(e => {
    const d = new Date(e.timestamp);
    const midnight = new Date(d); midnight.setHours(0, 0, 0, 0);
    let label: string;
    if (midnight.getTime() === today.getTime()) label = 'Today';
    else if (midnight.getTime() === yesterday.getTime()) label = 'Yesterday';
    else label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    let g = groups.find(x => x.label === label);
    if (!g) { g = { label, items: [] }; groups.push(g); }
    g.items.push(e);
  });
  return groups;
}

export default function OrchestratorPage() {
  const { connected, orchestratorStatus, getOrchestratorStatus, sessions } = useWebSocket();
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => { if (connected) getOrchestratorStatus(); }, [connected, getOrchestratorStatus, refreshTick]);

  const activity = useMemo(
    () => [...orchestratorStatus.activity].sort((a, b) => b.timestamp - a.timestamp),
    [orchestratorStatus.activity]
  );

  const stats = useMemo(() => {
    const t = activity.length;
    const passed = activity.filter(e => e.action === 'review_passed').length;
    const failed = activity.filter(e => e.action === 'review_failed_max').length;
    const corrections = activity.filter(e => e.action === 'correction_sent').length;
    const started = activity.filter(e => e.action === 'review_started').length;
    const successRate = started > 0 ? Math.round((passed / started) * 100) : 0;
    return { total: t, started, passed, failed, corrections, successRate };
  }, [activity]);

  // Events-per-bucket for sparkline (last 60 min, 30 buckets of 2 min)
  const spark = useMemo(() => {
    const BUCKETS = 30;
    const WINDOW_MS = 60 * 60 * 1000;
    const now = Date.now();
    const bucketSize = WINDOW_MS / BUCKETS;
    const buckets = new Array(BUCKETS).fill(0);
    for (const e of activity) {
      const age = now - e.timestamp;
      if (age < 0 || age > WINDOW_MS) continue;
      const idx = Math.min(BUCKETS - 1, Math.floor((WINDOW_MS - age) / bucketSize));
      buckets[idx]++;
    }
    const recent = activity.filter(e => now - e.timestamp <= WINDOW_MS).length;
    return { buckets, recent };
  }, [activity]);

  // Average interval between review_started events (minutes)
  const avgInterval = useMemo(() => {
    const starts = activity.filter(e => e.action === 'review_started').sort((a, b) => a.timestamp - b.timestamp);
    if (starts.length < 2) return null;
    const deltas = starts.slice(1).map((e, i) => e.timestamp - starts[i].timestamp);
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    return avg / 60000;
  }, [activity]);

  // Per-session aggregation
  const bySession = useMemo(() => {
    const map = new Map<string, {
      sessionId: string; name?: string; status?: SessionState['status']; stuck?: boolean;
      reviewState?: string; reviewCount?: number;
      events: number; passed: number; corrections: number; failed: number;
      lastTs: number; lastAction: string; lastIssues: string[];
    }>();
    for (const e of activity) {
      let row = map.get(e.sessionId);
      if (!row) {
        const s = sessions.find(x => x.id === e.sessionId);
        row = {
          sessionId: e.sessionId, name: s?.name, status: s?.status, stuck: s?.stuck,
          reviewState: s?.reviewState, reviewCount: s?.reviewCount,
          events: 0, passed: 0, corrections: 0, failed: 0,
          lastTs: 0, lastAction: '', lastIssues: [],
        };
        map.set(e.sessionId, row);
      }
      row.events++;
      if (e.action === 'review_passed') row.passed++;
      if (e.action === 'correction_sent') row.corrections++;
      if (e.action === 'review_failed_max') row.failed++;
      if (e.timestamp > row.lastTs) {
        row.lastTs = e.timestamp; row.lastAction = e.action; row.lastIssues = e.issues ?? [];
      }
    }
    return Array.from(map.values()).sort((a, b) => b.lastTs - a.lastTs);
  }, [activity, sessions]);

  // Top recurring issues
  const topIssues = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of activity) {
      for (const issue of (e.issues ?? [])) {
        const key = issue.trim().slice(0, 140);
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [activity]);

  // Reviews currently in progress or queued (derived from session state)
  const inProgress = useMemo(
    () => sessions.filter(s => s.reviewState === 'reviewing'),
    [sessions]
  );
  const awaitingFix = useMemo(
    () => sessions.filter(s => s.reviewState === 'correction_sent' || s.reviewState === 'awaiting_fix'),
    [sessions]
  );

  const filtered = useMemo(() => {
    if (actionFilter === 'all') return activity;
    return activity.filter(e => e.action === actionFilter);
  }, [activity, actionFilter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const active = sessions.filter(s => s.status !== 'terminated');
  const layoutStats = {
    active: active.length,
    busy: active.filter(s => s.status === 'busy' && !s.stuck).length,
    stuck: active.filter(s => s.stuck).length,
    terminated: sessions.filter(s => s.status === 'terminated').length,
  };

  return (
    <Layout connected={connected} stats={layoutStats}>
      {/* Hero */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap', marginBottom: 22,
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-0)', letterSpacing: '-0.03em', margin: 0 }}>
            Orchestrator
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600,
              color: orchestratorStatus.ready ? 'var(--ok)' : 'var(--idle)',
              background: orchestratorStatus.ready ? 'rgba(52,211,153,0.08)' : 'rgba(100,116,139,0.08)',
              border: `1px solid ${orchestratorStatus.ready ? 'rgba(52,211,153,0.22)' : 'rgba(100,116,139,0.22)'}`,
              padding: '3px 10px', borderRadius: 999, marginLeft: 12, verticalAlign: 'middle',
            }}>
              <span className={`dot ${orchestratorStatus.ready ? 'dot-pulse' : ''}`} />
              {orchestratorStatus.ready ? 'Ready' : 'Not ready'}
            </span>
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
            Auto-reviews agent output, requests corrections, and escalates failures.
          </div>
        </div>
        <button className="btn" onClick={() => setRefreshTick(t => t + 1)}>↻ Refresh</button>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 10, marginBottom: 16,
      }}>
        <StatCard label="Success rate" value={`${stats.successRate}%`} accent="var(--ok)" hint={`${stats.passed}/${stats.started} reviews`} />
        <StatCard label="Reviews run"  value={stats.started}  accent="var(--info)"   hint="Automated passes" />
        <StatCard label="Passed"       value={stats.passed}   accent="var(--ok)"     hint="Without corrections" />
        <StatCard label="Corrections"  value={stats.corrections} accent="#EE8434"    hint="Fix requests sent" />
        <StatCard label="Failed"       value={stats.failed}   accent="var(--danger)" hint="Max retries hit" />
        <StatCard
          label="Avg interval"
          value={avgInterval == null ? '—' : avgInterval < 1 ? `${Math.round(avgInterval * 60)}s` : `${avgInterval.toFixed(1)}m`}
          accent="var(--busy)"
          hint="Between reviews"
        />
      </div>

      {/* Activity over time sparkline */}
      <div style={{
        marginBottom: 16, padding: '14px 16px',
        background: 'linear-gradient(180deg, rgba(var(--panel-rgb), 0.65), rgba(var(--panel-2-rgb), 0.85))',
        border: '1px solid var(--border)', borderRadius: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)' }}>
              Activity — last 60 minutes
            </div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-0)', marginTop: 2 }}>
              {spark.recent} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-4)' }}>events</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-5)' }}>2-min buckets</div>
        </div>
        <Sparkline values={spark.buckets} height={56} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-5)', marginTop: 4 }}>
          <span>-60m</span><span>-30m</span><span>now</span>
        </div>
      </div>

      {/* In-progress / pending panel */}
      {(inProgress.length > 0 || awaitingFix.length > 0) && (
        <div style={{
          marginBottom: 16, padding: '12px 14px',
          background: 'linear-gradient(180deg, rgba(var(--panel-rgb), 0.55), rgba(var(--panel-2-rgb), 0.75))',
          border: '1px solid var(--border)', borderRadius: 12,
          display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center',
        }}>
          {inProgress.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="dot dot-pulse" style={{ color: 'var(--info)' }} />
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)' }}>
                  Reviewing now
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-0)', marginTop: 2 }}>
                  {inProgress.map(s => s.name).join(', ')}
                </div>
              </div>
            </div>
          )}
          {awaitingFix.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="dot dot-pulse" style={{ color: '#EE8434' }} />
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)' }}>
                  Awaiting fix
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-0)', marginTop: 2 }}>
                  {awaitingFix.map(s => `${s.name} (${s.reviewCount}/3)`).join(', ')}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top issues + Per-session breakdown side by side */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: topIssues.length > 0 ? 'minmax(0, 1fr) minmax(0, 1.5fr)' : 'minmax(0, 1fr)',
        gap: 12, marginBottom: 16,
      }}>
        {topIssues.length > 0 && <TopIssuesPanel issues={topIssues} />}
        {bySession.length > 0 && <SessionBreakdown rows={bySession} />}
      </div>

      {/* Filter chips */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16,
        padding: 10, background: 'rgba(var(--panel-rgb), 0.45)',
        border: '1px solid var(--border)', borderRadius: 10,
      }}>
        <FilterChip active={actionFilter === 'all'} onClick={() => setActionFilter('all')} label="All" count={stats.total} />
        {Object.entries(ACTION_CONFIG).map(([k, cfg]) => (
          <FilterChip
            key={k}
            active={actionFilter === k}
            onClick={() => setActionFilter(k)}
            label={cfg.label}
            count={activity.filter(a => a.action === k).length}
            color={cfg.color}
          />
        ))}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '80px 20px', color: 'var(--text-4)',
        }}>
          <div style={{ fontSize: 36, opacity: 0.4 }}>◌</div>
          <div style={{ fontSize: 15, color: 'var(--text-3)', marginTop: 12 }}>No activity yet</div>
          <div style={{ fontSize: 12, color: 'var(--text-5)', marginTop: 6, textAlign: 'center', maxWidth: 420 }}>
            The orchestrator reviews agents after they finish tasks. Activity will appear here.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {grouped.map(g => (
            <div key={g.label}>
              <div style={{
                fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                margin: '0 6px 8px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                {g.label}
                <span style={{ height: 1, flex: 1, background: 'var(--border)' }} />
                <span style={{ color: 'var(--text-5)', fontWeight: 500 }}>{g.items.length}</span>
              </div>
              <div style={{ position: 'relative' }}>
                {/* Timeline line */}
                <div style={{
                  position: 'absolute', top: 14, bottom: 14, left: 17,
                  width: 1, background: 'linear-gradient(180deg, transparent, var(--border), var(--border), transparent)',
                }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {g.items.map((entry, i) => (
                    <ActivityRow
                      key={`${entry.timestamp}-${i}`}
                      entry={entry}
                      sessionName={sessions.find(s => s.id === entry.sessionId)?.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}

function StatCard({ label, value, accent, hint }: { label: string; value: string | number; accent: string; hint?: string }) {
  return (
    <div style={{
      position: 'relative',
      padding: '14px 16px',
      background: 'linear-gradient(180deg, rgba(var(--panel-rgb), 0.65), rgba(var(--panel-2-rgb), 0.85))',
      border: '1px solid var(--border)', borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${accent}, transparent 70%)`,
      }} />
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)' }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-0)', marginTop: 4, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function FilterChip({ active, label, count, color, onClick }: {
  active: boolean; label: string; count: number; color?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 11px', fontSize: 11.5, fontWeight: 600,
        borderRadius: 7,
        background: active ? 'linear-gradient(180deg, rgba(var(--brand-glow),0.18), rgba(var(--brand-glow),0.06))' : 'transparent',
        border: `1px solid ${active ? 'rgba(var(--brand-glow),0.35)' : 'transparent'}`,
        color: active ? 'var(--text-0)' : (color ?? 'var(--text-3)'),
        cursor: 'pointer',
        transition: 'all 140ms',
      }}
    >
      {label}
      <span style={{
        fontSize: 10,
        color: active ? 'var(--text-2)' : 'var(--text-4)',
        background: 'var(--tint)',
        padding: '0 6px', borderRadius: 999, minWidth: 16, textAlign: 'center',
      }}>{count}</span>
    </button>
  );
}

function ActivityRow({ entry, sessionName }: { entry: OrchestratorActivity; sessionName?: string }) {
  const cfg = ACTION_CONFIG[entry.action] ?? { label: entry.action, color: 'var(--idle)', glow: 'var(--idle-glow)', icon: '•' };
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '10px 14px 10px 10px',
      borderRadius: 10,
      background: 'linear-gradient(90deg, rgba(var(--panel-rgb), 0.35), rgba(var(--panel-2-rgb), 0.55))',
      border: '1px solid var(--border)',
      transition: 'border-color 140ms, background 140ms',
    }}>
      <div style={{
        position: 'relative', flexShrink: 0,
        width: 26, height: 26, borderRadius: 999,
        display: 'grid', placeItems: 'center',
        background: `radial-gradient(circle, rgba(${cfg.glow}, 0.35), rgba(${cfg.glow}, 0.08))`,
        border: `1px solid rgba(${cfg.glow}, 0.35)`,
        color: cfg.color, fontSize: 12, fontWeight: 700, marginLeft: 4,
        boxShadow: `0 0 10px rgba(${cfg.glow}, 0.2)`,
      }}>
        {cfg.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
          {sessionName && (
            <span style={{ fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sessionName}
            </span>
          )}
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-5)' }}>
            {entry.sessionId.slice(0, 8)}
          </span>
        </div>
        {entry.issues && entry.issues.length > 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55, marginTop: 5 }}>
            {entry.issues.map((issue, i) => (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <span style={{ color: 'var(--text-5)' }}>•</span>
                <span>{issue}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{fmtTime(entry.timestamp)}</span>
        <span style={{ fontSize: 10, color: 'var(--text-5)' }}>{fmtAgo(entry.timestamp)}</span>
      </div>
    </div>
  );
}

function TopIssuesPanel({ issues }: { issues: [string, number][] }) {
  const max = Math.max(...issues.map(i => i[1]), 1);
  return (
    <div style={{
      padding: '14px 16px',
      background: 'linear-gradient(180deg, rgba(var(--panel-rgb), 0.65), rgba(var(--panel-2-rgb), 0.85))',
      border: '1px solid var(--border)', borderRadius: 12,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)', marginBottom: 10 }}>
        Top recurring issues
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {issues.map(([issue, count], i) => (
          <div key={i}>
            <div style={{ display: 'flex', gap: 8, fontSize: 12.5, alignItems: 'baseline' }}>
              <span className="mono" style={{ color: 'var(--warn)', fontWeight: 700, minWidth: 20 }}>×{count}</span>
              <span style={{ color: 'var(--text-1)', lineHeight: 1.4, flex: 1, wordBreak: 'break-word' }}>{issue}</span>
            </div>
            <div style={{ height: 3, background: 'var(--tint)', borderRadius: 2, marginTop: 5, overflow: 'hidden' }}>
              <div style={{
                width: `${(count / max) * 100}%`, height: '100%',
                background: 'linear-gradient(90deg, var(--warn), #EE8434)',
                borderRadius: 2,
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionBreakdown({ rows }: { rows: Array<{
  sessionId: string; name?: string; status?: SessionState['status']; stuck?: boolean;
  reviewState?: string; reviewCount?: number;
  events: number; passed: number; corrections: number; failed: number;
  lastTs: number; lastAction: string; lastIssues: string[];
}> }) {
  const cols = '1.6fr 70px 70px 70px 90px 110px';
  return (
    <div style={{
      padding: '14px 16px',
      background: 'linear-gradient(180deg, rgba(var(--panel-rgb), 0.65), rgba(var(--panel-2-rgb), 0.85))',
      border: '1px solid var(--border)', borderRadius: 12,
      overflowX: 'auto',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)', marginBottom: 10 }}>
        Per-session breakdown
      </div>
      <div style={{ minWidth: 560 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: cols, gap: 8,
          fontSize: 10, color: 'var(--text-5)', textTransform: 'uppercase', letterSpacing: '0.08em',
          paddingBottom: 6, borderBottom: '1px solid var(--border)',
        }}>
          <span>Session</span><span>Events</span><span>✓</span><span>↻</span><span>State</span><span>Last</span>
        </div>
        {rows.map((r, i) => {
          const cfg = ACTION_CONFIG[r.lastAction];
          const stateColor =
            r.reviewState === 'passed' ? 'var(--ok)' :
            r.reviewState === 'reviewing' ? 'var(--info)' :
            r.reviewState === 'failed_max_retries' ? 'var(--danger)' :
            r.reviewState === 'correction_sent' || r.reviewState === 'awaiting_fix' ? '#EE8434' :
            'var(--text-4)';
          return (
            <div key={r.sessionId} style={{
              display: 'grid', gridTemplateColumns: cols, gap: 8,
              padding: '8px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
              fontSize: 12, alignItems: 'center',
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  color: 'var(--text-0)', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.name ?? '—'}
                </div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-5)' }}>
                  {r.sessionId.slice(0, 8)}
                </div>
              </div>
              <span className="mono" style={{ color: 'var(--text-1)' }}>{r.events}</span>
              <span className="mono" style={{ color: r.passed > 0 ? 'var(--ok)' : 'var(--text-5)' }}>{r.passed}</span>
              <span className="mono" style={{ color: r.corrections > 0 ? '#EE8434' : 'var(--text-5)' }}>{r.corrections}</span>
              <span style={{ color: stateColor, fontSize: 10.5, fontWeight: 600 }}>
                {r.reviewState ?? '—'}
                {r.reviewCount ? ` (${r.reviewCount})` : ''}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: cfg?.color ?? 'var(--text-3)', fontSize: 11 }}>
                  {cfg?.icon ?? '•'} {cfg?.label ?? r.lastAction}
                </span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-5)' }}>
                  {fmtAgo(r.lastTs)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

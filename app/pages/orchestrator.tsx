import { useEffect } from 'react';
import Link from 'next/link';
import { useWebSocket, OrchestratorActivity } from '../hooks/useWebSocket';
import { Layout } from '../components/Layout';

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  review_started:    { label: 'Review started',    color: '#a78bfa', icon: '🔍' },
  review_passed:     { label: 'Passed',            color: '#4ade80', icon: '✓' },
  correction_sent:   { label: 'Correction sent',   color: '#fb923c', icon: '↻' },
  review_failed_max: { label: 'Failed (max retries)', color: '#f87171', icon: '✕' },
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

export default function OrchestratorPage() {
  const { connected, orchestratorStatus, getOrchestratorStatus, sessions } = useWebSocket();

  useEffect(() => {
    if (connected) getOrchestratorStatus();
  }, [connected, getOrchestratorStatus]);

  const activity = [...orchestratorStatus.activity].reverse();

  return (
    <Layout connected={connected}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/" style={{ color: '#475569', textDecoration: 'none', fontSize: 14 }}>← Sessions</Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Orchestrator</h1>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
            color: orchestratorStatus.ready ? '#4ade80' : '#64748b',
            background: orchestratorStatus.ready ? 'rgba(74,222,128,0.1)' : 'rgba(100,116,139,0.1)',
          }}>
            {orchestratorStatus.ready ? '● Ready' : '○ Not ready'}
          </span>
        </div>
        <button
          onClick={getOrchestratorStatus}
          style={{
            fontSize: 12, color: '#475569', background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
            padding: '6px 12px', cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>

      {activity.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: 320, color: '#334155', gap: 12,
        }}>
          <div style={{ fontSize: 40, opacity: 0.3 }}>◌</div>
          <div style={{ fontSize: 15, color: '#475569' }}>No review activity yet</div>
          <div style={{ fontSize: 12, color: '#334155' }}>
            The orchestrator auto-reviews agents when they finish tasks
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {activity.map((entry, i) => (
            <ActivityRow key={i} entry={entry} sessionName={sessions.find(s => s.id === entry.sessionId)?.name} />
          ))}
        </div>
      )}
    </Layout>
  );
}

function ActivityRow({ entry, sessionName }: { entry: OrchestratorActivity; sessionName?: string }) {
  const cfg = ACTION_CONFIG[entry.action] ?? { label: entry.action, color: '#64748b', icon: '•' };
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      background: 'rgba(255,255,255,0.02)',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
    }}>
      <span style={{ fontSize: 14, lineHeight: '20px', flexShrink: 0 }}>{cfg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
          <span style={{ fontSize: 11, color: '#475569', fontFamily: 'ui-monospace, monospace' }}>
            {entry.sessionId.slice(0, 8)}
          </span>
          {sessionName && (
            <span style={{ fontSize: 11, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sessionName}
            </span>
          )}
        </div>
        {entry.issues && entry.issues.length > 0 && (
          <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, marginTop: 4 }}>
            {entry.issues.map((issue, i) => <div key={i}>• {issue}</div>)}
          </div>
        )}
      </div>
      <span style={{
        fontSize: 10, color: '#334155', flexShrink: 0,
        fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums',
      }}>
        {formatTime(entry.timestamp)}
      </span>
    </div>
  );
}

import { useState } from 'react';
import Link from 'next/link';
import { useWebSocket } from '../hooks/useWebSocket';
import { AgentCard } from '../components/AgentCard';
import { Layout } from '../components/Layout';
import { HistoryDrawer } from '../components/HistoryDrawer';
import { NewSessionModal } from '../components/NewSessionModal';
import { SessionState } from '../types/session';

const STATUS_ORDER: Record<SessionState['status'], number> = {
  starting: 0, busy: 1, active: 1, idle: 1, terminated: 4,
};

export default function Home() {
  const { sessions, sendMessage, terminateSession, interruptSession, reviewSession, startSession, getHistory, clearHistory, history, connected } = useWebSocket();
  const [showNewSession, setShowNewSession] = useState(false);

  const active = sessions.filter(s => s.status !== 'terminated');
  const terminated = sessions.filter(s => s.status === 'terminated');
  const sorted = [...active].sort((a, b) => a.startTime - b.startTime);

  const busyCount = active.filter(s => s.status === 'busy' && !s.stuck).length;
  const startingCount = active.filter(s => s.status === 'starting').length;
  const idleCount = active.filter(s => s.status === 'idle' && !s.stuck).length;
  const stuckCount = active.filter(s => s.stuck).length;

  return (
    <Layout connected={connected}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{
            fontSize: 20, fontWeight: 700, color: '#f1f5f9',
            letterSpacing: '-0.02em', margin: 0,
          }}>
            Sessions
          </h1>
          <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
            {startingCount > 0 && <Pill color="#a78bfa">{startingCount} starting</Pill>}
            {busyCount > 0 && <Pill color="#4ade80">{busyCount} busy</Pill>}
            {idleCount > 0 && <Pill color="#64748b">{idleCount} idle</Pill>}
            {stuckCount > 0 && <Pill color="#fbbf24">⚠ {stuckCount} stuck</Pill>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/orchestrator" style={{
            fontSize: 12, color: '#a78bfa', textDecoration: 'none',
            transition: 'color 0.15s', fontWeight: 600,
          }}>
            Orchestrator
          </Link>
          {terminated.length > 0 && (
            <Link href="/history" style={{
              fontSize: 12, color: '#475569', textDecoration: 'none',
              transition: 'color 0.15s',
            }}>
              {terminated.length} terminated →
            </Link>
          )}
          <button
            onClick={() => setShowNewSession(true)}
            style={{
              fontSize: 12, fontWeight: 600, padding: '6px 14px',
              background: 'rgba(59,130,246,0.6)', color: '#e2e8f0',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            + New Session
          </button>
        </div>
      </div>

      {/* Content */}
      {active.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: 320, color: '#334155', gap: 12,
        }}>
          <div style={{ fontSize: 40, opacity: 0.3 }}>◌</div>
          <div style={{ fontSize: 15, color: '#475569' }}>No active sessions</div>
          <div style={{ fontSize: 12, color: '#334155' }}>
            Start one with{' '}
            <code style={{
              background: 'rgba(255,255,255,0.06)', padding: '2px 8px',
              borderRadius: 4, fontSize: 11,
            }}>
              kiro-cli
            </code>
            {' '}or click + New Session
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 14,
        }}>
          {sorted.map(s => (
            <AgentCard
              key={s.stableKey ?? s.id}
              session={s}
              onSendMessage={sendMessage}
              onTerminate={terminateSession}
              onInterrupt={interruptSession}
              onReview={reviewSession}
              onViewHistory={getHistory}
            />
          ))}
        </div>
      )}

      {showNewSession && (
        <NewSessionModal
          onStart={(prompt, model) => startSession(prompt, model)}
          onClose={() => setShowNewSession(false)}
        />
      )}

      {history && (
        <HistoryDrawer
          sessionName={sessions.find(s => s.id === history.sessionId)?.name ?? history.sessionId.slice(0, 8)}
          messages={history.messages}
          onClose={clearHistory}
        />
      )}
    </Layout>
  );
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      color,
      background: `${color}12`,
      border: `1px solid ${color}25`,
      borderRadius: 20, padding: '3px 10px', fontWeight: 600,
      fontSize: 11,
    }}>
      {children}
    </span>
  );
}

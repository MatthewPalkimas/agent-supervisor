import { useMemo, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { AgentCard } from '../components/AgentCard';
import { Layout } from '../components/Layout';
import { HistoryDrawer } from '../components/HistoryDrawer';

export default function History() {
  const { sessions, sendMessage, getHistory, clearHistory, history, connected } = useWebSocket();
  const [query, setQuery] = useState('');

  const terminated = useMemo(() =>
    sessions.filter(s => s.status === 'terminated').sort((a, b) => b.startTime - a.startTime),
    [sessions]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return terminated;
    return terminated.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.summary?.toLowerCase().includes(q)
    );
  }, [terminated, query]);

  const active = sessions.filter(s => s.status !== 'terminated');
  const stats = {
    active: active.length,
    busy: active.filter(s => s.status === 'busy' && !s.stuck).length,
    stuck: active.filter(s => s.stuck).length,
    terminated: terminated.length,
  };

  return (
    <Layout connected={connected} stats={stats}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap', marginBottom: 22,
      }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-0)', letterSpacing: '-0.03em', margin: 0 }}>
            History
            <span style={{ color: 'var(--text-4)', fontWeight: 500, fontSize: 15, marginLeft: 10 }}>
              {terminated.length} terminated session{terminated.length !== 1 ? 's' : ''}
            </span>
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
            Browse completed agents and their full conversation history.
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        background: 'rgba(var(--panel-rgb), 0.45)',
        border: '1px solid var(--border)', borderRadius: 10,
        marginBottom: 18, maxWidth: 440,
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-4)' }}>⌕</span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search history…"
          style={{ flex: 1, fontSize: 12.5 }}
        />
        {query && (
          <button className="icon-btn" onClick={() => setQuery('')} style={{ width: 22, height: 22, fontSize: 11 }}>✕</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '100px 20px', color: 'var(--text-4)',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            display: 'grid', placeItems: 'center',
            background: 'rgba(52,211,153,0.08)',
            border: '1px solid rgba(52,211,153,0.25)',
            fontSize: 26, color: 'var(--ok)',
          }}>✓</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', marginTop: 16 }}>
            {terminated.length === 0 ? 'No terminated sessions' : 'No sessions match'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
            {terminated.length === 0
              ? 'Completed sessions will appear here.'
              : 'Try adjusting your search query.'}
          </div>
          {query && <button className="btn" onClick={() => setQuery('')} style={{ marginTop: 14 }}>Clear</button>}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 14,
        }}>
          {filtered.map(s => (
            <AgentCard
              key={s.id}
              session={s}
              onSendMessage={sendMessage}
              onTerminate={() => {}}
              onInterrupt={() => {}}
              onReview={() => {}}
              onViewHistory={getHistory}
            />
          ))}
        </div>
      )}

      {history && (
        <HistoryDrawer
          sessionName={terminated.find(s => s.id === history.sessionId)?.name ?? history.sessionId.slice(0, 8)}
          messages={history.messages}
          onClose={clearHistory}
        />
      )}
    </Layout>
  );
}

import { useWebSocket } from '../hooks/useWebSocket';
import { AgentCard } from '../components/AgentCard';
import { Layout } from '../components/Layout';
import { HistoryDrawer } from '../components/HistoryDrawer';

export default function History() {
  const { sessions, sendMessage, getHistory, clearHistory, history, connected } = useWebSocket();
  const terminated = sessions.filter(s => s.status === 'terminated')
    .sort((a, b) => b.startTime - a.startTime);

  return (
    <Layout connected={connected}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24,
      }}>
        <h1 style={{
          fontSize: 20, fontWeight: 700, color: '#f1f5f9',
          letterSpacing: '-0.02em', margin: 0,
        }}>
          History
        </h1>
        <span style={{ fontSize: 12, color: '#475569' }}>
          {terminated.length} session{terminated.length !== 1 ? 's' : ''}
        </span>
      </div>

      {terminated.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: 320, color: '#334155', gap: 12,
        }}>
          <div style={{ fontSize: 40, opacity: 0.3 }}>✓</div>
          <div style={{ fontSize: 15, color: '#475569' }}>No terminated sessions</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 14,
        }}>
          {terminated.map(s => (
            <AgentCard
              key={s.id}
              session={s}
              onSendMessage={sendMessage}
              onTerminate={() => {}}
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

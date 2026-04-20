import { useEffect, useRef } from 'react';
import { HistoryMessage } from '../hooks/useWebSocket';

export function HistoryDrawer({ sessionName, messages, onClose }: {
  sessionName: string;
  messages: HistoryMessage[];
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Scroll to bottom on open
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 40,
        }}
      />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(640px, 92vw)',
        background: '#0c0f18',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        zIndex: 50,
        display: 'flex', flexDirection: 'column',
        animation: 'fadeIn 0.2s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
              Chat History
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
              {sessionName}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.04)', border: 'none',
              color: '#64748b', cursor: 'pointer', fontSize: 14,
              padding: '6px 10px', borderRadius: 6,
              transition: 'background 0.15s',
            }}
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: 'auto', padding: '20px 24px',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}
        >
          {messages.length === 0 && (
            <div style={{
              color: '#334155', fontSize: 13, textAlign: 'center',
              marginTop: 60,
            }}>
              No messages found
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: 4,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 600, color: '#475569',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '0 4px',
              }}>
                {msg.role === 'user' ? 'You' : msg.role === 'tool' ? '🔧 Tool' : 'Agent'}
              </span>
              <div style={{
                background: msg.role === 'user'
                  ? 'rgba(59,130,246,0.15)'
                  : msg.role === 'tool'
                  ? 'rgba(167,139,250,0.08)'
                  : 'rgba(255,255,255,0.04)',
                border: `1px solid ${msg.role === 'user'
                  ? 'rgba(59,130,246,0.2)'
                  : msg.role === 'tool'
                  ? 'rgba(167,139,250,0.15)'
                  : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 10,
                padding: msg.role === 'tool' ? '6px 12px' : '10px 14px',
                fontSize: msg.role === 'tool' ? 11 : 13,
                color: msg.role === 'tool' ? '#a78bfa' : '#cbd5e1',
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxWidth: '88%',
                fontFamily: msg.role === 'tool' ? 'ui-monospace, monospace' : 'inherit',
              }}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

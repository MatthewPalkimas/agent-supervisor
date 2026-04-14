import { useState, useEffect, useRef } from 'react';
import { SessionState } from '../types/session';

const STATUS_CONFIG: Record<SessionState['status'], { color: string; bg: string; label: string; pulse: boolean }> = {
  starting:   { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', label: 'Starting',    pulse: true  },
  busy:       { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  label: 'Busy',         pulse: true  },
  idle:       { color: '#64748b', bg: 'rgba(100,116,139,0.1)', label: 'Idle',         pulse: false },
  active:     { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  label: 'Active',       pulse: false },
  terminated: { color: '#475569', bg: 'rgba(71,85,105,0.08)',  label: 'Terminated',   pulse: false },
};
const STUCK_CONFIG = { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', label: 'Stuck', pulse: true };

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatLastActivity(timestampMs: number) {
  const ago = Date.now() - timestampMs;
  if (ago < 5000) return 'just now';
  const s = Math.floor(ago / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ago`;
  if (m > 0) return `${m}m ago`;
  return `${s}s ago`;
}

function formatModel(model: string) {
  return model
    .replace('claude-', '')
    .replace('us.anthropic.', '')
    .replace(/-(\d)/, ' $1');
}

export function AgentCard({ session, onSendMessage, onTerminate, onViewHistory }: {
  session: SessionState;
  onSendMessage: (id: string, msg: string) => void;
  onTerminate: (id: string) => void;
  onViewHistory: (id: string) => void;
}) {
  const [, setTick] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [sent, setSent] = useState(false);
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cfg = session.stuck ? STUCK_CONFIG : STATUS_CONFIG[session.status];
  const isAlive = session.status !== 'terminated';

  // Tick every 10s to keep "last activity" timestamp fresh
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  const terminate = () => {
    if (!confirmTerminate) {
      setConfirmTerminate(true);
      setTimeout(() => setConfirmTerminate(false), 3000);
      return;
    }
    onTerminate(session.id);
    setConfirmTerminate(false);
  };

  const send = () => {
    if (!input.trim()) return;
    onSendMessage(session.id, input.trim());
    setInput('');
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  };

  return (
    <div style={{
      background: '#111520',
      border: `1px solid ${session.stuck ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'border-color 0.3s, box-shadow 0.3s',
      animation: 'fadeIn 0.3s ease-out',
    }}>
      {/* Status accent bar */}
      <div style={{
        height: 2,
        background: `linear-gradient(90deg, ${cfg.color}, transparent)`,
        opacity: isAlive ? 0.8 : 0.3,
      }} />

      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            {/* Meta line: agent + model */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 11, marginBottom: 6,
            }}>
              <span style={{
                color: '#475569', textTransform: 'uppercase',
                letterSpacing: '0.06em', fontWeight: 600,
              }}>
                {session.currentTask}
              </span>
              {session.model && (
                <span style={{
                  color: '#334155', fontSize: 10,
                  background: 'rgba(255,255,255,0.04)',
                  padding: '1px 6px', borderRadius: 4,
                }}>
                  {formatModel(session.model)}
                </span>
              )}
            </div>
            {/* Session name */}
            <div style={{
              fontSize: 14, fontWeight: 600, color: '#e2e8f0',
              lineHeight: 1.4, wordBreak: 'break-word',
            }}>
              {session.name}
            </div>
          </div>

          {/* Status + time */}
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'flex-end', gap: 6, flexShrink: 0,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 600, color: cfg.color,
              background: cfg.bg,
              padding: '3px 8px', borderRadius: 20,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: cfg.color,
                animation: cfg.pulse ? 'pulse 2s ease-in-out infinite' : 'none',
              }} />
              {cfg.label}
            </span>
            <span style={{
              fontSize: 11, color: '#334155',
              fontFamily: 'ui-monospace, monospace',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatLastActivity(session.lastActivityMs)}
            </span>
          </div>
        </div>

        {/* Badges */}
        {(session.nudged || session.stuck) && (
          <div style={{ display: 'flex', gap: 6 }}>
            {session.stuck && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: '#fbbf24',
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.2)',
                borderRadius: 4, padding: '2px 8px',
              }}>
                ⚠ stuck
              </span>
            )}
            {session.nudged && !session.stuck && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: '#60a5fa',
                background: 'rgba(96,165,250,0.08)',
                border: '1px solid rgba(96,165,250,0.2)',
                borderRadius: 4, padding: '2px 8px',
              }}>
                ↩ nudged
              </span>
            )}
          </div>
        )}

        {/* Summary */}
        {session.summary && (
          <div style={{
            fontSize: 12, color: '#94a3b8', lineHeight: 1.6,
            borderLeft: `2px solid ${cfg.color}40`,
            paddingLeft: 12,
            background: 'rgba(0,0,0,0.15)',
            borderRadius: '0 6px 6px 0',
            padding: '8px 12px 8px 12px',
            marginLeft: 0,
          }}>
            {session.summary}
          </div>
        )}

        {/* Last message toggle + history link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {session.lastMessage && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                background: 'none', border: 'none', padding: 0,
                cursor: 'pointer', color: '#475569', fontSize: 11,
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'color 0.15s',
              }}
            >
              <span style={{
                transform: expanded ? 'rotate(90deg)' : 'none',
                display: 'inline-block', transition: 'transform 0.15s',
                fontSize: 13,
              }}>›</span>
              {expanded ? 'hide' : 'last message'}
            </button>
          )}
          <button
            onClick={() => onViewHistory(session.id)}
            style={{
              background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', color: '#475569', fontSize: 11,
              transition: 'color 0.15s',
            }}
          >
            history
          </button>
        </div>

        {expanded && session.lastMessage && (
          <div style={{
            fontSize: 12, color: '#64748b', lineHeight: 1.6,
            background: 'rgba(0,0,0,0.2)', borderRadius: 8,
            padding: '10px 12px', maxHeight: 180, overflowY: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            border: '1px solid rgba(255,255,255,0.04)',
          }}>
            {session.lastMessage}
          </div>
        )}

        {/* Input + actions */}
        {isAlive && (
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Send a message…"
              style={{
                flex: 1, background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8, padding: '8px 12px',
                fontSize: 12, color: '#e2e8f0', outline: 'none',
                transition: 'border-color 0.15s',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              style={{
                padding: '8px 14px',
                background: sent ? 'rgba(74,222,128,0.15)' : input.trim() ? 'rgba(59,130,246,0.7)' : 'rgba(59,130,246,0.3)',
                color: sent ? '#4ade80' : '#e2e8f0',
                border: 'none',
                borderRadius: 8, cursor: input.trim() ? 'pointer' : 'default',
                fontSize: 12, fontWeight: 600,
                transition: 'all 0.2s',
                opacity: input.trim() || sent ? 1 : 0.5,
              }}
            >
              {sent ? '✓ Sent' : 'Send'}
            </button>
            <button
              onClick={terminate}
              title={confirmTerminate ? 'Click again to confirm' : 'Terminate session'}
              style={{
                padding: '8px 10px',
                background: confirmTerminate ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                color: confirmTerminate ? '#f87171' : '#475569',
                border: `1px solid ${confirmTerminate ? 'rgba(239,68,68,0.3)' : 'transparent'}`,
                borderRadius: 8, cursor: 'pointer', fontSize: 13,
                transition: 'all 0.2s',
              }}
            >
              {confirmTerminate ? '✕ confirm?' : '✕'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

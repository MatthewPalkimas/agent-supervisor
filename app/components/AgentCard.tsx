import { useState, useEffect, useRef } from 'react';
import { SessionState } from '../types/session';
import { useToast } from './Toast';

const STATUS_CONFIG: Record<SessionState['status'], { color: string; glow: string; label: string; pulse: boolean }> = {
  starting:   { color: 'var(--info)',   glow: 'var(--info-glow)',   label: 'Starting',    pulse: true  },
  busy:       { color: 'var(--ok)',     glow: 'var(--ok-glow)',     label: 'Working',     pulse: true  },
  idle:       { color: 'var(--idle)',   glow: 'var(--idle-glow)',   label: 'Idle',        pulse: false },
  active:     { color: 'var(--busy)',   glow: 'var(--busy-glow)',   label: 'Active',      pulse: false },
  terminated: { color: 'var(--text-4)', glow: '71,85,105',          label: 'Terminated',  pulse: false },
};
const STUCK_CONFIG = { color: 'var(--warn)', glow: 'var(--warn-glow)', label: 'Needs attention', pulse: true };

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatAgo(ts: number) {
  const a = Date.now() - ts;
  if (a < 5000) return 'just now';
  const s = Math.floor(a / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ago`;
  if (m > 0) return `${m}m ago`;
  return `${s}s ago`;
}

function formatModel(model: string) {
  return (model || '').replace('claude-', '').replace('us.anthropic.', '').replace(/-(\d)/, ' $1');
}

export interface AgentCardProps {
  session: SessionState;
  onSendMessage: (id: string, msg: string) => void;
  onTerminate: (id: string) => void;
  onInterrupt: (id: string) => void;
  onReview: (id: string) => void;
  onViewHistory: (id: string) => void;
}

export function AgentCard({ session, onSendMessage, onTerminate, onInterrupt, onReview, onViewHistory }: AgentCardProps) {
  const [showSummary, setShowSummary] = useState(true);
  const [showLast, setShowLast] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const cfg = session.stuck ? STUCK_CONFIG : STATUS_CONFIG[session.status];
  const isAlive = session.status !== 'terminated';

  useEffect(() => {
    if (!menuOpen) return;
    const h = () => setMenuOpen(false);
    setTimeout(() => window.addEventListener('click', h, { once: true }), 0);
    return () => window.removeEventListener('click', h);
  }, [menuOpen]);

  const send = () => {
    const v = input.trim();
    if (!v) return;
    onSendMessage(session.id, v);
    setInput('');
    setSending(true);
    toast({ kind: 'success', title: 'Message sent', body: session.name });
    setTimeout(() => setSending(false), 1400);
  };

  const terminate = () => {
    if (!confirmKill) {
      setConfirmKill(true);
      setTimeout(() => setConfirmKill(false), 3000);
      return;
    }
    onTerminate(session.id);
    setConfirmKill(false);
    toast({ kind: 'info', title: 'Session terminated', body: session.name });
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(session.id);
      toast({ kind: 'success', title: 'Session ID copied' });
    } catch { toast({ kind: 'error', title: 'Copy failed' }); }
  };

  const autosize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(160, el.scrollHeight) + 'px';
  };

  return (
    <div
      className="fade-in"
      style={{
        position: 'relative',
        background: 'linear-gradient(180deg, rgba(var(--panel-rgb), 0.65), rgba(var(--panel-2-rgb), 0.85))',
        border: `1px solid ${session.stuck ? 'rgba(251,191,36,0.35)' : 'var(--border)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: session.stuck
          ? '0 0 0 1px rgba(251,191,36,0.25), 0 12px 30px rgba(251,191,36,0.08)'
          : '0 8px 20px rgba(0,0,0,0.35)',
        transition: 'all 220ms',
      }}
    >
      {/* Glow accent */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${cfg.color}, transparent 70%)`,
          opacity: isAlive ? 0.9 : 0.3,
        }}
      />

      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {/* Avatar / icon */}
          <div
            style={{
              flexShrink: 0,
              width: 36, height: 36, borderRadius: 10,
              display: 'grid', placeItems: 'center',
              background: `radial-gradient(circle at 30% 30%, rgba(${cfg.glow}, 0.4), rgba(${cfg.glow}, 0.08))`,
              border: `1px solid rgba(${cfg.glow}, 0.35)`,
              color: cfg.color,
              fontSize: 14,
              fontWeight: 700,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 14px rgba(${cfg.glow}, 0.18)`,
            }}
          >
            {session.status === 'busy' ? '⚙' : session.stuck ? '⚠' : session.status === 'starting' ? '✦' : session.status === 'terminated' ? '◌' : '◉'}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              <span className="mono" style={{
                fontSize: 10, fontWeight: 700, color: 'var(--text-4)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                {session.currentTask}
              </span>
              {session.model && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--text-3)',
                  background: 'var(--tint)', border: '1px solid var(--border)',
                  padding: '1px 7px', borderRadius: 999,
                }}>
                  {formatModel(session.model)}
                </span>
              )}
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-0)', lineHeight: 1.4, wordBreak: 'break-word' }}>
              {session.name}
            </div>
          </div>

          <div style={{ position: 'relative', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <span className="chip" style={{ color: cfg.color, background: `rgba(${cfg.glow}, 0.1)`, borderColor: `rgba(${cfg.glow}, 0.25)` }}>
              <span className={`dot ${cfg.pulse ? 'dot-pulse' : ''}`} style={{ color: cfg.color }} />
              {cfg.label}
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-4)' }}>
              {formatAgo(session.lastActivityMs)}
            </span>
          </div>
        </div>

        {/* Meta bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--text-3)',
          padding: '6px 10px', background: 'var(--deep)', borderRadius: 8,
          border: '1px solid var(--border)',
        }}>
          <span className="tt" data-tt="Click to copy" onClick={copyId} style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
            {session.id.slice(0, 8)}
          </span>
          <span style={{ color: 'var(--text-5)' }}>•</span>
          <span className="mono" title="Elapsed">{formatElapsed(session.elapsedMs)}</span>
          {session.nudged && !session.stuck && <>
            <span style={{ color: 'var(--text-5)' }}>•</span>
            <span style={{ color: 'var(--busy)' }}>↩ nudged</span>
          </>}
        </div>

        {/* Badges */}
        {(session.reviewState || session.stuck) && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {session.stuck && <Badge color="var(--warn)" glow="var(--warn-glow)">⚠ stuck</Badge>}
            {session.reviewState === 'reviewing'       && <Badge color="var(--info)"   glow="var(--info-glow)">🔍 reviewing</Badge>}
            {session.reviewState === 'passed'          && <Badge color="var(--ok)"     glow="var(--ok-glow)">✓ review passed</Badge>}
            {(session.reviewState === 'correction_sent' || session.reviewState === 'awaiting_fix') && (
              <Badge color="#EE8434" glow="238, 132, 52">↻ fix requested ({session.reviewCount}/3)</Badge>
            )}
            {session.reviewState === 'failed_max_retries' && (
              <Badge color="var(--danger)" glow="var(--danger-glow)">✕ review failed ({session.reviewCount})</Badge>
            )}
          </div>
        )}

        {/* CR Links */}
        {session.crLinks && session.crLinks.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {session.crLinks.map(cr => (
              <a
                key={cr}
                href={`https://code.amazon.com/reviews/${cr}`}
                target="_blank"
                rel="noopener noreferrer"
                className="chip"
                style={{
                  fontSize: 10, textDecoration: 'none',
                  color: 'var(--info)', background: 'rgba(var(--info-glow), 0.08)',
                  borderColor: 'rgba(var(--info-glow), 0.28)',
                  cursor: 'pointer',
                }}
              >
                🔗 {cr}
              </a>
            ))}
          </div>
        )}

        {/* Summary */}
        {session.summary && showSummary && (
          <div
            onClick={() => setShowSummary(false)}
            style={{
              fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.65,
              background: `linear-gradient(90deg, rgba(${cfg.glow}, 0.06), var(--deep))`,
              borderLeft: `2px solid ${cfg.color}`,
              borderRadius: '0 8px 8px 0',
              padding: '10px 12px',
              cursor: 'pointer',
            }}
          >
            {session.summary}
          </div>
        )}

        {/* Review issues */}
        {session.reviewIssues && session.reviewIssues.length > 0 && session.reviewState !== 'passed' && (
          <div style={{
            fontSize: 11.5, color: '#EE8434', lineHeight: 1.55,
            borderLeft: '2px solid rgba(238, 132, 52,0.4)',
            background: 'rgba(238, 132, 52,0.04)',
            borderRadius: '0 8px 8px 0',
            padding: '8px 12px',
          }}>
            {session.reviewIssues.map((issue, i) => <div key={i}>• {issue}</div>)}
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-xs" onClick={() => onViewHistory(session.id)}>
            💬 Chat
          </button>
          {session.lastMessage && (
            <button className="btn btn-ghost btn-xs" onClick={() => setShowLast(v => !v)}>
              {showLast ? '▾ Hide output' : '▸ Last output'}
            </button>
          )}
          {isAlive && (
            <button className="btn btn-ghost btn-xs" onClick={() => onReview(session.id)} style={{ color: 'var(--info)' }}>
              🔍 Review
            </button>
          )}
          <div style={{ flex: 1 }} />
          {isAlive && (
            <button className="btn btn-ghost btn-xs tt" data-tt="Copy session ID" onClick={copyId}>⎘</button>
          )}
        </div>

        {showLast && session.lastMessage && (
          <div style={{
            fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6,
            background: 'var(--deep-2)', borderRadius: 8,
            padding: '10px 12px', maxHeight: 200, overflowY: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            border: '1px solid var(--border)', fontFamily: 'var(--font-mono)',
          }}>
            {session.lastMessage}
          </div>
        )}

        {/* Input area */}
        {isAlive && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                ref={taRef}
                className="textarea"
                value={input}
                onChange={e => { setInput(e.target.value); autosize(); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                rows={1}
                placeholder="Message agent… (Shift+Enter for newline)"
                style={{
                  minHeight: 38, padding: '9px 12px', fontSize: 12.5,
                  resize: 'none', lineHeight: 1.5,
                }}
              />
            </div>
            <button
              className={`btn ${sending ? '' : 'btn-primary'}`}
              onClick={send}
              disabled={!input.trim() && !sending}
              style={{
                padding: '9px 14px', height: 38,
                background: sending ? 'rgba(52,211,153,0.15)' : undefined,
                color: sending ? 'var(--ok)' : undefined,
                borderColor: sending ? 'rgba(52,211,153,0.3)' : undefined,
              }}
            >
              {sending ? '✓ Sent' : 'Send'}
            </button>
            <button
              className="btn btn-warn tt"
              data-tt="Interrupt"
              onClick={() => onInterrupt(session.id)}
              style={{ padding: '9px 11px', height: 38 }}
            >
              ⏹
            </button>
            <button
              className="btn btn-danger tt"
              data-tt={confirmKill ? 'Click again to confirm' : 'Terminate'}
              onClick={terminate}
              style={{
                padding: '9px 11px', height: 38,
                background: confirmKill ? 'rgba(248,113,113,0.18)' : undefined,
                color: confirmKill ? 'var(--danger)' : undefined,
                borderColor: confirmKill ? 'rgba(248,113,113,0.35)' : undefined,
              }}
            >
              {confirmKill ? '? Confirm' : '✕'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ children, color, glow }: { children: React.ReactNode; color: string; glow: string }) {
  return (
    <span className="chip" style={{
      color,
      background: `rgba(${glow}, 0.08)`,
      borderColor: `rgba(${glow}, 0.28)`,
      fontSize: 10,
    }}>
      {children}
    </span>
  );
}

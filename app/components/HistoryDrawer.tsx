import { useEffect, useMemo, useRef, useState } from 'react';
import { HistoryMessage } from '../hooks/useWebSocket';
import { useToast } from './Toast';

const ROLE_META: Record<string, { label: string; color: string; glow: string; icon: string }> = {
  user:      { label: 'You',     color: 'var(--busy)', glow: 'var(--busy-glow)', icon: '🧑' },
  assistant: { label: 'Agent',   color: 'var(--info)', glow: 'var(--info-glow)', icon: '✦' },
  tool:      { label: 'Tool',    color: 'var(--ok)',   glow: 'var(--ok-glow)',   icon: '🔧' },
  system:    { label: 'System',  color: 'var(--idle)', glow: 'var(--idle-glow)', icon: '⚙' },
};

function meta(role: string) { return ROLE_META[role] ?? ROLE_META.assistant; }

function renderMessage(text: string) {
  // Simple code block split on ```
  const parts = text.split(/```([\s\S]*?)```/);
  return parts.map((p, i) => {
    if (i % 2 === 1) {
      // code block
      const m = p.match(/^(\w+)?\n?([\s\S]*)$/);
      const lang = m?.[1] ?? '';
      const body = m?.[2] ?? p;
      return (
        <pre key={i} style={{
          background: 'var(--deep-2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '10px 12px',
          margin: '8px 0',
          overflowX: 'auto',
          fontSize: 11.5,
          lineHeight: 1.55,
          color: 'var(--text-1)',
          fontFamily: 'var(--font-mono)',
        }}>
          {lang && <div style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{lang}</div>}
          {body.replace(/\n$/, '')}
        </pre>
      );
    }
    return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{p}</span>;
  });
}

export function SessionChat({ sessionId, sessionName, messages, onClose, onRefresh, onSend }: {
  sessionId: string;
  sessionName: string;
  messages: HistoryMessage[];
  onClose: () => void;
  onRefresh: () => void;
  onSend: (sessionId: string, message: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Poll for updates while the drawer is open
  useEffect(() => {
    const interval = setInterval(onRefresh, 2000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  // Scroll to bottom on first open
  const initialScroll = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (initialScroll.current) {
      el.scrollTop = el.scrollHeight;
      initialScroll.current = false;
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(m => m.text.toLowerCase().includes(q));
  }, [query, messages]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ kind: 'success', title: 'Copied' }); }
    catch { toast({ kind: 'error', title: 'Copy failed' }); }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    messages.forEach(m => { c[m.role] = (c[m.role] ?? 0) + 1; });
    return c;
  }, [messages]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 40,
        }}
      />
      <div
        className="slide-in-right"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(720px, 94vw)',
          background: 'linear-gradient(180deg, rgba(var(--panel-2-rgb), 0.98), rgba(7,9,15,0.98))',
          borderLeft: '1px solid var(--border-strong)',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
          zIndex: 50,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                Conversation
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-0)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sessionName}
              </div>
            </div>
            <button className="icon-btn" onClick={onClose}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', background: 'var(--deep)',
              border: '1px solid var(--border)', borderRadius: 8,
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-4)' }}>⌕</span>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search messages…"
                style={{ flex: 1, fontSize: 12.5 }}
              />
              {query && (
                <button className="icon-btn" onClick={() => setQuery('')} style={{ width: 20, height: 20, fontSize: 11 }}>✕</button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
              {filtered.length}/{messages.length}
            </div>
          </div>

          {Object.keys(counts).length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(counts).map(([role, count]) => {
                const m = meta(role);
                return (
                  <span
                    key={role}
                    className="chip"
                    style={{ color: m.color, background: `rgba(${m.glow}, 0.08)`, borderColor: `rgba(${m.glow}, 0.22)`, fontSize: 10.5 }}
                  >
                    {m.icon} {m.label} <span style={{ color: 'var(--text-4)', marginLeft: 2 }}>{count}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: 'auto', padding: '20px 22px',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
        >
          {filtered.length === 0 && (
            <div style={{ color: 'var(--text-5)', fontSize: 13, textAlign: 'center', marginTop: 80 }}>
              {messages.length === 0 ? 'No messages yet' : 'No messages match your search'}
            </div>
          )}
          {filtered.map((msg, i) => {
            const m = meta(msg.role);
            const isUser = msg.role === 'user';
            const isTool = msg.role === 'tool';
            return (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                gap: 4,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                }}>
                  <span className="chip" style={{
                    color: m.color,
                    background: `rgba(${m.glow}, 0.1)`,
                    borderColor: `rgba(${m.glow}, 0.22)`,
                    fontSize: 10, padding: '2px 8px',
                  }}>
                    {m.icon} {m.label}
                  </span>
                  <button
                    className="icon-btn tt"
                    data-tt="Copy"
                    onClick={() => copy(msg.text)}
                    style={{ width: 20, height: 20, fontSize: 11, color: 'var(--text-5)' }}
                  >
                    ⎘
                  </button>
                </div>
                <div style={{
                  maxWidth: '90%',
                  background: isUser
                    ? 'linear-gradient(135deg, rgba(96,165,250,0.18), rgba(96,165,250,0.08))'
                    : isTool
                    ? 'rgba(52,211,153,0.06)'
                    : 'var(--tint-lo)',
                  border: `1px solid ${isUser ? 'rgba(96,165,250,0.25)' : isTool ? 'rgba(52,211,153,0.18)' : 'var(--border)'}`,
                  borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                  padding: isTool ? '8px 12px' : '10px 14px',
                  fontSize: isTool ? 11.5 : 13,
                  color: isTool ? m.color : 'var(--text-1)',
                  lineHeight: 1.65,
                  wordBreak: 'break-word',
                  fontFamily: isTool ? 'var(--font-mono)' : 'inherit',
                }}>
                  {renderMessage(msg.text)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Message input */}
        <div style={{
          padding: '12px 22px 14px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, alignItems: 'flex-end',
        }}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim()) {
                  onSend(sessionId, draft.trim());
                  setDraft('');
                  setTimeout(onRefresh, 500);
                }
              }
            }}
            placeholder="Send a message…"
            rows={1}
            style={{
              flex: 1, fontSize: 13, lineHeight: 1.5,
              padding: '9px 12px',
              background: 'var(--deep)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text-1)',
              resize: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            className="btn btn-primary"
            disabled={!draft.trim()}
            onClick={() => {
              if (draft.trim()) {
                onSend(sessionId, draft.trim());
                setDraft('');
                setTimeout(onRefresh, 500);
              }
            }}
            style={{ padding: '9px 16px', fontSize: 12.5 }}
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}

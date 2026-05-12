import { useEffect, useMemo, useRef, useState } from 'react';
import Prism from 'prismjs';

const LANG_ALIASES: Record<string, string> = {
  ts: 'typescript', js: 'javascript', py: 'python',
  sh: 'bash', shell: 'bash', zsh: 'bash',
  yml: 'yaml', rb: 'ruby', rs: 'rust',
  dockerfile: 'docker', tf: 'hcl', kt: 'kotlin',
};

function getPrismGrammar(lang: string) {
  const resolved = LANG_ALIASES[lang] || lang;
  if (!Prism.languages[resolved]) {
    try { require(`prismjs/components/prism-${resolved}`); } catch {}
  }
  return Prism.languages[resolved];
}
import { HistoryMessage } from '../hooks/useWebSocket';
import { useToast } from './Toast';

const ROLE_META: Record<string, { label: string; color: string; glow: string; icon: string }> = {
  user:      { label: 'You',     color: 'var(--busy)', glow: 'var(--busy-glow)', icon: '🧑' },
  assistant: { label: 'Agent',   color: 'var(--info)', glow: 'var(--info-glow)', icon: '✦' },
  tool:      { label: 'Tool',    color: 'var(--ok)',   glow: 'var(--ok-glow)',   icon: '🔧' },
  system:    { label: 'System',  color: 'var(--idle)', glow: 'var(--idle-glow)', icon: '⚙' },
};

function meta(role: string) { return ROLE_META[role] ?? ROLE_META.assistant; }

function renderInline(text: string): React.ReactNode[] {
  // Process inline markdown: bold, italic, inline code, links
  const tokens: React.ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) tokens.push(text.slice(last, match.index));
    if (match[2] || match[3]) {
      tokens.push(<strong key={key++}>{match[2] || match[3]}</strong>);
    } else if (match[4] || match[5]) {
      tokens.push(<em key={key++}>{match[4] || match[5]}</em>);
    } else if (match[6]) {
      tokens.push(<code key={key++} style={{ background: 'var(--deep-2)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em', fontFamily: 'var(--font-mono)' }}>{match[6]}</code>);
    } else if (match[7] && match[8]) {
      tokens.push(<a key={key++} href={match[8]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--info)', textDecoration: 'underline' }}>{match[7]}</a>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}

function renderMessage(text: string) {
  // Split on fenced code blocks first
  const parts = text.split(/```([\s\S]*?)```/);
  return parts.map((p, i) => {
    if (i % 2 === 1) {
      const m = p.match(/^(\w+)?\n?([\s\S]*)$/);
      const lang = m?.[1] ?? '';
      const body = m?.[2] ?? p;
      const grammar = lang ? getPrismGrammar(lang) : null;
      const highlighted = grammar ? Prism.highlight(body.replace(/\n$/, ''), grammar, lang) : null;
      return (
        <pre key={i} className={grammar ? `language-${lang}` : undefined} style={{
          background: 'var(--deep-2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '10px 12px',
          margin: '8px 0',
          overflowX: 'auto',
          fontSize: 11.5,
          lineHeight: 1.55,
          color: 'var(--text-1)',
          minWidth: 300,
          fontFamily: 'var(--font-mono)',
        }}>
          {lang && <div style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{lang}</div>}
          {highlighted
            ? <code dangerouslySetInnerHTML={{ __html: highlighted }} />
            : body.replace(/\n$/, '')}
        </pre>
      );
    }
    // Process block-level markdown: headings, lists, paragraphs
    const lines = p.split('\n');
    const blocks: React.ReactNode[] = [];
    let listItems: string[] = [];
    const flushList = () => {
      if (listItems.length === 0) return;
      blocks.push(
        <ul key={`ul-${blocks.length}`} style={{ margin: '4px 0', paddingLeft: 20 }}>
          {listItems.map((li, j) => <li key={j} style={{ marginBottom: 2 }}>{renderInline(li)}</li>)}
        </ul>
      );
      listItems = [];
    };
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        flushList();
        const level = headingMatch[1].length;
        const sizes = [16, 14.5, 13.5];
        blocks.push(
          <div key={`h-${li}`} style={{ fontSize: sizes[level - 1], fontWeight: 700, margin: '8px 0 4px', color: 'var(--text-0)' }}>
            {renderInline(headingMatch[2])}
          </div>
        );
      } else if (line.match(/^[-*]\s+/)) {
        listItems.push(line.replace(/^[-*]\s+/, ''));
      } else {
        flushList();
        if (line.trim()) {
          blocks.push(<span key={`p-${li}`}>{renderInline(line)}{'\n'}</span>);
        } else {
          blocks.push(<span key={`br-${li}`}>{'\n'}</span>);
        }
      }
    }
    flushList();
    return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{blocks}</span>;
  });
}

function formatTimestamp(ts?: number): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() !== now.toDateString()) {
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
  }
  return time;
}

function ToolGroup({ tools }: { tools: HistoryMessage[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          background: 'rgba(52,211,153,0.06)',
          border: '1px solid rgba(52,211,153,0.18)',
          borderRadius: 8, cursor: 'pointer',
          fontSize: 11, color: 'var(--ok)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms', display: 'inline-block' }}>▸</span>
        🔧 {tools.length} tool call{tools.length > 1 ? 's' : ''}
      </button>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 12, marginTop: 2 }}>
          {tools.map((t, i) => (
            <div key={i} style={{
              fontSize: 11, color: 'var(--ok)', fontFamily: 'var(--font-mono)',
              padding: '4px 8px', background: 'rgba(52,211,153,0.04)',
              borderRadius: 6, borderLeft: '2px solid rgba(52,211,153,0.3)',
            }}>
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionChat({ sessionId, sessionName, sessionStatus, messages, todo, pendingUserMsgs, onPendingChange, onClose, onRefresh, onSend, onInterrupt }: {
  sessionId: string;
  sessionName: string;
  sessionStatus?: string;
  messages: HistoryMessage[];
  todo?: { description: string; tasks: { id: string; description: string; completed: boolean; toolCalls?: string[] }[] }[] | null;
  pendingUserMsgs: string[];
  onPendingChange: (msgs: string[]) => void;
  onClose: () => void;
  onRefresh: () => void;
  onSend: (sessionId: string, message: string) => void;
  onInterrupt: (sessionId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);
  const [todoExpandedMap, setTodoExpandedMap] = useState<Record<number, boolean>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // File watcher on server pushes updates — no polling needed
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Clear pending messages once they appear in the real messages from the server
  useEffect(() => {
    if (pendingUserMsgs.length === 0) return;
    const lastReal = [...messages].reverse().find(m => m.role === 'user');
    if (lastReal && pendingUserMsgs.includes(lastReal.text)) {
      onPendingChange([]);
    }
  }, [messages, pendingUserMsgs, onPendingChange]);

  // Hide typing indicator when assistant responds or tools start executing
  const msgCountAtSend = useRef(messages.length);

  // Track expanded state per todo (default expanded)
  useEffect(() => {
    if (awaitingReply) {
      if (messages.length > msgCountAtSend.current) {
        const last = messages[messages.length - 1].role;
        if (last === 'assistant' || last === 'tool') {
          setAwaitingReply(false);
        }
      }
    } else {
      msgCountAtSend.current = messages.length;
    }
  }, [messages, awaitingReply]);

  // Merge real messages with optimistic pending ones
  const allMessages = useMemo((): HistoryMessage[] => {
    if (pendingUserMsgs.length === 0) return messages;
    return [...messages, ...pendingUserMsgs.map(text => ({ role: 'user', text, timestamp: Date.now() }))];
  }, [messages, pendingUserMsgs]);

  // Auto-scroll to bottom when messages change
  const prevCount = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const count = filtered.length;
    if (count !== prevCount.current) {
      prevCount.current = count;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allMessages;
    return allMessages.filter(m => m.text.toLowerCase().includes(q));
  }, [query, allMessages]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ kind: 'success', title: 'Copied' }); }
    catch { toast({ kind: 'error', title: 'Copy failed' }); }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    allMessages.forEach(m => { c[m.role] = (c[m.role] ?? 0) + 1; });
    return c;
  }, [allMessages]);

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
          width: expanded ? 'min(1100px, 98vw)' : 'min(720px, 94vw)',
          background: 'linear-gradient(180deg, rgba(var(--panel-2-rgb), 0.98), rgba(7,9,15,0.98))',
          borderLeft: '1px solid var(--border-strong)',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
          zIndex: 50,
          display: 'flex', flexDirection: 'column',
          transition: 'width 200ms ease',
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
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="icon-btn tt" data-tt={expanded ? 'Collapse' : 'Expand'} onClick={() => setExpanded(v => !v)}>{expanded ? '⊟' : '⛶'}</button>
              <button className="icon-btn" onClick={onClose}>✕</button>
            </div>
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
              {filtered.length}/{allMessages.length}
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
              {allMessages.length === 0 ? 'No messages yet' : 'No messages match your search'}
            </div>
          )}
          {filtered.map((msg, i) => {
            const m = meta(msg.role);
            const isUser = msg.role === 'user';
            const isTool = msg.role === 'tool';

            if (isTool) {
              // Hide todo_list tool calls — shown as inline checklists
              if (msg.text.startsWith('todo_list:') || msg.text === 'todo_list') {
                // Render checklist at the LAST todo_list call for each todo list
                // Count which "create" this belongs to by counting creates up to this point
                const isCreate = msg.text.includes('Creating') || msg.text.includes('create');
                if (!isCreate) {
                  // For non-create calls, check if this is the last todo_list call for the current todo
                  const nextTodoCall = filtered.slice(i + 1).findIndex(m => m.role === 'tool' && (m.text.startsWith('todo_list:') || m.text === 'todo_list'));
                  const nextIsCreate = nextTodoCall >= 0 && (filtered[i + 1 + nextTodoCall].text.includes('Creating') || filtered[i + 1 + nextTodoCall].text.includes('create'));
                  const hasMoreForThisTodo = nextTodoCall >= 0 && !nextIsCreate;
                  if (hasMoreForThisTodo) return null;
                }
                // Count how many creates have occurred up to and including this point
                let createIdx = 0;
                for (let k = 0; k <= i; k++) {
                  if (filtered[k].role === 'tool' && (filtered[k].text.includes('Creating') || (filtered[k].text.startsWith('todo_list:') && filtered[k].text.includes('create')))) {
                    createIdx++;
                  }
                }
                const todoItem = todo && todo[createIdx - 1];
                if (!todoItem || todoItem.tasks.length === 0) return null;
                if (isCreate) {
                  // For create calls, only render if there are no more todo_list calls for this todo after
                  const nextTodoCall = filtered.slice(i + 1).findIndex(m => m.role === 'tool' && (m.text.startsWith('todo_list:') || m.text === 'todo_list'));
                  const nextIsNewCreate = nextTodoCall >= 0 && (filtered[i + 1 + nextTodoCall].text.includes('Creating') || filtered[i + 1 + nextTodoCall].text.includes('create'));
                  if (nextTodoCall >= 0 && !nextIsNewCreate) return null;
                }
                const completed = todoItem.tasks.filter(t => t.completed).length;
                const firstIncomplete = todoItem.tasks.find(t => !t.completed);
                const isExpanded = todoExpandedMap[createIdx - 1] !== false; // default expanded
                return (
                  <div key={i} style={{
                    padding: '10px 12px', background: 'var(--deep)',
                    border: '1px solid var(--border)', borderRadius: 10,
                    fontSize: 12,
                  }}>
                    <div
                      onClick={() => setTodoExpandedMap(m => ({ ...m, [createIdx - 1]: !isExpanded }))}
                      style={{ fontWeight: 600, color: 'var(--text-1)', display: 'flex', justifyContent: 'space-between', cursor: 'pointer', alignItems: 'center' }}
                    >
                      <span>
                        <span style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms', marginRight: 6 }}>▸</span>
                        📋 {todoItem.description}
                      </span>
                      <span style={{ color: completed === todoItem.tasks.length ? 'var(--ok)' : 'var(--text-4)', fontSize: 11 }}>{completed}/{todoItem.tasks.length}</span>
                    </div>
                    {isExpanded && (
                      <div style={{ marginTop: 6 }}>
                        {todoItem.tasks.map(t => (
                          <div key={t.id}>
                            <div style={{ color: t.completed ? 'var(--ok)' : todo && createIdx === todo.length && t.id === firstIncomplete?.id && sessionStatus === 'busy' ? 'var(--info)' : 'var(--text-3)', marginLeft: 2, lineHeight: 1.8, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {t.completed ? '✓' : todo && createIdx === todo.length && t.id === firstIncomplete?.id && sessionStatus === 'busy' ? <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid var(--info)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : '◻'} {t.description}
                            </div>
                            {t.toolCalls && t.toolCalls.length > 0 && (
                              <div style={{ marginLeft: 22, borderLeft: '1px solid var(--border)', paddingLeft: 8, marginTop: 2, marginBottom: 4 }}>
                                {t.toolCalls.map((tc, j) => (
                                  <div key={j} style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                                    🔧 {tc}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                  </div>
                );
              }

              // Hide tool calls that are already shown nested under a todo task
              const toolText = msg.text;
              const isAssignedToTask = todo && todo.some(list => list.tasks.some(t => t.toolCalls?.includes(toolText)));
              if (isAssignedToTask) return null;

              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px' }}>
                  <span style={{
                    fontSize: 11, color: 'var(--ok)', fontFamily: 'var(--font-mono)',
                    padding: '4px 10px', background: 'rgba(52,211,153,0.06)',
                    border: '1px solid rgba(52,211,153,0.18)',
                    borderRadius: 6,
                  }}>
                    🔧 {msg.text}
                  </span>
                </div>
              );
            }

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
                  {msg.timestamp && (
                    <span style={{ fontSize: 10, color: 'var(--text-5)' }}>
                      {formatTimestamp(msg.timestamp)}
                    </span>
                  )}
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
                    : 'var(--tint-lo)',
                  border: `1px solid ${isUser ? 'rgba(96,165,250,0.25)' : 'var(--border)'}`,
                  borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                  padding: '10px 14px',
                  fontSize: 13,
                  color: 'var(--text-1)',
                  lineHeight: 1.65,
                  wordBreak: 'break-word',
                }}>
                  {renderMessage(msg.text)}
                </div>
              </div>
            );
          })}
          {awaitingReply && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', animation: 'fade-in 0.3s ease 0.3s both' }}>
              <span className="chip" style={{
                color: 'var(--info)', background: 'rgba(var(--info-glow), 0.1)',
                borderColor: 'rgba(var(--info-glow), 0.22)',
                fontSize: 10, padding: '2px 8px',
              }}>
                ✦ Agent is thinking
              </span>
              <style>{`@keyframes tbounce{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}`}</style>
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--info)', animation: 'tbounce 1.4s infinite', animationDelay: '0s' }} />
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--info)', animation: 'tbounce 1.4s infinite', animationDelay: '0.2s' }} />
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--info)', animation: 'tbounce 1.4s infinite', animationDelay: '0.4s' }} />
              </span>
            </div>
          )}
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
            onChange={e => {
              setDraft(e.target.value);
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = Math.min(120, el.scrollHeight) + 'px';
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim()) {
                  const text = draft.trim();
                  onSend(sessionId, text);
                  onPendingChange([...pendingUserMsgs, text]);
                  setDraft('');
                  setAwaitingReply(true);
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
                const text = draft.trim();
                onSend(sessionId, text);
                onPendingChange([...pendingUserMsgs, text]);
                setDraft('');
                setAwaitingReply(true);
              }
            }}
            style={{ padding: '9px 16px', fontSize: 12.5 }}
          >
            Send
          </button>
          <button
            className="btn btn-warn tt"
            data-tt="Interrupt"
            onClick={() => { onInterrupt(sessionId); setAwaitingReply(false); }}
            style={{ padding: '9px 11px', fontSize: 12.5 }}
          >
            ⏹
          </button>
        </div>
      </div>
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useWebSocket } from '../hooks/useWebSocket';
import { AgentCard } from '../components/AgentCard';
import { Layout } from '../components/Layout';
import { HistoryDrawer } from '../components/HistoryDrawer';
import { NewSessionModal } from '../components/NewSessionModal';
import { CommandPalette } from '../components/CommandPalette';
import { useToast } from '../components/Toast';
import { SessionState } from '../types/session';

type Filter = 'all' | 'busy' | 'idle' | 'stuck' | 'starting';

export default function Home() {
  const {
    sessions, sendMessage, terminateSession, interruptSession, reviewSession,
    startSession, getHistory, clearHistory, history, connected,
  } = useWebSocket();
  const { toast } = useToast();

  const [showNewSession, setShowNewSession] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const searchRef = useRef<HTMLInputElement>(null);

  const active = sessions.filter(s => s.status !== 'terminated');
  const terminated = sessions.filter(s => s.status === 'terminated');

  const counts = useMemo(() => ({
    all: active.length,
    busy: active.filter(s => s.status === 'busy' && !s.stuck).length,
    idle: active.filter(s => s.status === 'idle' && !s.stuck).length,
    starting: active.filter(s => s.status === 'starting').length,
    stuck: active.filter(s => s.stuck).length,
  }), [active]);

  const filtered = useMemo(() => {
    let list = [...active];
    if (filter === 'stuck') list = list.filter(s => s.stuck);
    else if (filter === 'busy') list = list.filter(s => s.status === 'busy' && !s.stuck);
    else if (filter === 'idle') list = list.filter(s => s.status === 'idle' && !s.stuck);
    else if (filter === 'starting') list = list.filter(s => s.status === 'starting');
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.summary?.toLowerCase().includes(q) ||
      s.currentTask.toLowerCase().includes(q)
    );
    // Stable order: by start time, ascending. Don't re-sort on status changes.
    return list.sort((a, b) => a.startTime - b.startTime);
  }, [active, filter, query]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowPalette(s => !s);
      }
      if (!editing) {
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setShowNewSession(true); }
        if (e.key === '/')                  { e.preventDefault(); searchRef.current?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleStart = (prompt: string, model: string) => {
    startSession(prompt, model);
    toast({ kind: 'success', title: 'Session requested', body: model });
  };

  const stats = { active: counts.all, busy: counts.busy, stuck: counts.stuck, terminated: terminated.length };

  return (
    <Layout
      connected={connected}
      stats={stats}
      onOpenPalette={() => setShowPalette(true)}
      onOpenNew={() => setShowNewSession(true)}
    >
      {/* Hero */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-0)', letterSpacing: '-0.03em', margin: 0 }}>
              Sessions
              <span style={{ color: 'var(--text-4)', fontWeight: 500, fontSize: 15, marginLeft: 10 }}>
                {counts.all} active
                {counts.stuck > 0 && <span style={{ color: 'var(--warn)' }}> · {counts.stuck} need attention</span>}
              </span>
            </h1>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
              Monitor and orchestrate all running kiro-cli agents.
              {terminated.length > 0 && (
                <Link href="/history" style={{ marginLeft: 6, color: 'var(--text-2)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  {terminated.length} in history →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        marginBottom: 18, padding: 10,
        background: 'rgba(var(--panel-rgb), 0.45)',
        border: '1px solid var(--border)', borderRadius: 12,
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <FilterChip active={filter === 'all'}     onClick={() => setFilter('all')}     label="All"      count={counts.all} />
          <FilterChip active={filter === 'busy'}    onClick={() => setFilter('busy')}    label="Working"  count={counts.busy}  color="var(--ok)" />
          <FilterChip active={filter === 'idle'}    onClick={() => setFilter('idle')}    label="Idle"     count={counts.idle}  color="var(--idle)" />
          <FilterChip active={filter === 'starting'}onClick={() => setFilter('starting')}label="Starting" count={counts.starting} color="var(--info)" />
          <FilterChip active={filter === 'stuck'}   onClick={() => setFilter('stuck')}   label="Stuck"    count={counts.stuck} color="var(--warn)" />
        </div>

        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', background: 'var(--deep)',
          border: '1px solid var(--border)', borderRadius: 8,
          minWidth: 200,
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-4)' }}>⌕</span>
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, id, task…"
            style={{ flex: 1, fontSize: 12.5 }}
          />
          <span className="kbd" style={{ fontSize: 10 }}>/</span>
        </div>

        <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--deep)', border: '1px solid var(--border)', borderRadius: 7 }}>
          <button
            className="btn btn-xs"
            onClick={() => setView('grid')}
            style={{
              background: view === 'grid' ? 'var(--tint-hi)' : 'transparent',
              color: view === 'grid' ? 'var(--text-0)' : 'var(--text-4)',
              border: 'none',
            }}
          >▦ Grid</button>
          <button
            className="btn btn-xs"
            onClick={() => setView('list')}
            style={{
              background: view === 'list' ? 'var(--tint-hi)' : 'transparent',
              color: view === 'list' ? 'var(--text-0)' : 'var(--text-4)',
              border: 'none',
            }}
          >≡ List</button>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          hasAny={active.length > 0}
          filtered={!!query || filter !== 'all'}
          onClear={() => { setQuery(''); setFilter('all'); }}
          onNew={() => setShowNewSession(true)}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: view === 'grid'
            ? 'repeat(auto-fill, minmax(360px, 1fr))'
            : 'minmax(0, 1fr)',
          gap: 14,
        }}>
          {filtered.map(s => (
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
        <NewSessionModal onStart={handleStart} onClose={() => setShowNewSession(false)} />
      )}

      {history && (
        <HistoryDrawer
          sessionName={sessions.find(s => s.id === history.sessionId)?.name ?? history.sessionId.slice(0, 8)}
          messages={history.messages}
          onClose={clearHistory}
        />
      )}

      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        sessions={sessions}
        onNewSession={() => setShowNewSession(true)}
        onJumpToSession={(id) => getHistory(id)}
      />
    </Layout>
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
        padding: '6px 10px', fontSize: 12, fontWeight: 600,
        borderRadius: 7,
        background: active
          ? 'linear-gradient(180deg, rgba(var(--brand-glow),0.18), rgba(var(--brand-glow),0.06))'
          : 'transparent',
        border: `1px solid ${active ? 'rgba(var(--brand-glow),0.35)' : 'transparent'}`,
        color: active ? 'var(--text-0)' : (color ?? 'var(--text-3)'),
        cursor: 'pointer',
        transition: 'all 140ms',
      }}
    >
      {label}
      <span style={{
        fontSize: 10.5,
        color: active ? 'var(--text-2)' : 'var(--text-4)',
        background: active ? 'var(--tint-hi)' : 'var(--tint)',
        padding: '0 6px', borderRadius: 999,
        minWidth: 18, textAlign: 'center',
      }}>{count}</span>
    </button>
  );
}

function EmptyState({ hasAny, filtered, onClear, onNew }: {
  hasAny: boolean; filtered: boolean; onClear: () => void; onNew: () => void;
}) {
  if (filtered) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-4)' }}>
        <div style={{ fontSize: 36, opacity: 0.4 }}>⌕</div>
        <div style={{ fontSize: 15, color: 'var(--text-3)', marginTop: 12 }}>No sessions match</div>
        <button className="btn" onClick={onClear} style={{ marginTop: 14 }}>Clear filters</button>
      </div>
    );
  }
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '100px 20px', color: 'var(--text-4)',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 18,
        display: 'grid', placeItems: 'center',
        background: 'linear-gradient(135deg, rgba(var(--brand-glow),0.15), rgba(133, 199, 222,0.08))',
        border: '1px solid rgba(var(--brand-glow),0.3)',
        fontSize: 32, color: 'var(--info)',
        boxShadow: '0 0 30px rgba(var(--brand-glow),0.25)',
      }}>◌</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', marginTop: 18 }}>No active sessions</div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6, maxWidth: 420, textAlign: 'center' }}>
        Start an agent from the terminal with <code style={{ background: 'var(--tint-hi)', padding: '2px 7px', borderRadius: 4, fontSize: 12 }}>kiro-cli</code>,
        or click the button below to launch one right now.
      </div>
      <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={onNew}>
        ✦ Start a new session
      </button>
      <div style={{ fontSize: 11, color: 'var(--text-5)', marginTop: 14 }}>
        Tip: press <span className="kbd">N</span> anywhere to open a new session, <span className="kbd">/</span> to search
      </div>
    </div>
  );
}

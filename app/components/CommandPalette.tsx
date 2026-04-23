import { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { SessionState } from '../types/session';
import { useTheme } from '../hooks/useTheme';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  icon?: string;
  section: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  sessions,
  onNewSession,
  onJumpToSession,
}: {
  open: boolean;
  onClose: () => void;
  sessions: SessionState[];
  onNewSession: () => void;
  onJumpToSession: (id: string) => void;
}) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(''); setCursor(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'new',  label: 'New session',          hint: 'Start a new kiro-cli agent', icon: '＋', section: 'Actions',  run: () => { onNewSession(); onClose(); } },
      { id: 'theme', label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode', icon: theme === 'dark' ? '☀' : '☾', section: 'Actions', run: () => { toggle(); onClose(); } },
      { id: 'nav-sessions', label: 'Go to Sessions',         icon: '◆', section: 'Navigate', run: () => { router.push('/'); onClose(); } },
      { id: 'nav-orch',     label: 'Go to Orchestrator',     icon: '◈', section: 'Navigate', run: () => { router.push('/orchestrator'); onClose(); } },
      { id: 'nav-hist',     label: 'Go to Sessions',          icon: '◇', section: 'Navigate', run: () => { router.push('/history'); onClose(); } },
    ];
    const sessCmds: Command[] = sessions
      .filter(s => s.status !== 'terminated')
      .slice(0, 40)
      .map(s => ({
        id: `s-${s.id}`,
        label: s.name,
        hint: s.currentTask + (s.stuck ? ' · stuck' : ''),
        icon: '◉',
        section: 'Jump to session',
        run: () => { onJumpToSession(s.id); onClose(); },
      }));
    return [...base, ...sessCmds];
  }, [sessions, onNewSession, onClose, onJumpToSession, router, theme, toggle]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return commands;
    return commands.filter(c =>
      c.label.toLowerCase().includes(n) || (c.hint?.toLowerCase().includes(n) ?? false)
    );
  }, [q, commands]);

  useEffect(() => { setCursor(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(filtered.length - 1, c + 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
      if (e.key === 'Enter')     { e.preventDefault(); filtered[cursor]?.run(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, cursor, onClose]);

  if (!open) return null;

  let lastSection = '';
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          zIndex: 90,
        }}
      />
      <div
        className="fade-in-scale"
        style={{
          position: 'fixed', top: '16%', left: '50%', transform: 'translateX(-50%)',
          width: 'min(620px, 92vw)', zIndex: 100,
          background: 'rgba(var(--panel-2-rgb), 0.96)',
          backdropFilter: 'blur(18px) saturate(160%)',
          WebkitBackdropFilter: 'blur(18px) saturate(160%)',
          border: '1px solid var(--border-strong)',
          borderRadius: 14,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 15, color: 'var(--text-3)' }}>⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Type a command or search sessions…"
            style={{ flex: 1, fontSize: 14, color: 'var(--text-0)', background: 'transparent' }}
          />
          <span className="kbd">ESC</span>
        </div>

        <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '28px 18px', textAlign: 'center', fontSize: 13, color: 'var(--text-4)' }}>
              No matches
            </div>
          )}
          {filtered.map((c, i) => {
            const showSection = c.section !== lastSection;
            lastSection = c.section;
            return (
              <div key={c.id}>
                {showSection && (
                  <div style={{
                    padding: '8px 12px 4px', fontSize: 10, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-4)',
                  }}>{c.section}</div>
                )}
                <div
                  onClick={() => c.run()}
                  onMouseEnter={() => setCursor(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '9px 12px', borderRadius: 8,
                    background: cursor === i ? 'linear-gradient(90deg, rgba(var(--brand-glow),0.16), rgba(133, 199, 222,0.08))' : 'transparent',
                    border: `1px solid ${cursor === i ? 'rgba(var(--brand-glow),0.35)' : 'transparent'}`,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ color: cursor === i ? 'var(--text-0)' : 'var(--text-3)', fontSize: 14, width: 18 }}>{c.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.label}
                    </div>
                    {c.hint && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.hint}
                      </div>
                    )}
                  </div>
                  {cursor === i && <span className="kbd" style={{ opacity: 0.8 }}>↵</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '9px 14px',
          borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-4)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="kbd">↑</span><span className="kbd">↓</span> navigate
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="kbd">↵</span> run
          </span>
        </div>
      </div>
    </>
  );
}

import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode, useEffect, useState } from 'react';
import { useTheme } from '../hooks/useTheme';

export function Layout({
  children,
  connected,
  stats,
  onOpenPalette,
  onOpenNew,
}: {
  children: ReactNode;
  connected: boolean;
  stats?: { active: number; busy: number; stuck: number; terminated: number };
  onOpenPalette?: () => void;
  onOpenNew?: () => void;
}) {
  const { pathname } = useRouter();
  const { theme, toggle } = useTheme();
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);

  const mod = isMac ? '⌘' : 'Ctrl';

  const tabs = [
    { href: '/', label: 'Sessions', icon: '◆' },
    { href: '/orchestrator', label: 'Orchestrator', icon: '◈' },
    { href: '/history', label: 'Sessions', icon: '◇' },
  ];

  return (
    <div style={{ minHeight: '100vh' }}>
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          height: 62,
          borderBottom: '1px solid var(--border)',
          background: 'var(--nav-bg)',
          backdropFilter: 'blur(18px) saturate(140%)',
          WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        }}
      >
        {/* Left: logo + tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(135deg, #054A91, #85C7DE)',
                boxShadow: '0 4px 14px rgba(var(--brand-glow),0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
                fontSize: 14,
                fontWeight: 800,
                color: '#fff',
              }}
            >
              ⌘
            </span>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-0)', letterSpacing: '-0.02em' }}>
              Agent Supervisor
            </span>
          </Link>

          <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--tint-lo)', borderRadius: 10, border: '1px solid var(--border)' }}>
            {tabs.map(({ href, label, icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: active ? 'var(--text-0)' : 'var(--text-3)',
                    background: active ? 'linear-gradient(180deg, rgba(var(--brand-glow),0.22), rgba(var(--brand-glow),0.08))' : 'transparent',
                    boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 2px rgba(0,0,0,0.3)' : 'none',
                    border: `1px solid ${active ? 'rgba(var(--brand-glow),0.35)' : 'transparent'}`,
                    borderRadius: 7,
                    padding: '6px 12px',
                    transition: 'all 160ms',
                  }}
                >
                  <span style={{ opacity: 0.75 }}>{icon}</span>
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: quick stats + palette + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {stats && (
            <div style={{ display: 'flex', gap: 10, fontSize: 11.5, color: 'var(--text-3)', marginRight: 4 }}>
              <Stat label="active" value={stats.active} color="var(--text-1)" />
              <Stat label="busy" value={stats.busy} color="var(--busy)" />
              {stats.stuck > 0 && <Stat label="stuck" value={stats.stuck} color="var(--warn)" />}
            </div>
          )}

          {onOpenPalette && (
            <button
              className="btn btn-sm"
              onClick={onOpenPalette}
              title="Command palette"
              style={{ gap: 8, background: 'var(--tint-lo)' }}
            >
              <span style={{ opacity: 0.7 }}>⌕</span>
              <span style={{ color: 'var(--text-3)' }}>Search / Commands</span>
              <span className="kbd">{mod}</span>
              <span className="kbd">K</span>
            </button>
          )}

          {onOpenNew && (
            <button className="btn btn-primary btn-sm" onClick={onOpenNew}>
              <span style={{ fontSize: 13, lineHeight: 1, marginRight: 2 }}>＋</span>
              New session
            </button>
          )}

          <button
            className="icon-btn tt"
            data-tt={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            onClick={toggle}
            aria-label="Toggle theme"
            style={{ fontSize: 14 }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          <div
            className="tt"
            data-tt={connected ? 'Connected to supervisor' : 'Reconnecting…'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11.5,
              fontWeight: 600,
              color: connected ? 'var(--ok)' : 'var(--danger)',
              padding: '5px 10px',
              borderRadius: 999,
              background: connected ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
              border: `1px solid ${connected ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.22)'}`,
            }}
          >
            <span className={`dot ${connected ? '' : 'dot-pulse'}`} />
            {connected ? 'Live' : 'Offline'}
          </div>
        </div>
      </nav>

      <main style={{ padding: '28px 28px 80px', maxWidth: 1480, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      <span className="mono" style={{ fontWeight: 700, color, fontSize: 13 }}>{value}</span>
      <span style={{ color: 'var(--text-4)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
    </span>
  );
}

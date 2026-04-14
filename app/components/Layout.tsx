import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode } from 'react';

export function Layout({ children, connected }: { children: ReactNode; connected: boolean }) {
  const { pathname } = useRouter();

  return (
    <div style={{ minHeight: '100vh', background: '#0a0d14' }}>
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 56,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(10,13,20,0.8)',
        backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 30,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <span style={{
            fontSize: 15, fontWeight: 700, color: '#f1f5f9',
            letterSpacing: '-0.03em',
          }}>
            ◈ Agent Supervisor
          </span>
          <div style={{ display: 'flex', gap: 2 }}>
            {[
              { href: '/', label: 'Active' },
              { href: '/history', label: 'History' },
            ].map(({ href, label }) => (
              <Link key={href} href={href} style={{
                fontSize: 13, fontWeight: 500,
                color: pathname === href ? '#e2e8f0' : '#475569',
                background: pathname === href ? 'rgba(255,255,255,0.08)' : 'transparent',
                borderRadius: 6, padding: '5px 12px',
                textDecoration: 'none',
                transition: 'all 0.15s',
              }}>
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 600,
          color: connected ? '#4ade80' : '#ef4444',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: connected ? '#4ade80' : '#ef4444',
            animation: connected ? 'none' : 'pulse 1.5s ease-in-out infinite',
          }} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </nav>
      <main style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}

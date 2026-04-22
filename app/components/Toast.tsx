import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info' | 'warn';
export interface Toast { id: number; kind: ToastKind; title: string; body?: string; }

interface ToastCtx {
  toast: (t: Omit<Toast, 'id'>) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });
export const useToast = () => useContext(Ctx);

const ICON: Record<ToastKind, string> = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
const COLOR: Record<ToastKind, string> = {
  success: 'var(--ok)',
  error: 'var(--danger)',
  info: 'var(--busy)',
  warn: 'var(--warn)',
};
const BG: Record<ToastKind, string> = {
  success: 'rgba(52,211,153,0.08)',
  error: 'rgba(248,113,113,0.08)',
  info: 'rgba(96,165,250,0.08)',
  warn: 'rgba(251,191,36,0.08)',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { ...t, id }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 4000);
  }, []);

  const remove = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className="slide-in-right"
            style={{
              pointerEvents: 'auto',
              minWidth: 260,
              maxWidth: 380,
              display: 'flex',
              gap: 12,
              padding: '12px 14px',
              background: 'rgba(var(--panel-2-rgb), 0.92)',
              backdropFilter: 'blur(16px) saturate(140%)',
              WebkitBackdropFilter: 'blur(16px) saturate(140%)',
              border: `1px solid ${COLOR[t.kind]}40`,
              borderLeft: `3px solid ${COLOR[t.kind]}`,
              borderRadius: 10,
              boxShadow: '0 18px 40px rgba(0,0,0,0.5)',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 22,
                height: 22,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 999,
                background: BG[t.kind],
                color: COLOR[t.kind],
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {ICON[t.kind]}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)' }}>{t.title}</div>
              {t.body && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.45, wordBreak: 'break-word' }}>
                  {t.body}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

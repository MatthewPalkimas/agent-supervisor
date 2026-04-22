import { useState, useEffect, useRef } from 'react';

const MODELS = [
  { id: 'claude-sonnet-4.6', label: 'Sonnet 4.6', desc: 'Balanced, default',    tag: 'Default', accent: '#054A91' },
  { id: 'claude-opus-4.6',   label: 'Opus 4.6',   desc: 'Most capable',          tag: 'Pro',     accent: '#C95D63' },
  { id: 'claude-haiku-4.5',  label: 'Haiku 4.5',  desc: 'Fastest, lightweight',  tag: 'Fast',    accent: '#85C7DE' },
  { id: 'auto',              label: 'Auto',       desc: 'Let Kiro choose',       tag: 'Smart',   accent: '#8CB369' },
];

const TEMPLATES = [
  { label: 'Fix a bug',         prompt: 'Investigate and fix the following bug: ' },
  { label: 'Add a feature',     prompt: 'Add the following feature: ' },
  { label: 'Refactor code',     prompt: 'Refactor the following code to improve readability and maintainability: ' },
  { label: 'Write tests',       prompt: 'Write unit tests for: ' },
  { label: 'Review code',       prompt: 'Review the following code and suggest improvements: ' },
  { label: 'Explain code',      prompt: 'Explain how the following code works: ' },
];

export function NewSessionModal({ onStart, onClose }: {
  onStart: (prompt: string, model: string) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('claude-sonnet-4.6');
  const [starting, setStarting] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => { setTimeout(() => taRef.current?.focus(), 30); }, []);

  const start = () => {
    setStarting(true);
    onStart(prompt, model);
    setTimeout(onClose, 400);
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          zIndex: 90,
        }}
      />
      <div
        className="fade-in-scale"
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(600px, 94vw)',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: 'linear-gradient(180deg, rgba(var(--panel-rgb), 0.98), rgba(var(--panel-2-rgb), 0.98))',
          border: '1px solid var(--border-strong)',
          borderRadius: 16,
          boxShadow: '0 40px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
          zIndex: 100,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-0)' }}>
              Start a new session
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
              Spawn a kiro-cli agent with a model and initial prompt
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Model cards */}
          <div>
            <div style={{
              fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase',
              letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10,
            }}>Model</div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8,
            }}>
              {MODELS.map(m => {
                const selected = model === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    style={{
                      textAlign: 'left', padding: '11px 14px',
                      borderRadius: 10,
                      background: selected
                        ? `linear-gradient(135deg, ${m.accent}22, ${m.accent}08)`
                        : 'var(--tint-lo)',
                      border: `1px solid ${selected ? m.accent : 'var(--border)'}`,
                      color: 'var(--text-1)',
                      transition: 'all 180ms',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 4,
                      boxShadow: selected ? `0 0 0 1px ${m.accent}30, 0 6px 18px ${m.accent}22` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: 999,
                        background: m.accent,
                        boxShadow: `0 0 8px ${m.accent}`,
                      }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-0)' }}>{m.label}</span>
                      <span style={{
                        marginLeft: 'auto', fontSize: 10, fontWeight: 600,
                        color: selected ? m.accent : 'var(--text-4)',
                        background: selected ? `${m.accent}18` : 'var(--tint)',
                        padding: '1px 7px', borderRadius: 999,
                      }}>{m.tag}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{m.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick templates */}
          <div>
            <div style={{
              fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase',
              letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10,
            }}>Quick start</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TEMPLATES.map(t => (
                <button
                  key={t.label}
                  className="btn btn-xs"
                  onClick={() => { setPrompt(t.prompt); setTimeout(() => taRef.current?.focus(), 0); }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <div style={{
              fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase',
              letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10,
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            }}>
              <span>Initial prompt <span style={{ color: 'var(--text-5)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>optional</span></span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-5)' }}>{prompt.length} chars</span>
            </div>
            <textarea
              ref={taRef}
              className="textarea"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(); }}
              placeholder="What should this agent work on?"
              rows={5}
              style={{ fontSize: 13.5, lineHeight: 1.6 }}
            />
          </div>
        </div>

        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-4)', display: 'flex', gap: 10 }}>
            <span><span className="kbd">⌘</span> <span className="kbd">↵</span> start</span>
            <span><span className="kbd">ESC</span> cancel</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={start} disabled={starting}>
              {starting ? (
                <>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', animation: 'spin 800ms linear infinite' }} />
                  Starting…
                </>
              ) : (
                <>✦ Start session</>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

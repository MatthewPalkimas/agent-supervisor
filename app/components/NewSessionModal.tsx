import { useState, useEffect } from 'react';

const MODELS = [
  { id: 'claude-sonnet-4.6', label: 'Sonnet 4.6', default: true },
  { id: 'claude-opus-4.6',   label: 'Opus 4.6'   },
  { id: 'claude-haiku-4.5',  label: 'Haiku 4.5'  },
  { id: 'auto',              label: 'Auto'        },
];

export function NewSessionModal({ onStart, onClose }: {
  onStart: (prompt: string, model: string) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('claude-sonnet-4.6');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const start = () => { onStart(prompt, model); onClose(); };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 40,
        }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(480px, 90vw)',
        background: '#111520',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        padding: 28,
        zIndex: 50,
        display: 'flex', flexDirection: 'column', gap: 24,
        animation: 'fadeIn 0.2s ease-out',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
            New Session
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.04)', border: 'none',
              color: '#64748b', cursor: 'pointer', fontSize: 14,
              padding: '4px 8px', borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>

        {/* Model picker */}
        <div>
          <div style={{
            fontSize: 11, color: '#64748b', textTransform: 'uppercase',
            letterSpacing: '0.07em', fontWeight: 600, marginBottom: 10,
          }}>
            Model
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                style={{
                  padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: model === m.id ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                  color: model === m.id ? '#60a5fa' : '#64748b',
                  border: `1px solid ${model === m.id ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.15s',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt */}
        <div>
          <div style={{
            fontSize: 11, color: '#64748b', textTransform: 'uppercase',
            letterSpacing: '0.07em', fontWeight: 600, marginBottom: 10,
          }}>
            Initial prompt{' '}
            <span style={{
              color: '#334155', fontWeight: 400,
              textTransform: 'none', letterSpacing: 0,
            }}>
              (optional)
            </span>
          </div>
          <textarea
            autoFocus
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(); }}
            placeholder="What should this agent work on?"
            rows={3}
            style={{
              width: '100%', background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10, padding: '12px 14px',
              fontSize: 13, color: '#e2e8f0', outline: 'none',
              resize: 'none', fontFamily: 'inherit', lineHeight: 1.5,
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
          />
          <div style={{ fontSize: 11, color: '#334155', marginTop: 6 }}>
            ⌘↵ to start
          </div>
        </div>

        <button
          onClick={start}
          style={{
            padding: '11px', background: 'rgba(59,130,246,0.7)',
            color: '#e2e8f0', border: 'none',
            borderRadius: 10, cursor: 'pointer',
            fontSize: 13, fontWeight: 700,
            transition: 'background 0.15s',
          }}
        >
          Start Session
        </button>
      </div>
    </>
  );
}

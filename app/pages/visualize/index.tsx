import { useEffect, useState } from 'react';
import { Layout } from '../../components/Layout';

export default function Visualize() {
  const [pipelines, setPipelines] = useState<{ name: string; addedAt: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [host, setHost] = useState('localhost');

  useEffect(() => {
    setHost(window.location.hostname);
    fetch('/api/pipelines')
      .then(r => r.json())
      .then(d => { setPipelines(d.pipelines); setLoading(false); });
  }, []);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const removePipeline = (name: string) => {
    if (confirmDelete !== name) {
      setConfirmDelete(name);
      setTimeout(() => setConfirmDelete(prev => prev === name ? null : prev), 3000);
      return;
    }
    setConfirmDelete(null);
    fetch(`/api/pipelines?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
      .then(r => r.ok && setPipelines(prev => prev.filter(p => p.name !== name)));
  };

  return (
    <Layout connected={true}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-0)', letterSpacing: '-0.03em', margin: 0 }}>
            Visualize
            <span style={{ color: 'var(--text-4)', fontWeight: 500, fontSize: 15, marginLeft: 10 }}>
              {loading ? '…' : `${pipelines.length} pipeline${pipelines.length !== 1 ? 's' : ''}`}
            </span>
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>
            Pipeline visualizations served on port 9000.
          </div>
        </div>

        {/* Empty state */}
        {!loading && pipelines.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '80px 20px', color: 'var(--text-4)',
          }}>
            <div style={{ fontSize: 36, opacity: 0.4 }}>◫</div>
            <div style={{ fontSize: 15, color: 'var(--text-3)', marginTop: 12 }}>No pipelines yet</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-4)', marginTop: 8, textAlign: 'center', maxWidth: 420 }}>
              Run <code style={{ background: 'var(--tint-hi)', padding: '2px 7px', borderRadius: 4, fontSize: 12 }}>brazil-build app visualize -- --generate-only</code> then
              copy output to <code style={{ background: 'var(--tint-hi)', padding: '2px 7px', borderRadius: 4, fontSize: 12 }}>~/visualize-hub/</code>
            </div>
          </div>
        )}

        {/* Pipeline grid */}
        {pipelines.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {pipelines.map(({ name, addedAt }) => {
              const dateStr = new Date(addedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
              return (
                <div key={name} style={{
                  padding: '18px 20px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  backdropFilter: 'blur(10px)',
                  transition: 'border-color 140ms, box-shadow 140ms',
                }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderColor = 'var(--border-strong)';
                    el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderColor = 'var(--border)';
                    el.style.boxShadow = 'none';
                  }}
                >
                  {/* Name + date */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-0)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>
                      Added {dateStr}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a
                      href={`http://${host}:9000/${name}/`}
                      style={{
                        flex: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: '8px 12px', borderRadius: 8,
                        fontSize: 12, fontWeight: 600,
                        color: 'var(--text-1)',
                        background: 'rgba(5,74,145,0.22)',
                        border: '1px solid rgba(5,74,145,0.32)',
                        textDecoration: 'none',
                        transition: 'background 140ms',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(5,74,145,0.32)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(5,74,145,0.22)'; }}
                    >Open →</a>
                    <button
                      onClick={() => removePipeline(name)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '8px 10px', borderRadius: 8,
                        fontSize: 12, color: confirmDelete === name ? '#f87171' : 'var(--text-4)',
                        background: confirmDelete === name ? 'rgba(248,113,113,0.14)' : 'rgba(248,113,113,0.07)',
                        border: `1px solid ${confirmDelete === name ? 'rgba(248,113,113,0.4)' : 'rgba(248,113,113,0.15)'}`,
                        cursor: 'pointer',
                        transition: 'all 140ms',
                      }}
                      onMouseEnter={e => {
                        if (confirmDelete !== name) {
                          const el = e.currentTarget as HTMLButtonElement;
                          el.style.background = 'rgba(248,113,113,0.14)';
                          el.style.borderColor = 'rgba(248,113,113,0.28)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (confirmDelete !== name) {
                          const el = e.currentTarget as HTMLButtonElement;
                          el.style.background = 'rgba(248,113,113,0.07)';
                          el.style.borderColor = 'rgba(248,113,113,0.15)';
                        }
                      }}
                    >{confirmDelete === name ? 'Confirm?' : '✕'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

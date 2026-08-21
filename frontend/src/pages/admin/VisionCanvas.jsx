import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, Spinner, EmptyState, Badge } from '../../components/ui';

export default function VisionCanvas() {
  const [visions, setVisions] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get('/visions').then(setVisions).catch(() => setVisions([]));
  }, []);

  if (!visions) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Vision Canvas"
        subtitle="Every brain-dump you've given the AI, with its decomposed roadmap"
        actions={<a href="/assign" className="btn-primary">New brain-dump →</a>}
      />

      {visions.length === 0 && (
        <EmptyState icon="🧠" title="No visions yet" body="Type a brain-dump on the Assign Tasks page and the AI will decompose it here." />
      )}

      <div className="space-y-4">
        {visions.map((v) => {
          const isOpen = expanded === v.id;
          return (
            <div key={v.id} className="card p-5">
              <button className="flex w-full items-center justify-between gap-4 text-left" onClick={() => setExpanded(isOpen ? null : v.id)}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-semibold text-slate-900">{v.rawText?.split('\n')[0]?.slice(0, 90) || 'Untitled vision'}</h2>
                    <Badge className={v.status === 'LIVE' ? 'bg-emerald-soft text-emerald-700' : 'bg-amber-soft text-amber-700'}>
                      {v.status === 'LIVE' ? 'Live' : v.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(v.createdAt).toLocaleString()} · {v.roadmaps?.length || 0} roadmap items · {v.products?.length || 0} products linked
                  </p>
                </div>
                <span className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
              </button>

              {isOpen && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="mb-3 rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Raw brain-dump</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{v.rawText}</p>
                  </div>

                  {v.roadmaps?.length > 0 && (
                    <div className="space-y-3">
                      {v.roadmaps.map((rm) => (
                        <div key={rm.id} className="rounded-lg border border-slate-200 p-4">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-brand-soft text-brand">{rm.horizon}</Badge>
                            <p className="font-semibold text-slate-800">{rm.title}</p>
                          </div>
                          {rm.description && <p className="mt-1 text-xs text-slate-500">{rm.description}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {v.products?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {v.products.map((p) => <Badge key={p.productId} className="bg-slate-100 text-slate-600">{p.product?.name}</Badge>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

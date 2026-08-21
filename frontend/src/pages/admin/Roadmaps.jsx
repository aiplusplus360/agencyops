import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { PageHeader, Spinner, StatusBadge, Countdown } from '../../components/ui';

const horizonOrder = { D15: 0, D30: 1, D60_90: 2 };
const horizonLabel = { D15: '15-Day Runway', D30: '30-Day Milestones', D60_90: '60-90 Day Horizons' };
const horizonColor = { D15: 'border-l-brand', D30: 'border-l-emerald', D60_90: 'border-l-amber' };

export default function Roadmaps() {
  const [roadmaps, setRoadmaps] = useState(null);

  useEffect(() => {
    api.get('/roadmaps').then(setRoadmaps).catch(() => setRoadmaps([]));
  }, []);

  if (!roadmaps) return <Spinner />;
  const sorted = [...roadmaps].sort((a, b) => (horizonOrder[a.horizon] ?? 9) - (horizonOrder[b.horizon] ?? 9));

  return (
    <div>
      <PageHeader title="Temporal Horizon Matrix" subtitle="The project trajectory mapped into sequential time-blocks" />
      <div className="grid gap-6 lg:grid-cols-3">
        {['D15', 'D30', 'D60_90'].map((h) => {
          const group = sorted.filter((r) => r.horizon === h);
          return (
            <div key={h} className="card border-t-4 p-5">
              <h2 className="font-bold text-slate-900">{horizonLabel[h]}</h2>
              <p className="mb-4 text-xs text-slate-400">{group.reduce((s, r) => s + (r.tasks?.length || 0), 0)} tasks</p>
              {group.length === 0 && <p className="text-sm text-slate-500">No milestones in this horizon yet.</p>}
              <div className="space-y-3">
                {group.map((rm) => {
                  const total = rm.tasks?.length || 0;
                  const done = rm.tasks?.filter((t) => t.status === 'COMPLETED').length || 0;
                  const pct = total ? Math.round((done / total) * 100) : 0;
                  return (
                    <div key={rm.id} className="rounded-lg border border-slate-200 p-4">
                      <h3 className="font-semibold text-slate-800">{rm.title}</h3>
                      {rm.description && <p className="mt-0.5 text-xs text-slate-500">{rm.description}</p>}
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-2 flex-1 rounded bg-slate-100">
                          <div className="h-2 rounded bg-brand" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-slate-600">{done}/{total}</span>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        {rm.tasks?.slice(0, 4).map((t) => (
                          <div key={t.id} className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-700">
                              {t.dependents?.length > 0 && (
                                <span title={`${t.dependents.length} task(s) wait on this one`}>🔗</span>
                              )}
                              <span className="truncate">{t.title}</span>
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                              <Countdown deadline={t.deadline} className="text-xs" />
                              <StatusBadge status={t.status} />
                            </div>
                          </div>
                        ))}
                        {total > 4 && (
                          <p className="pt-1 text-xs text-slate-400">+{total - 4} more tasks in this milestone</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 text-center">
        <Link to="/assign" className="btn-secondary">Assign open tasks →</Link>
      </div>
    </div>
  );
}

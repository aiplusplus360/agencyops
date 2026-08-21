import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, Spinner, fmtDateTime } from '../../components/ui';

export default function DigestHistory() {
  const [digests, setDigests] = useState(null);

  useEffect(() => {
    api.get('/digests').then(setDigests).catch(() => setDigests([]));
  }, []);

  if (!digests) return <Spinner />;

  return (
    <div>
      <PageHeader title="Digest History" subtitle="Daily and weekly operations reports delivered by email" />
      <div className="space-y-3">
        {digests.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">No digests generated yet. The cron delivers the daily digest at 08:00.</div>}
        {digests.map((d) => (
          <div key={d.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`badge ${d.period === 'DAILY' ? 'bg-brand-soft text-brand' : 'bg-emerald-soft text-emerald-700'}`}>{d.period}</span>
                <span className="text-sm font-medium text-slate-800">{d.payload?.date || d.payload?.weekStart}</span>
              </div>
              <span className="text-xs text-slate-400">{d.emailStatus} · {fmtDateTime(d.createdAt)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {d.period === 'DAILY' ? (
                <>
                  <DigestStat label="New assignments" value={d.payload?.newAssignments} />
                  <DigestStat label="Overdue" value={d.payload?.overdue} />
                  <DigestStat label="In evaluation" value={d.payload?.inEval} />
                  <DigestStat label="Revisions" value={d.payload?.revisions} />
                </>
              ) : (
                <>
                  <DigestStat label="Completed" value={d.payload?.completed} />
                  <DigestStat label="Avg quality" value={d.payload?.avgQuality} />
                  <DigestStat label="Active tasks" value={d.payload?.active} />
                  <DigestStat label="Revisions" value={d.payload?.revisions} />
                </>
              )}
            </div>
            {d.payload?.topPerformers?.length > 0 && (
              <div className="mt-3">
                <p className="label">Top performers</p>
                <div className="flex gap-2">
                  {d.payload.topPerformers.map((p) => (
                    <span key={p.name} className="rounded bg-emerald-soft px-2 py-1 text-xs font-medium text-emerald-700">
                      {p.name} · {p.avg}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DigestStat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value ?? '—'}</p>
    </div>
  );
}

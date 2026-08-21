import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, Spinner, ScoreBadge, fmtDateTime } from '../../components/ui';

export default function Utilization() {
  const [ranking, setRanking] = useState(null);
  const [estimation, setEstimation] = useState([]);
  const [forecast, setForecast] = useState([]);
  const [period, setPeriod] = useState('month');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [timeline, setTimeline] = useState(null);

  useEffect(() => {
    api.get(`/utilization/ranking?period=${period}`).then(setRanking).catch(() => setRanking(null));
    api.get('/utilization/estimation').then(setEstimation).catch(() => setEstimation([]));
    api.get('/leaderboard/forecast').then(setForecast).catch(() => setForecast([]));
  }, [period]);

  async function openTimeline(workerId, name) {
    setSelectedWorker({ id: workerId, name });
    const tl = await api.get(`/utilization/employee/${workerId}/timeline`).catch(() => []);
    setTimeline(tl);
  }

  if (!ranking) return <Spinner />;

  const maxScore = Math.max(...ranking.fullRanking.map((r) => r.score), 1);

  return (
    <div>
      <PageHeader
        title="Employee Intelligence & Utilization Logs"
        subtitle="Track every action, completion time, and confirm who is the most useful"
        actions={
          <select className="input !w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="quarter">This quarter</option>
          </select>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Full ranking */}
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Usefulness Ranking</h2>
          <div className="space-y-2">
            {ranking.fullRanking.map((r, i) => (
              <button key={r.workerId} onClick={() => openTimeline(r.workerId, r.name)} className="flex w-full items-center gap-3 rounded-lg border border-slate-100 px-4 py-2.5 text-left hover:border-brand">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i < Math.ceil(ranking.fullRanking.length / 3) ? 'bg-emerald-soft text-emerald-700' : i >= ranking.fullRanking.length - Math.ceil(ranking.fullRanking.length / 3) ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{r.name}</p>
                    <span className="text-sm font-bold text-slate-900">{r.score}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-slate-100">
                    <div className="h-1.5 rounded bg-brand" style={{ width: `${(r.score / maxScore) * 100}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{r.completed} completed · {r.onTimeRate}% on-time · avg {r.avgQuality ?? '—'}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {/* Estimation accuracy */}
          <div className="card p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Estimation Accuracy</h2>
            <div className="space-y-2">
              {estimation.map((e) => (
                <div key={e.workerId} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <span className="text-sm font-medium text-slate-700">{e.name}</span>
                  <div className="flex items-center gap-3">
                    {e.accuracy !== null && <ScoreBadge score={e.accuracy} />}
                    <span className="text-xs text-slate-400">{e.samples} samples</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Forecast */}
          <div className="card p-5">
            <h2 className="mb-3 font-semibold text-slate-900">7-Day Workload Forecast</h2>
            <div className="space-y-2">
              {forecast.map((f) => (
                <div key={f.workerId} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <span className="text-sm font-medium text-slate-700">Worker</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">{f.activeCount} active → <b className="text-slate-800">{f.projectedLoad} projected</b></span>
                    {f.overloadExpected
                      ? <span className="badge bg-rose-50 text-rose-600">overload risk</span>
                      : <span className="badge bg-emerald-soft text-emerald-700">healthy</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline modal */}
      {selectedWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setSelectedWorker(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">{selectedWorker.name} — action log</h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setSelectedWorker(null)}>✕</button>
            </div>
            <div className="px-6 py-5">
              {!timeline && <p className="text-sm text-slate-500">Loading…</p>}
              {timeline?.length === 0 && <p className="text-sm text-slate-500">No activity yet.</p>}
              <div className="space-y-3">
                {timeline?.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 border-l-2 border-slate-200 pl-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{a.type}</p>
                      {a.note && <p className="text-xs text-slate-500">{a.note}</p>}
                      {a.task?.title && <p className="text-xs text-slate-400">Task: {a.task.title}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{fmtDateTime(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

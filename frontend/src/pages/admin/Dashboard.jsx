import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { StatCard, PageHeader, StatusBadge, Countdown, Spinner, fmtDateTime } from '../../components/ui';
import { useSocket } from '../../context/SocketContext';

export default function AdminDashboard() {
  const [tasks, setTasks] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [evals, setEvals] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const { on } = useSocket();

  async function load() {
    Promise.all([
      api.get('/tasks').catch(() => []),
      api.get('/workers').catch(() => []),
      api.get('/evaluations').catch(() => []),
    ]).then(([t, w, e]) => { setTasks(t); setWorkers(w); setEvals(e); });
  }

  useEffect(() => { load(); }, []);
  // Live team alerts (escalations, idle tasks, overload forecasts, AI budget)
  useEffect(() => on('alert', (a) => setAlerts((prev) => [a, ...prev].slice(0, 12))), [on]);
  useEffect(() => on('team_update', () => load()), [on]);

  if (!tasks) return <Spinner />;

  const now = new Date();
  const overdue = tasks.filter((t) => t.status !== 'COMPLETED' && new Date(t.deadline) < now);
  const inProgress = tasks.filter((t) => t.status === 'WORKING_ON_IT' || t.status === 'SUBMITTED');
  const completed = tasks.filter((t) => t.status === 'COMPLETED');
  const pendingEval = evals.filter((e) => !e.overriddenAt && e.submission);
  const overloaded = workers.filter((w) => w.activeTasks >= w.effectiveCapacity);
  const teamCapacity = workers.reduce((s, w) => s + w.effectiveCapacity, 0);
  const totalWorkload = workers.reduce((s, w) => s + w.activeTasks, 0);

  return (
    <div>
      <PageHeader
        title="Command Dashboard"
        subtitle="Macro view of operations — scan the whole team in seconds"
        actions={<Link to="/tasks" className="btn-primary">Manage tasks</Link>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total workload" value={totalWorkload} sub={`of ${teamCapacity} capacity across ${workers.length} workers`} />
        <StatCard label="Overdue tasks" value={overdue.length} accent="text-rose-600" sub={overdue.length ? 'Requires immediate attention' : 'All clear'} />
        <StatCard label="In progress" value={inProgress.length} accent="text-brand" sub={`${completed.length} completed overall`} />
        <StatCard label="Overloaded workers" value={overloaded.length} accent={overloaded.length ? 'text-amber-600' : 'text-emerald'} sub="Bandwidth protection flags" />
      </div>

      {alerts.length > 0 && (
        <div className="card mb-6 border-amber-200 bg-amber-soft/40 p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Live Alerts</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
                <span className="text-slate-700">
                  <span className="font-semibold uppercase tracking-wide text-xs text-slate-400">{a.type}: </span>
                  {a.workerName ? `${a.workerName} — ` : ''}{a.title || `projected load ${a.projectedLoad} vs capacity ${a.capacity}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Critical path */}
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Overdue & Critical</h2>
          {overdue.length === 0 && <p className="text-sm text-slate-500">No overdue tasks.</p>}
          <div className="space-y-2">
            {overdue.slice(0, 8).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{t.title}</p>
                  <p className="text-xs text-slate-500">{t.assignments?.[0]?.worker?.user?.name || 'Unassigned'}</p>
                </div>
                <Countdown deadline={t.deadline} />
              </div>
            ))}
          </div>

          <h2 className="mb-3 mt-6 font-semibold text-slate-900">Under Evaluation</h2>
          {pendingEval.length === 0 && <p className="text-sm text-slate-500">No submissions pending evaluation.</p>}
          <div className="space-y-2">
            {pendingEval.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">{e.submission?.task?.title}</p>
                  <p className="text-xs text-slate-500">by {e.submission?.worker?.user?.name} · attempt {e.submission?.attemptNo}</p>
                </div>
                <Link to="/evaluations" className="text-xs font-medium text-brand hover:underline">Review →</Link>
              </div>
            ))}
          </div>
        </div>

        {/* Team snapshot */}
        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Team Snapshot</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="table-h">Worker</th>
                  <th className="table-h">Load</th>
                  <th className="table-h">Capacity</th>
                  <th className="table-h">Availability</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.id} className="border-b border-slate-100">
                    <td className="table-c">
                      <p className="font-medium text-slate-800">{w.name}</p>
                      <p className="text-xs text-slate-400">{w.seniorityTier}</p>
                    </td>
                    <td className="table-c">
                      <span className={`font-semibold ${w.activeTasks >= w.effectiveCapacity ? 'text-amber-600' : 'text-slate-800'}`}>{w.activeTasks}</span>
                      <div className="mt-1 h-1.5 w-20 rounded bg-slate-100">
                        <div className="h-1.5 rounded bg-brand" style={{ width: `${Math.min(100, (w.activeTasks / w.effectiveCapacity) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="table-c">{w.effectiveCapacity}</td>
                    <td className="table-c"><StatusBadge status={w.availability} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mb-3 mt-6 font-semibold text-slate-900">Latest Tasks</h2>
          <div className="space-y-2">
            {[...tasks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">{t.title}</p>
                  <p className="text-xs text-slate-400">{t.assignments?.[0]?.worker?.user?.name || 'Unassigned'}</p>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

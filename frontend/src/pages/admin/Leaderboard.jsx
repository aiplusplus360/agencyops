import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, Spinner, ScoreBadge } from '../../components/ui';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function Leaderboard() {
  const [rows, setRows] = useState(null);
  const [trends, setTrends] = useState([]);
  const [range, setRange] = useState('30d');
  const [workerId, setWorkerId] = useState('');

  useEffect(() => {
    api.get(`/leaderboard?range=${range}`).then(setRows).catch(() => setRows([]));
  }, [range]);

  useEffect(() => {
    const params = new URLSearchParams({ days: '30' });
    if (workerId) params.set('workerId', workerId);
    api.get(`/leaderboard/trends?${params}`).then(setTrends).catch(() => setTrends([]));
  }, [workerId]);

  if (!rows) return <Spinner />;

  const maxComposite = Math.max(...rows.map((r) => r.composite), 1);

  return (
    <div>
      <PageHeader
        title="Operational Performance Leaderboard"
        subtitle="Team rankings by AI quality scores, speed, and workload"
        actions={
          <select className="input !w-auto" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-900">Rankings</h2>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.workerId} className="flex items-center gap-4 rounded-lg border border-slate-100 px-4 py-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? 'bg-amber text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-800">{r.name}</p>
                    <span className="font-bold text-slate-900">{r.composite}</span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-slate-100">
                    <div className="h-2 rounded bg-brand" style={{ width: `${(r.composite / maxComposite) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {r.completed} done · {r.onTimeRate}% on time · avg {r.avgSpeedHours ? `${r.avgSpeedHours}h` : '—'} · load {r.activeWorkload}/{r.effectiveCapacity}
                  </p>
                </div>
                <ScoreBadge score={r.avgQuality} />
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Quality Trend</h2>
          <div className="mb-4">
            <label className="label">Worker</label>
            <select className="input" value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">All workers</option>
              {rows.map((r) => <option key={r.workerId} value={r.workerId}>{r.name}</option>)}
            </select>
          </div>
          {trends.length === 0 && <p className="text-sm text-slate-500">No evaluations in this window.</p>}
          {trends.length > 0 && (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v) => [`${v}/100`, 'Avg quality']}
                  />
                  <Line type="monotone" dataKey="avgQuality" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

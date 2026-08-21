import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { Spinner, ScoreBadge, StatusBadge, fmtDateTime, Ring, MetricCard, HeroBanner } from '../../components/ui';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';

export default function MyPerformance() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!user?.workerId) return;
    api.get(`/workers/${user.workerId}/performance`).then(setData).catch(() => setData(null));
  }, [user]);

  const trend = useMemo(() => {
    if (!data?.timeline) return [];
    return data.timeline
      .filter((t) => t.score !== null && t.score !== undefined)
      .slice()
      .reverse()
      .map((t, i) => ({ idx: i + 1, score: Math.round(t.score), title: t.title }));
  }, [data]);

  if (!data) return <Spinner />;

  const qualityColor = data.avgQuality >= 80 ? 'text-emerald' : data.avgQuality >= 60 ? 'text-amber' : 'text-rose-500';

  return (
    <div>
      <HeroBanner
        eyebrow="Personal dashboard"
        title="My Performance"
        subtitle="Your quality scores, speed, and full task history."
        tone="emerald"
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard icon="✅" label="Completed" value={data.completed} sub="Tasks finished" tone="emerald" />
        <MetricCard icon="📊" label="Avg quality" value={data.avgQuality ? `${Math.round(data.avgQuality)}/100` : '—'} sub="Average score" tone="brand" />
        <MetricCard icon="⏱️" label="On-time rate" value={`${data.onTimeRate}%`} sub="Deadlines met" tone={data.onTimeRate >= 80 ? 'emerald' : data.onTimeRate >= 60 ? 'amber' : 'rose'} />
        <MetricCard icon="🎯" label="Estimation accuracy" value={data.estimationAccuracy !== null ? `${data.estimationAccuracy}%` : '—'} sub="Effort prediction" tone="amber" />
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-3">
        {/* Quality ring */}
        <div className="card flex flex-col items-center justify-center p-5">
          <h2 className="mb-3 self-start font-semibold text-slate-900">Quality score</h2>
          <Ring value={data.avgQuality} size={120} stroke={10} label={data.avgQuality ? `${Math.round(data.avgQuality)}` : '—'} sub="of 100" className={qualityColor} />
          <p className="mt-3 text-center text-sm text-slate-500">
            {data.avgQuality >= 80 ? 'Excellent — keep it up!' : data.avgQuality >= 60 ? 'Solid work — a bit more polish will go far.' : 'Room to grow — review the feedback on your submissions.'}
          </p>
        </div>

        {/* Trend chart */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold text-slate-900">Quality trend</h2>
          {trend.length < 2 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <span className="text-3xl">📈</span>
              <p className="mt-2 text-sm text-slate-500">Complete a couple of graded tasks to see your trend.</p>
            </div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="idx" tick={{ fontSize: 10, fill: '#64748b' }} label={{ value: 'Task #', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v) => [`${v}/100`, 'Score']}
                    labelFormatter={(l) => `Task #${l}`}
                  />
                  <ReferenceLine y={80} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <h2 className="border-b border-slate-100 px-5 py-4 font-semibold text-slate-900">Task history</h2>
        {data.timeline?.length === 0 && <p className="p-6 text-sm text-slate-500">No tasks yet.</p>}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60">
                <th className="table-h">Task</th>
                <th className="table-h">Status</th>
                <th className="table-h">Score</th>
                <th className="table-h">Started</th>
                <th className="table-h">Confirmed</th>
                <th className="table-h">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {data.timeline?.map((t) => (
                <tr key={t.taskId} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-blue-50/40">
                  <td className="table-c max-w-xs">
                    <p className="truncate font-medium text-slate-800">{t.title}</p>
                  </td>
                  <td className="table-c"><StatusBadge status={t.status} /></td>
                  <td className="table-c">
                    {t.score !== null && t.score !== undefined ? <ScoreBadge score={t.score} /> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="table-c text-slate-500">{fmtDateTime(t.startedAt)}</td>
                  <td className="table-c text-slate-500">{fmtDateTime(t.confirmedAt)}</td>
                  <td className="table-c text-slate-500">{fmtDateTime(t.deadline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

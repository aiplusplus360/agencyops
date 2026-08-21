import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, Spinner, fmtDateTime } from '../../components/ui';

export default function AICostMonitor() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    api.get(`/usage?days=${days}`).then(setData).catch(() => setData(null));
  }, [days]);

  if (!data) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="AI Cost & Usage Monitor"
        subtitle="DeepSeek token spend across every AI engine subsystem"
        actions={
          <select className="input !w-auto" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="label">Estimated spend</p>
          <p className="text-3xl font-bold text-slate-900">${data.totalCost.toFixed(4)}</p>
        </div>
        <div className="card p-5">
          <p className="label">API calls</p>
          <p className="text-3xl font-bold text-slate-900">{data.totalCalls}</p>
        </div>
        <div className="card p-5">
          <p className="label">Tokens</p>
          <p className="text-3xl font-bold text-slate-900">{(data.totalTokens / 1000).toFixed(1)}k</p>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold text-slate-900">By engine</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="table-h">Engine</th>
                <th className="table-h">Calls</th>
                <th className="table-h">Tokens</th>
                <th className="table-h">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {data.byEngine.map((e) => (
                <tr key={e.engine} className="border-b border-slate-100">
                  <td className="table-c font-medium">{e.engine}</td>
                  <td className="table-c">{e.calls}</td>
                  <td className="table-c">{(e.tokens / 1000).toFixed(1)}k</td>
                  <td className="table-c font-semibold">${e.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-6 p-5">
        <h2 className="mb-3 font-semibold text-slate-900">Recent calls</h2>
        <div className="space-y-1.5">
          {data.recent.slice(0, 20).map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <span className="font-medium text-slate-700">{l.engine}</span>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>in {l.tokensIn} · out {l.tokensOut}</span>
                <span className="font-semibold text-slate-700">${l.estCostUsd.toFixed(6)}</span>
                <span>{fmtDateTime(l.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

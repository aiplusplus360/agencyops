import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, Spinner, Badge, fmtDateTime } from '../../components/ui';

const typeColor = {
  ASSIGNMENT: 'bg-brand-soft text-brand',
  EVALUATION: 'bg-emerald-soft text-emerald-700',
  AUTO_GENERATE: 'bg-amber-soft text-amber-700',
  REVISION: 'bg-amber-soft text-amber-700',
  REASSIGN: 'bg-rose-50 text-rose-600',
  FORECAST: 'bg-slate-100 text-slate-600',
  CAPACITY_SCALING: 'bg-brand-soft text-brand',
  LEARNING_ADJUSTMENT: 'bg-emerald-soft text-emerald-700',
};

export default function AIDecisionAudit() {
  const [decisions, setDecisions] = useState(null);
  const [type, setType] = useState('');

  useEffect(() => {
    const q = type ? `?type=${type}` : '';
    api.get(`/ai-decisions${q}`).then(setDecisions).catch(() => setDecisions([]));
  }, [type]);

  if (!decisions) return <Spinner />;

  return (
    <div>
      <PageHeader title="AI Decision Audit Trail" subtitle="Every autonomous decision the AI-COO makes — fully transparent" />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {['', 'ASSIGNMENT', 'EVALUATION', 'AUTO_GENERATE', 'REVISION', 'REASSIGN', 'FORECAST', 'CAPACITY_SCALING', 'LEARNING_ADJUSTMENT'].map((t) => (
          <button key={t} onClick={() => setType(t)} className={`rounded-full px-3 py-1 text-xs font-medium ${type === t ? 'bg-brand text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            {t || 'All'}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {decisions.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">No AI decisions recorded yet.</div>}
        {decisions.map((d) => (
          <div key={d.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className={typeColor[d.type] || ''}>{d.type}</Badge>
                {d.entityId && <span className="font-mono text-xs text-slate-400">{d.entityId}</span>}
              </div>
              <span className="text-xs text-slate-400">{fmtDateTime(d.createdAt)}</span>
            </div>
            {d.rationale && <p className="mt-2 text-sm text-slate-600">{d.rationale}</p>}
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              {JSON.stringify(d.decision, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, Spinner, Badge, StatusBadge, Modal } from '../../components/ui';

export default function Evaluations() {
  const [evals, setEvals] = useState(null);
  const [appeals, setAppeals] = useState([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [override, setOverride] = useState({ qualityScore: 0, verdict: 'PASS', note: '' });
  const [tab, setTab] = useState('evaluations');

  useEffect(() => { load(); }, [filter, tab]);

  async function load() {
    if (tab === 'appeals') {
      const a = await api.get('/appeals').catch(() => []);
      setAppeals(a);
      return;
    }
    const q = filter ? `?verdict=${filter}` : '';
    const e = await api.get(`/evaluations${q}`).catch(() => []);
    setEvals(e);
  }

  async function submitOverride() {
    await api.patch(`/evaluations/${selected.id}`, override);
    setSelected(null);
    load();
  }

  async function reviewAppeal(id, status) {
    await api.patch(`/appeals/${id}`, { status, reviewNote: status === 'UPHELD' ? 'Reviewed and upheld by admin.' : 'Reviewed and rejected by admin.' });
    load();
  }

  const pendingEvals = (evals || []).filter((e) => !e.overriddenAt && e.submission);

  return (
    <div>
      <PageHeader title="Evaluation Oversight" subtitle="Review AI grades, approve submissions, handle worker appeals" />

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        <button onClick={() => setTab('evaluations')} className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === 'evaluations' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>Evaluations</button>
        <button onClick={() => setTab('appeals')} className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === 'appeals' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
          Appeals {appeals.filter((a) => a.status === 'PENDING').length > 0 && `(${appeals.filter((a) => a.status === 'PENDING').length})`}
        </button>
      </div>

      {tab === 'evaluations' && (
        <>
          <div className="mb-4 flex gap-2">
            {['', 'PASS', 'REVISE'].map((v) => (
              <button key={v} onClick={() => setFilter(v)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === v ? 'bg-brand text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                {v || 'All'}
              </button>
            ))}
          </div>
          {!evals && <Spinner />}
          <div className="space-y-3">
            {pendingEvals.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-soft p-3 text-sm text-amber-700">
                {pendingEvals.length} evaluation(s) awaiting review.
              </div>
            )}
            {evals?.map((e) => (
              <div key={e.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{e.submission?.task?.title}</p>
                    <p className="text-xs text-slate-500">
                      by {e.submission?.worker?.user?.name} · attempt {e.submission?.attemptNo} · {e.submission ? new Date(e.submission.submittedAt).toLocaleString() : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {e.overriddenBy && <Badge className="bg-amber-soft text-amber-700">overridden</Badge>}
                    <Badge className={e.verdict === 'PASS' ? 'bg-emerald-soft text-emerald-700' : 'bg-amber-soft text-amber-700'}>{e.verdict}</Badge>
                    <span className="text-lg font-bold text-slate-900">{Math.round(e.qualityScore)}</span>
                  </div>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-slate-500">
                  <span>Intent <b className="text-slate-700">{Math.round(e.intentScore)}</b></span>
                  <span>Completeness <b className="text-slate-700">{Math.round(e.completenessScore)}</b></span>
                  <span>Deadline <b className="text-slate-700">{Math.round(e.deadlineScore)}</b></span>
                </div>
                {e.critique && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{e.critique}</p>}
                <div className="mt-3 flex gap-2">
                  <button className="btn-secondary" onClick={() => { setSelected(e); setOverride({ qualityScore: Math.round(e.qualityScore), verdict: e.verdict, note: '' }); }}>
                    Override score
                  </button>
                  <button className="btn-emerald" onClick={async () => {
                    await api.patch(`/evaluations/${e.id}`, { qualityScore: Math.max(e.qualityScore, 90), verdict: 'PASS', note: 'Admin approved' });
                    load();
                  }}>
                    Approve (pass)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'appeals' && (
        <div className="space-y-3">
          {appeals.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">No appeals.</div>}
          {appeals.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{a.task?.title}</p>
                  <p className="text-xs text-slate-500">Appealed by {a.worker?.user?.name}</p>
                </div>
                <Badge className={a.status === 'PENDING' ? 'bg-amber-soft text-amber-700' : a.status === 'UPHELD' ? 'bg-emerald-soft text-emerald-700' : 'bg-slate-100 text-slate-600'}>
                  {a.status}
                </Badge>
              </div>
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{a.reason}</p>
              {a.status === 'PENDING' && (
                <div className="mt-3 flex gap-2">
                  <button className="btn-emerald" onClick={() => reviewAppeal(a.id, 'UPHELD')}>Uphold</button>
                  <button className="btn-secondary" onClick={() => reviewAppeal(a.id, 'REJECTED')}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Override evaluation">
        <div className="space-y-4">
          <div>
            <label className="label">Quality score (0-100)</label>
            <input type="number" min="0" max="100" className="input" value={override.qualityScore} onChange={(e) => setOverride({ ...override, qualityScore: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Verdict</label>
            <select className="input" value={override.verdict} onChange={(e) => setOverride({ ...override, verdict: e.target.value })}>
              <option value="PASS">PASS</option>
              <option value="REVISE">REVISE</option>
            </select>
          </div>
          <div>
            <label className="label">Note</label>
            <textarea className="input" rows="2" value={override.note} onChange={(e) => setOverride({ ...override, note: e.target.value })} />
          </div>
          <p className="text-xs text-slate-400">The AI learns from this override — repeated patterns will tune the grading rubric.</p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setSelected(null)}>Cancel</button>
            <button className="btn-primary" onClick={submitOverride}>Save override</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Spinner, StatusBadge, Countdown, Badge, Ring, fmtDateTime, HeroBanner } from '../../components/ui';

const STEPS = [
  { key: 'PENDING', label: 'Assigned', icon: '📥' },
  { key: 'WORKING_ON_IT', label: 'Working', icon: '🛠️' },
  { key: 'SUBMITTED', label: 'Submitted', icon: '📤' },
  { key: 'COMPLETED', label: 'Completed', icon: '✅' },
];

function stepIndex(status) {
  if (status === 'COMPLETED') return 3;
  if (status === 'SUBMITTED' || status === 'IN_REVISION') return 2;
  if (status === 'WORKING_ON_IT') return 1;
  return 0;
}

const TIMELINE_COLORS = {
  created: 'bg-brand',
  started: 'bg-emerald',
  submitted: 'bg-amber',
  evaluated: 'bg-indigo-500',
  rescheduled: 'bg-rose-500',
  reassigned: 'bg-violet-500',
  completed: 'bg-emerald',
  revised: 'bg-orange-500',
  appealed: 'bg-pink-500',
};

function TimelineIcon(type) {
  const icons = {
    created: '✦',
    started: '▶',
    submitted: '▲',
    evaluated: '★',
    rescheduled: '↻',
    reassigned: '⇄',
    completed: '✓',
    revised: '↺',
    appealed: '⚠',
  };
  return icons[type] || '•';
}

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [submission, setSubmission] = useState({ text: '' });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [appeal, setAppeal] = useState('');
  const [flash, setFlash] = useState(null);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const t = await api.get(`/tasks/${id}`).catch(() => null);
    if (!t) return navigate('/worker');
    setTask(t);
  }

  async function setStatus(status) {
    setBusy(true);
    try {
      await api.patch(`/tasks/${id}/status`, { status });
      await load();
    } catch (e) {
      setFlash({ type: 'error', msg: e.message });
    }
    setBusy(false);
  }

  async function submitWork() {
    if (!submission.text.trim()) {
      setFlash({ type: 'error', msg: 'Tell us what you did before submitting.' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/submissions', { taskId: id, text: submission.text });
      setFlash({ type: 'ok', msg: 'Submitted! Your work has been sent for review.' });
      setSubmission({ text: '' });
      await load();
    } catch (e) {
      setFlash({ type: 'error', msg: e.message });
    }
    setBusy(false);
  }

  async function flagBrief() {
    if (!feedback.trim()) return;
    await api.post('/brief-feedback', { taskId: id, note: feedback });
    setFeedback('');
    setFlash({ type: 'ok', msg: 'Brief flagged — the admin has been notified.' });
  }

  async function submitAppeal() {
    if (!appeal.trim()) return;
    const lastEval = task?.submissions?.[0]?.evaluations?.[0];
    if (!lastEval) return;
    await api.post(`/evaluations/appeal/${lastEval.id}`, { reason: appeal });
    setAppeal('');
    setFlash({ type: 'ok', msg: 'Appeal submitted.' });
  }

  if (!task) return <Spinner />;

  const lastSubmission = task.submissions?.[0];
  const lastEval = lastSubmission?.evaluations?.[0];
  const canSubmit = ['WORKING_ON_IT', 'IN_REVISION', 'PENDING'].includes(task.status);
  const idx = stepIndex(task.status);
  const heroTone = task.status === 'COMPLETED' ? 'emerald' : task.status === 'BLOCKED' ? 'amber' : 'brand';

  return (
    <div>
      <button
        onClick={() => navigate('/worker')}
        className="group mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">←</span>
        Back to queue
      </button>

      <HeroBanner
        eyebrow={task.product?.name || 'Task'}
        title={task.title}
        subtitle={task.description || 'No description provided'}
        tone={heroTone}
        actions={
          <>
            {task.priority === 1 && <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">High priority</span>}
            <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white">{task.effortHours}h effort</span>
          </>
        }
      />

      {flash && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${flash.type === 'ok' ? 'bg-emerald-soft text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
          {flash.msg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Status stepper */}
          <div className="card p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-900">Task progress</h2>
              <div className="flex items-center gap-3">
                <StatusBadge status={task.status} />
                {task.deadline && <Countdown deadline={task.deadline} className="text-sm font-bold" />}
              </div>
            </div>

            <div className="relative flex items-start justify-between">
              <div className="absolute left-0 right-0 top-4 mx-2 h-0.5 bg-slate-100">
                <div className="h-0.5 bg-brand transition-all duration-500" style={{ width: `${(idx / (STEPS.length - 1)) * 100}%` }} />
              </div>
              {STEPS.map((s, i) => {
                const done = i <= idx;
                const active = i === idx;
                return (
                <div key={s.key} className="relative z-10 flex w-14 flex-col items-center gap-1 text-center">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition-all duration-300 ${
                    done ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'bg-slate-100 text-slate-400'
                  } ${active ? 'ring-4 ring-brand/15' : ''}`}>
                    {done ? '✓' : s.icon}
                  </span>
                  <span className={`text-[9px] font-semibold uppercase tracking-wide ${done ? 'text-brand' : 'text-slate-400'}`}>{s.label}</span>
                </div>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Meta label="Priority" value={task.priority === 1 ? 'High' : task.priority === 2 ? 'Normal' : 'Low'} tone={task.priority === 1 ? 'rose' : ''} />
              <Meta label="Effort" value={`${task.effortHours}h`} />
              <Meta label="Deadline" value={fmtDateTime(task.deadline)} />
              <Meta label="Skills" value={task.skillTags?.join(', ') || '—'} />
            </div>

            {task.acceptanceCriteria?.length > 0 && (
              <div className="mt-4">
                <p className="label">Acceptance criteria</p>
                <ul className="space-y-1.5">
                  {task.acceptanceCriteria.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-soft text-[10px] font-bold text-emerald-700">✓</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Status alerts */}
          {task.status === 'SUBMITTED' && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-soft/50 p-4">
              <span className="text-lg">⏳</span>
              <div>
                <p className="font-semibold text-amber-800">Under review</p>
                <p className="mt-0.5 text-sm text-amber-700">Your submission (attempt {lastSubmission?.attemptNo}) is being reviewed. You'll be notified when it's done.</p>
              </div>
            </div>
          )}
          {task.status === 'COMPLETED' && lastEval && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-soft/60 p-4">
              <span className="text-lg">🎉</span>
              <div>
                <p className="font-semibold text-emerald-700">Completed — scored {Math.round(lastEval.qualityScore)}/100</p>
                {lastEval.critique && <p className="mt-0.5 text-sm text-emerald-800">{lastEval.critique}</p>}
              </div>
            </div>
          )}

          {/* Work verification */}
          <div className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">📝 Work verification</h2>
            {canSubmit && (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="label">What did you do?</label>
                    <textarea
                      className="input"
                      rows={4}
                      placeholder="Summarize the work you did and how it meets the acceptance criteria."
                      value={submission.text}
                      onChange={(e) => setSubmission({ text: e.target.value })}
                    />
                  </div>
                  <button className="btn-emerald" disabled={busy} onClick={submitWork}>Submit for evaluation</button>
                </div>
                {['PENDING', 'WORKING_ON_IT', 'IN_REVISION'].includes(task.status) && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    {task.status !== 'WORKING_ON_IT' && (
                      <button className="btn-primary" disabled={busy} onClick={() => setStatus('WORKING_ON_IT')}>
                        Start working on it
                      </button>
                    )}
                    <button className="btn-danger" disabled={busy} onClick={() => setStatus('BLOCKED')}>
                      Can't do it
                    </button>
                  </div>
                )}
              </>
            )}
            {task.status === 'SUBMITTED' && (
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="label">Your latest submission</p>
                <div className="mt-1 rounded-lg bg-white p-3 text-sm text-slate-700">{lastSubmission?.text}</div>
              </div>
            )}
            {task.status === 'COMPLETED' && lastSubmission && (
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="label">Last submission</p>
                <p className="mt-1 text-sm text-slate-600">{lastSubmission.text}</p>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-900">Timeline</h2>
            {task.activities?.length === 0 && <p className="text-sm text-slate-500">No activity yet.</p>}
            <div className="relative space-y-4 pl-2">
              {task.activities?.map((a, i) => (
                <div key={a.id} className="relative flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] text-white ${TIMELINE_COLORS[a.type] || 'bg-slate-400'}`}>
                      {TimelineIcon(a.type)}
                    </span>
                    {i < task.activities.length - 1 && <span className="my-0.5 w-0.5 flex-1 bg-slate-200" />}
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-medium capitalize text-slate-700">{a.type.replace(/_/g, ' ')}</p>
                    {a.note && <p className="text-xs text-slate-500">{a.note}</p>}
                    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">{fmtDateTime(a.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-900">Latest evaluation</h2>
            {!lastEval && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <span className="text-3xl">📋</span>
                <p className="mt-2 text-sm text-slate-500">No evaluation yet.</p>
                <p className="text-xs text-slate-400">Submit your work and it will be reviewed here.</p>
              </div>
            )}
            {lastEval && (
              <div className="flex flex-col items-center">
                <Ring
                  value={lastEval.qualityScore}
                  size={120}
                  stroke={10}
                  label={`${Math.round(lastEval.qualityScore)}/100`}
                  sub="Quality"
                  className={lastEval.qualityScore >= 80 ? 'text-emerald' : lastEval.qualityScore >= 60 ? 'text-amber' : 'text-rose-500'}
                />
                <Badge className={`mt-3 ${lastEval.verdict === 'PASS' ? 'bg-emerald-soft text-emerald-700' : 'bg-amber-soft text-amber-700'}`}>
                  {lastEval.verdict === 'PASS' ? 'Passed ✓' : 'Revise needed'}
                </Badge>
                <div className="mt-4 w-full space-y-1.5">
                  <ScoreRow label="Intent" value={lastEval.intentScore} color={lastEval.intentScore >= 60 ? 'bg-emerald' : 'bg-rose-500'} />
                  <ScoreRow label="Completeness" value={lastEval.completenessScore} color={lastEval.completenessScore >= 60 ? 'bg-emerald' : 'bg-rose-500'} />
                  <ScoreRow label="Deadline" value={lastEval.deadlineScore} color={lastEval.deadlineScore >= 60 ? 'bg-emerald' : 'bg-rose-500'} />
                </div>
                {lastEval.critique && (
                  <div className="mt-4 w-full rounded-xl border border-amber-200 bg-amber-soft/40 p-3 text-sm text-slate-700">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Reviewer notes</p>
                    {lastEval.critique}
                  </div>
                )}
                {lastEval.verdict === 'REVISE' && (
                  <div className="mt-4 w-full">
                    <button className="btn-secondary w-full" onClick={() => setStatus('WORKING_ON_IT')}>Work on revision</button>
                    <div className="mt-3">
                      <label className="label">Appeal this grade</label>
                      <textarea className="input" rows="2" placeholder="Why do you believe the grade is wrong?" value={appeal} onChange={(e) => setAppeal(e.target.value)} />
                      <button className="btn-secondary mt-2 w-full" onClick={submitAppeal} disabled={!appeal.trim()}>Submit appeal</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-2 font-semibold text-slate-900">Admin notes</h2>
            {task.notes?.length === 0 && <p className="text-sm text-slate-500">No notes from admin.</p>}
            <div className="space-y-2">
              {task.notes?.map((n) => (
                <div key={n.id} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-sm text-slate-700">{n.body}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{n.author?.name} · {fmtDateTime(n.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-2 font-semibold text-slate-900">Unclear brief?</h2>
            <textarea className="input" rows="2" placeholder="Tell the admin what's confusing…" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <button className="btn-secondary mt-2 w-full" onClick={flagBrief} disabled={!feedback.trim()}>Flag to admin</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value, tone }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${tone === 'rose' ? 'bg-rose-50' : 'bg-slate-50'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`truncate text-sm font-medium ${tone === 'rose' ? 'text-rose-600' : 'text-slate-700'}`}>{value}</p>
    </div>
  );
}

function ScoreRow({ label, value, color }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="flex flex-1 items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-slate-100">
          <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="w-7 text-right text-sm font-semibold text-slate-700">{Math.round(value)}</span>
      </div>
    </div>
  );
}

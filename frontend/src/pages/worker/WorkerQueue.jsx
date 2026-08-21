import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { Spinner, StatusBadge, Countdown, EmptyState, MetricCard, HeroBanner } from '../../components/ui';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';

const STATUS_ACCENT = {
  WORKING_ON_IT: 'bg-gradient-to-b from-blue-600 to-indigo-600',
  IN_REVISION: 'bg-gradient-to-b from-amber-500 to-orange-500',
  SUBMITTED: 'bg-gradient-to-b from-amber-400 to-orange-400',
  PENDING: 'bg-gradient-to-b from-slate-400 to-slate-500',
  COMPLETED: 'bg-gradient-to-b from-emerald-500 to-teal-500',
  BLOCKED: 'bg-gradient-to-b from-rose-500 to-red-600',
};

// Soft color-wash backgrounds so each task card carries its own hue.
const CARD_TINT = {
  WORKING_ON_IT: 'from-blue-50/80 via-white to-indigo-50/60',
  IN_REVISION: 'from-amber-50/80 via-white to-orange-50/50',
  SUBMITTED: 'from-orange-50/70 via-white to-amber-50/40',
  PENDING: 'from-slate-50 via-white to-slate-100/60',
  COMPLETED: 'from-emerald-50/80 via-white to-teal-50/50',
  BLOCKED: 'from-rose-50/80 via-white to-red-50/40',
};

const NUM_BUBBLE = {
  WORKING_ON_IT: 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-blue-500/30',
  IN_REVISION: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-amber-500/30',
  SUBMITTED: 'bg-gradient-to-br from-amber-400 to-orange-400 text-white shadow-amber-500/30',
  PENDING: 'bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-slate-400/30',
  COMPLETED: 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-emerald-500/30',
  BLOCKED: 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-rose-500/30',
};

const PROGRESS_BAR = {
  WORKING_ON_IT: 'from-blue-500 to-indigo-500',
  IN_REVISION: 'from-amber-500 to-orange-500',
  PENDING: 'from-slate-300 to-slate-400',
  COMPLETED: 'from-emerald-500 to-teal-500',
  SUBMITTED: 'from-amber-400 to-orange-400',
  BLOCKED: 'from-rose-500 to-red-500',
};

const TASK_ICON = { WORKING_ON_IT: '⚡', IN_REVISION: '🔁', SUBMITTED: '📤', PENDING: '📋', COMPLETED: '✅', BLOCKED: '⛔' };

// Section header title colors and matching count chips.
const SECTION_STYLE = {
  focus: { color: 'text-blue-700', chip: 'bg-blue-100 text-blue-700' },
  next: { color: 'text-amber-700', chip: 'bg-amber-100 text-amber-700' },
  done: { color: 'text-emerald-700', chip: 'bg-emerald-100 text-emerald-700' },
};

export default function WorkerQueue() {
  const [tasks, setTasks] = useState(null);
  const { on } = useSocket();
  const { user } = useAuth();

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  // Live reload whenever the queue is assigned/updated externally
  useEffect(() => on('queue_update', () => load()), [on]);

  async function load() {
    const t = await api.get('/tasks').catch(() => []);
    setTasks(t);
  }

  if (!tasks) return <Spinner />;

  const order = { WORKING_ON_IT: 0, IN_REVISION: 1, PENDING: 2, SUBMITTED: 3, COMPLETED: 4, BLOCKED: 5 };
  const sorted = [...tasks].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  const now = Date.now();
  const focusNow = sorted.filter((t) => ['WORKING_ON_IT', 'IN_REVISION'].includes(t.status));
  const upNext = sorted.filter((t) => ['PENDING', 'SUBMITTED', 'BLOCKED'].includes(t.status));
  const done = sorted.filter((t) => t.status === 'COMPLETED');
  const active = sorted.filter((t) => ['PENDING', 'WORKING_ON_IT', 'IN_REVISION'].includes(t.status));
  const dueSoon = sorted.filter(
    (t) => !['COMPLETED'].includes(t.status) && t.deadline && new Date(t.deadline).getTime() - now > 0 && new Date(t.deadline).getTime() - now < 24 * 3600000
  );
  const overdue = sorted.filter((t) => !['COMPLETED'].includes(t.status) && t.deadline && new Date(t.deadline).getTime() < now);

  const firstName = (user?.name || 'there').split(' ')[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  function TaskCard({ t, i }) {
    const elapsed = t.deadline ? Math.min(100, Math.max(0, ((now - new Date(t.createdAt).getTime()) / (new Date(t.deadline).getTime() - new Date(t.createdAt).getTime() || 1)) * 100)) : 0;
    const barColor = elapsed > 90 ? 'from-rose-500 to-red-600' : PROGRESS_BAR[t.status] || 'from-slate-300 to-slate-400';
    return (
      <Link
        to={`/worker/tasks/${t.id}`}
        className={`group relative block overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-cardHover ${CARD_TINT[t.status] || 'from-white to-slate-50'}`}
      >
        <span className={`absolute inset-y-0 left-0 w-1.5 ${STATUS_ACCENT[t.status] || 'bg-slate-300'}`} />
        <div className="flex items-center justify-between gap-4 py-3.5 pl-6 pr-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base shadow-lg transition-transform group-hover:scale-105 ${NUM_BUBBLE[t.status] || 'bg-slate-100 text-slate-500'}`}>
              {TASK_ICON[t.status] || i + 1}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold text-slate-900 transition-colors group-hover:text-brand">{t.title}</h3>
                {t.priority === 1 && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600 ring-1 ring-rose-100">High</span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {t.product?.name ? <span className="text-slate-600">{t.product.name}</span> : null}
                {t.product?.name ? ' · ' : ''}
                {t.skillTags?.slice(0, 3).join(', ') || 'No skills tagged'} · {t.effortHours}h
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <StatusBadge status={t.status} />
            {t.deadline && <Countdown deadline={t.deadline} className="text-sm font-semibold" />}
          </div>
        </div>
        {!['COMPLETED'].includes(t.status) && t.deadline && (
          <div className="h-1 w-full bg-slate-100">
            <div
              className={`h-full bg-gradient-to-r transition-all duration-500 ${barColor}`}
              style={{ width: `${Math.max(4, Math.min(100, elapsed))}%` }}
            />
          </div>
        )}
        {t.status === 'COMPLETED' && <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: '100%' }} />}
      </Link>
    );
  }

  function Section({ dot, tone, title, count, children }) {
    if (!children || (Array.isArray(children) && children.length === 0)) return null;
    const s = SECTION_STYLE[tone] || { color: 'text-slate-500', chip: 'bg-slate-200/70 text-slate-600' };
    return (
      <section className="mb-6">
        <div className="mb-2.5 flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full shadow-sm ${dot}`} />
          <h2 className={`text-xs font-bold uppercase tracking-wider ${s.color}`}>{title}</h2>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.chip}`}>{count}</span>
        </div>
        <div className="space-y-2.5">{children}</div>
      </section>
    );
  }

  return (
    <div className="relative">
      {/* soft decorative backdrop with multi-hue blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-20 -top-24 h-80 w-80 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-cyan-100/60 blur-3xl" />
        <div className="absolute -bottom-24 right-1/4 h-72 w-72 rounded-full bg-fuchsia-100/50 blur-3xl" />
        <div className="absolute left-1/3 top-2/3 h-64 w-64 rounded-full bg-amber-100/40 blur-3xl" />
      </div>

      <HeroBanner
        eyebrow="Delivery Terminal"
        title={`Hey ${firstName}, here's your queue`}
        subtitle={`${today} · A strict, clean, linear queue of your assignments, kept balanced automatically.`}
        tone="sunset"
        actions={
          <div className="flex items-center gap-3 rounded-xl bg-white/15 px-3.5 py-2 backdrop-blur">
            <span className="text-lg">🎯</span>
            <div className="leading-tight">
              <p className="text-lg font-bold leading-none">{active.length}</p>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-white/70">Active</p>
            </div>
            <span className="h-6 w-px bg-white/25" />
            <div className="leading-tight">
              <p className="text-lg font-bold leading-none">{dueSoon.length}</p>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-white/70">Due soon</p>
            </div>
          </div>
        }
      />

      <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard icon="⚡" label="Due within 24h" value={dueSoon.length} sub={dueSoon.length ? 'Watch these carefully' : 'Nothing urgent'} tone={dueSoon.length ? 'amber' : 'emerald'} />
        <MetricCard icon="⏰" label="Overdue" value={overdue.length} sub={overdue.length ? 'Needs attention' : 'All on track'} tone={overdue.length ? 'rose' : 'slate'} />
        <MetricCard icon="🏁" label="Completed" value={done.length} sub="Total finished" tone="emerald" />
        <MetricCard icon="🎯" label="Focus status" value={active.length > 0 ? 'In flow' : 'Clear'} sub={active.length ? `${active.length} task(s) lined up` : 'Ready for assignments'} tone="brand" />
      </div>

      {sorted.length === 0 && (
        <EmptyState icon="✨" title="Your queue is clear" body="No active assignments. New tasks appear here automatically when there's capacity — enjoy the breathing room." />
      )}

      {sorted.length > 0 && (
        <>
          <Section dot="bg-gradient-to-br from-blue-600 to-indigo-600" tone="focus" title="Focus now" count={focusNow.length}>
            {focusNow.map((t, i) => <TaskCard key={t.id} t={t} i={i} />)}
          </Section>
          <Section dot="bg-gradient-to-br from-amber-500 to-orange-500" tone="next" title="Up next" count={upNext.length}>
            {upNext.map((t, i) => <TaskCard key={t.id} t={t} i={i} />)}
          </Section>
          {done.length > 0 && (
            <Section dot="bg-gradient-to-br from-emerald-500 to-teal-500" tone="done" title="Completed" count={done.length}>
              {done.slice(0, 8).map((t, i) => <TaskCard key={t.id} t={t} i={i} />)}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

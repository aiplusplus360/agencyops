import { useState } from 'react';

function useStateNow() {
  const [now, setNow] = useState(Date.now());
  useState(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  });
  return [now, setNow];
}

export const statusStyles = {
  PENDING: 'bg-slate-100 text-slate-600',
  WORKING_ON_IT: 'bg-brand-soft text-brand',
  BLOCKED: 'bg-rose-50 text-rose-600',
  SUBMITTED: 'bg-amber-soft text-amber-700',
  IN_REVISION: 'bg-amber-soft text-amber-700',
  COMPLETED: 'bg-emerald-soft text-emerald-700',
};

export const statusLabels = {
  PENDING: 'Pending',
  WORKING_ON_IT: 'Working on it',
  BLOCKED: 'Blocked',
  SUBMITTED: 'Under review',
  IN_REVISION: 'Revision',
  COMPLETED: 'Completed',
};

export const availabilityStyles = {
  ACTIVE: 'bg-emerald-soft text-emerald-700',
  AT_CAPACITY: 'bg-amber-soft text-amber-700',
  ON_LEAVE: 'bg-rose-50 text-rose-600',
  BACK_TOMORROW: 'bg-brand-soft text-brand',
};

export function Badge({ children, className = 'bg-slate-100 text-slate-600' }) {
  return <span className={`badge ${className}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  return <Badge className={statusStyles[status] || ''}>{statusLabels[status] || status}</Badge>;
}

export function ScoreBadge({ score }) {
  const color = score >= 80 ? 'bg-emerald-soft text-emerald-700'
    : score >= 60 ? 'bg-amber-soft text-amber-700'
    : 'bg-rose-50 text-rose-600';
  return <Badge className={color}>{score}/100</Badge>;
}

export function Countdown({ deadline, className = 'text-sm font-semibold' }) {
  const [now, setNow] = useStateNow();
  const ms = new Date(deadline).getTime() - now;
  const hours = ms > 0 ? Math.floor(ms / 3600000) : 0;
  const mins = ms > 0 ? Math.floor((ms % 3600000) / 60000) : 0;
  const overdue = ms <= 0;
  const urgent = !overdue && ms < 24 * 3600000;
  const color = overdue ? 'text-rose-600' : urgent ? 'text-amber-600' : 'text-slate-700';
  return (
    <span className={`${className} ${color} ${overdue ? 'animate-pulse' : ''}`} title={new Date(deadline).toLocaleString()}>
      {overdue ? 'Overdue' : `${hours}h ${mins}m left`}
    </span>
  );
}

export function StatCard({ label, value, sub, accent = 'text-slate-900' }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-auto rounded-xl bg-white shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose}>✕</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ className = 'h-6 w-6' }) {
  return (
    <div className="flex items-center justify-center p-8">
      <div className={`${className} animate-spin rounded-full border-2 border-slate-300 border-t-brand`} />
    </div>
  );
}

export function EmptyState({ icon = '📋', title, body }) {
  return (
    <div className="card flex flex-col items-center justify-center p-10 text-center">
      <div className="text-4xl">{icon}</div>
      <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
      {body && <p className="mt-1 text-sm text-slate-500">{body}</p>}
    </div>
  );
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Circular progress ring (value 0–100). Color comes from `text-*` on a wrapper or className. */
export function Ring({ value, size = 96, stroke = 8, className = '', label, sub }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-slate-900">{label ?? `${Math.round(pct)}`}</span>
        {sub && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}

const METRIC_TONES = {
  brand: { bg: 'from-blue-50 via-white to-indigo-50', chip: 'bg-blue-100 text-blue-600' },
  emerald: { bg: 'from-emerald-50 via-white to-teal-50', chip: 'bg-emerald-100 text-emerald-600' },
  amber: { bg: 'from-amber-50 via-white to-orange-50', chip: 'bg-amber-100 text-amber-600' },
  rose: { bg: 'from-rose-50 via-white to-red-50', chip: 'bg-rose-100 text-rose-600' },
  slate: { bg: 'from-slate-100 via-white to-slate-50', chip: 'bg-slate-200 text-slate-600' },
};

/** Gradient metric card with a colored icon chip — compact enough for a 4-up row. */
export function MetricCard({ icon, label, value, sub, tone = 'brand', className = '' }) {
  const t = METRIC_TONES[tone] || METRIC_TONES.brand;
  return (
    <div className={`card flex items-center gap-3 bg-gradient-to-br p-4 ${t.bg} ${className}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg shadow-sm ${t.chip}`}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-xl font-bold text-slate-900">{value}</p>
        {sub && <p className="truncate text-[11px] text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

/** Soft gradient hero banner used at the top of the worker pages — slim, not towering. */
export function HeroBanner({ eyebrow, title, subtitle, actions, tone = 'brand' }) {
  const tones = {
    brand: 'from-blue-600 via-indigo-600 to-violet-600',
    emerald: 'from-emerald-600 via-teal-600 to-cyan-600',
    amber: 'from-amber-500 via-orange-500 to-rose-500',
    sunset: 'from-indigo-600 via-purple-600 to-fuchsia-500',
  };
  const blobs = {
    brand: 'bg-white/10',
    emerald: 'bg-white/10',
    amber: 'bg-white/15',
    sunset: 'bg-fuchsia-300/20',
  };
  return (
    <div className={`relative mb-5 overflow-hidden rounded-xl bg-gradient-to-br px-5 py-4 text-white shadow-card ${tones[tone] || tones.brand}`}>
      <div className={`pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full blur-xl ${blobs[tone] || 'bg-white/10'}`} />
      <div className="pointer-events-none absolute -bottom-20 left-1/4 h-36 w-36 rounded-full bg-cyan-200/10 blur-xl" />
      {eyebrow && <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">{eyebrow}</p>}
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 max-w-2xl text-xs text-white/80">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

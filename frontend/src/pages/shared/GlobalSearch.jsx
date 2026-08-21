import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { StatusBadge, HeroBanner, Spinner } from '../../components/ui';

export default function GlobalSearch() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const isAdmin = user?.role === 'ADMIN';

  async function run(e) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    const r = await api.get(`/search?q=${encodeURIComponent(q)}`).catch(() => ({ tasks: [], workers: [], products: [], visions: [] }));
    setResults(r);
    setSearched(true);
    setBusy(false);
  }

  const total = (results?.tasks?.length || 0) + (results?.workers?.length || 0) + (results?.products?.length || 0) + (results?.visions?.length || 0);

  return (
    <div>
      <HeroBanner
        eyebrow={isAdmin ? 'Agency Command' : 'Delivery Terminal'}
        title="Global Search"
        subtitle="Search across tasks, workers, products, and visions."
        actions={
          <form onSubmit={run} className="flex items-center gap-2">
            <input
              className="w-64 rounded-xl border-0 bg-white/15 px-4 py-2 text-sm text-white placeholder-white/60 backdrop-blur focus:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/40"
              placeholder="Search anything…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand hover:bg-blue-50" disabled={busy}>
              {busy ? '…' : 'Search'}
            </button>
          </form>
        }
      />

      {searched && total === 0 && (
        <div className="card flex flex-col items-center justify-center p-10 text-center">
          <span className="text-4xl">🔍</span>
          <h3 className="mt-3 font-semibold text-slate-900">No results found</h3>
          <p className="mt-1 text-sm text-slate-500">Try a different search term.</p>
        </div>
      )}

      {busy && <Spinner />}

      {results?.tasks?.length > 0 && (
        <div className="card mb-6 overflow-hidden">
          <h2 className="border-b border-slate-100 px-5 py-3.5 font-semibold text-slate-900">Tasks ({results.tasks.length})</h2>
          <div className="divide-y divide-slate-100">
            {results.tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-blue-50/40">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{t.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {t.assignments?.[0]?.worker?.user?.name ? `Assigned to ${t.assignments[0].worker.user.name} · ` : 'Unassigned · '}
                    {t.deadline ? new Date(t.deadline).toLocaleDateString() : 'no deadline'}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="grid gap-6 lg:grid-cols-3">
          {results?.workers?.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold text-slate-900">Workers ({results.workers.length})</h2>
              <div className="space-y-2">
                {results.workers.map((w) => (
                  <div key={w.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">{w.user?.name?.[0]}</div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{w.user?.name}</p>
                      <p className="truncate text-xs text-slate-400">{w.user?.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results?.products?.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold text-slate-900">Products ({results.products.length})</h2>
              <div className="space-y-2">
                {results.products.map((p) => (
                  <div key={p.id} className="rounded-xl border border-slate-100 px-3 py-2">
                    <p className="text-sm font-medium text-slate-800">{p.name}</p>
                    {p.description && <p className="truncate text-xs text-slate-400">{p.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {results?.visions?.length > 0 && (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold text-slate-900">Visions ({results.visions.length})</h2>
              <div className="space-y-2">
                {results.visions.map((v) => (
                  <div key={v.id} className="rounded-xl border border-slate-100 px-3 py-2">
                    <p className="line-clamp-2 text-sm text-slate-700">{v.rawText}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

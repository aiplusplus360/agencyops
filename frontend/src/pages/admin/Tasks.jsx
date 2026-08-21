import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, Spinner, EmptyState, StatusBadge, Countdown, Badge, Modal, fmtDate } from '../../components/ui';
import { useSocket } from '../../context/SocketContext';

const STATUSES = ['PENDING', 'WORKING_ON_IT', 'BLOCKED', 'SUBMITTED', 'IN_REVISION', 'COMPLETED'];
const PRIORITY_LABELS = { 1: 'P1 · Urgent', 2: 'P2 · Normal', 3: 'P3 · Low' };
const SORTS = [
  { key: 'deadline', label: 'Deadline' },
  { key: 'priority', label: 'Priority' },
  { key: 'created', label: 'Created' },
];

function fmtDateInput(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export default function AdminTasks() {
  const [tasks, setTasks] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', priority: '', workerId: '' });
  const [sort, setSort] = useState('deadline');
  const [expanded, setExpanded] = useState({});
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', description: '', priority: 2, effortHours: 4, deadline: '' });
  const [reschedDraft, setReschedDraft] = useState({});
  const [reassignDraft, setReassignDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const { on } = useSocket();

  async function load() {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.workerId) params.set('workerId', filters.workerId);
    const qs = params.toString();
    Promise.all([
      api.get(`/tasks${qs ? `?${qs}` : ''}`).catch(() => []),
      api.get('/workers').catch(() => []),
    ]).then(([t, w]) => { setTasks(t); setWorkers(w); });
  }

  useEffect(() => { load(); }, [filters]);
  useEffect(() => on('team_update', () => load()), [on]);

  const rows = useMemo(() => {
    if (!tasks) return [];
    const arr = [...tasks];
    arr.sort((a, b) => {
      if (sort === 'priority') return (a.priority || 3) - (b.priority || 3);
      if (sort === 'created') return new Date(b.createdAt) - new Date(a.createdAt);
      return (a.deadline ? new Date(a.deadline) : new Date(8640000000000000)) - (b.deadline ? new Date(b.deadline) : new Date(8640000000000000));
    });
    return arr;
  }, [tasks, sort]);

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function assigneeOf(t) {
    return t.assignments?.[0]?.worker?.user?.name || 'Unassigned';
  }

  async function applyChange(change) {
    setBusy(true);
    setFlash(null);
    try {
      const res = await api.post('/tasks/apply-changes', { changes: [change] });
      if (res.applied?.length) {
        const r = res.applied[0];
        const line = r.action === 'reschedule' ? `deadline → ${r.newDeadline}` : r.action === 'reassign' ? `→ now with ${r.workerName}` : 'details updated';
        setFlash({ type: 'ok', text: `Updated "${r.title}": ${line}` });
      } else {
        setFlash({ type: 'error', text: res.errors?.[0]?.error || 'Could not apply the change.' });
      }
      await load();
    } catch (e) {
      setFlash({ type: 'error', text: e.message || 'Failed to apply the change.' });
    } finally {
      setBusy(false);
    }
  }

  function openEdit(t) {
    setEditing(t);
    setEditForm({
      title: t.title || '',
      description: t.description || '',
      priority: t.priority || 2,
      effortHours: t.effortHours || 4,
      skillTags: (t.skillTags || []).join(', '),
      acceptanceCriteria: (t.acceptanceCriteria || []).join('\n'),
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    const fields = {
      title: editForm.title.trim(),
      description: editForm.description,
      priority: Number(editForm.priority),
      effortHours: Number(editForm.effortHours),
      skillTags: editForm.skillTags.split(',').map((s) => s.trim()).filter(Boolean),
      acceptanceCriteria: editForm.acceptanceCriteria.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    if (!fields.title) return;
    await applyChange({ action: 'edit', taskId: editing.id, fields, reason: 'Edited from Tasks page.' });
    setEditing(null);
  }

  async function createTask(e) {
    e.preventDefault();
    if (!createForm.title.trim()) return;
    setBusy(true);
    setFlash(null);
    try {
      const body = {
        title: createForm.title.trim(),
        description: createForm.description,
        priority: Number(createForm.priority),
        effortHours: Number(createForm.effortHours) || 4,
      };
      if (createForm.deadline) body.deadline = createForm.deadline;
      const task = await api.post('/tasks', body);
      setCreating(false);
      setCreateForm({ title: '', description: '', priority: 2, effortHours: 4, deadline: '' });
      setFlash({ type: 'ok', text: `Task created: "${task.title}"` });
      await load();
    } catch (e2) {
      setFlash({ type: 'error', text: e2.message || 'Failed to create the task.' });
    } finally {
      setBusy(false);
    }
  }

  if (!tasks) return <Spinner />;

  const now = new Date();
  const stats = {
    total: tasks.length,
    overdue: tasks.filter((t) => t.status !== 'COMPLETED' && new Date(t.deadline) < now).length,
    active: tasks.filter((t) => ['PENDING', 'WORKING_ON_IT', 'IN_REVISION'].includes(t.status)).length,
    completed: tasks.filter((t) => t.status === 'COMPLETED').length,
  };

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Every task in the agency — filter, reschedule, reassign, or edit"
        actions={<button className="btn-primary" onClick={() => setCreating(true)}>New task</button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Showing</p><p className="mt-1 text-xl font-bold text-slate-900">{stats.total}</p></div>
        <div className="card p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overdue</p><p className={`mt-1 text-xl font-bold ${stats.overdue ? 'text-rose-600' : 'text-slate-900'}`}>{stats.overdue}</p></div>
        <div className="card p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active</p><p className="mt-1 text-xl font-bold text-brand">{stats.active}</p></div>
        <div className="card p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed</p><p className="mt-1 text-xl font-bold text-emerald">{stats.completed}</p></div>
      </div>

      {flash && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${flash.type === 'ok' ? 'bg-emerald-soft text-emerald-800' : 'bg-rose-50 text-rose-600'}`}>
          {flash.text}
        </div>
      )}

      {/* Filters */}
      <div className="card mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="md:col-span-1">
            <label className="label">Search</label>
            <input className="input" placeholder="Title…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={filters.priority} onChange={(e) => setFilter('priority', e.target.value)}>
              <option value="">All priorities</option>
              {[1, 2, 3].map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Assignee</label>
            <select className="input" value={filters.workerId} onChange={(e) => setFilter('workerId', e.target.value)}>
              <option value="">Everyone</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Sort by</label>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="🗂️" title="No tasks match" body="Adjust the filters, or create a task with the New task button." />
      ) : (
        <div className="space-y-2">
          {rows.map((t) => {
            const open = !!expanded[t.id];
            const worker = workers.find((w) => w.userId === t.assignments?.[0]?.worker?.userId);
            return (
              <div key={t.id} className={`card overflow-hidden ${open ? 'ring-2 ring-brand/20' : ''}`}>
                <button
                  className="w-full px-4 py-3 text-left"
                  onClick={() => setExpanded((p) => ({ ...p, [t.id]: !p[t.id] }))}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`flex h-2 w-2 shrink-0 rounded-full ${t.status === 'COMPLETED' ? 'bg-emerald' : t.status === 'BLOCKED' ? 'bg-rose-500' : t.status === 'PENDING' ? 'bg-slate-300' : 'bg-brand'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{t.title}</p>
                      <p className="text-xs text-slate-500">
                        {assigneeOf(t)}
                        {t.product?.name ? ` · ${t.product.name}` : ''}
                        {t.roadmap?.title ? ` · ${t.roadmap.title}` : ''}
                      </p>
                    </div>
                    <Badge className={t.priority === 1 ? 'bg-rose-50 text-rose-600' : t.priority === 2 ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-400'}>
                      {PRIORITY_LABELS[t.priority] || `P${t.priority}`}
                    </Badge>
                    <StatusBadge status={t.status} />
                    {t.deadline && <Countdown deadline={t.deadline} className="text-xs font-semibold" />}
                    <span className={`text-xs text-slate-400 ${open ? 'rotate-180' : ''} transition-transform`}>▾</span>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-slate-100 px-4 py-4">
                    {t.description && <p className="mb-3 text-sm text-slate-600">{t.description}</p>}

                    {(t.skillTags?.length > 0) && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {t.skillTags.map((s) => <Badge key={s} className="bg-brand-soft text-brand">{s}</Badge>)}
                      </div>
                    )}

                    {t.acceptanceCriteria?.length > 0 && (
                      <div className="mb-3">
                        <p className="label">Acceptance criteria</p>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                          {t.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                    )}

                    <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>Effort: {t.effortHours}h</span>
                      <span>· Created {fmtDate(t.createdAt)}</span>
                      {t.deadline && <span>· Due {fmtDate(t.deadline)}</span>}
                    </div>

                    {/* Actions */}
                    <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
                      <div>
                        <label className="label">Reschedule</label>
                        <div className="flex gap-2">
                          <input
                            type="date"
                            className="input flex-1"
                            value={reschedDraft[t.id] || fmtDateInput(t.deadline)}
                            onChange={(e) => setReschedDraft((p) => ({ ...p, [t.id]: e.target.value }))}
                          />
                          <button
                            className="btn-secondary !px-3"
                            disabled={busy}
                            onClick={() => applyChange({ action: 'reschedule', taskId: t.id, newDeadline: reschedDraft[t.id] || fmtDateInput(t.deadline), reason: 'Rescheduled from Tasks page.' })}
                          >
                            Set
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="label">Reassign</label>
                        <div className="flex gap-2">
                          <select
                            className="input flex-1"
                            value={reassignDraft[t.id] || (worker ? worker.id : '')}
                            onChange={(e) => setReassignDraft((p) => ({ ...p, [t.id]: e.target.value }))}
                          >
                            <option value="">Unassigned</option>
                            {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                          <button
                            className="btn-secondary !px-3"
                            disabled={busy || !(reassignDraft[t.id] || worker)}
                            onClick={() => {
                              const w = workers.find((x) => x.id === (reassignDraft[t.id] || worker?.id));
                              if (w) applyChange({ action: 'reassign', taskId: t.id, newAssignee: w.email, reason: 'Reassigned from Tasks page.' });
                            }}
                          >
                            Move
                          </button>
                        </div>
                      </div>
                      <div className="flex items-end gap-2">
                        <button className="btn-secondary flex-1" onClick={() => openEdit(t)}>Edit details</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit task${editing ? ` — ${editing.title}` : ''}`}>
        {editForm && (
          <form className="space-y-3" onSubmit={saveEdit}>
            <div>
              <label className="label">Title</label>
              <input className="input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} required />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input" rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Priority</label>
                <select className="input" value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}>
                  <option value={1}>P1 · Urgent</option>
                  <option value={2}>P2 · Normal</option>
                  <option value={3}>P3 · Low</option>
                </select>
              </div>
              <div>
                <label className="label">Effort (hours)</label>
                <input className="input" type="number" min={1} max={40} value={editForm.effortHours} onChange={(e) => setEditForm({ ...editForm, effortHours: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Skill tags (comma separated)</label>
              <input className="input" value={editForm.skillTags} onChange={(e) => setEditForm({ ...editForm, skillTags: e.target.value })} placeholder="Copywriting, SEO, …" />
            </div>
            <div>
              <label className="label">Acceptance criteria (one per line)</label>
              <textarea className="input" rows={3} value={editForm.acceptanceCriteria} onChange={(e) => setEditForm({ ...editForm, acceptanceCriteria: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Create task modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title="New task">
        <form className="space-y-3" onSubmit={createTask}>
          <div>
            <label className="label">Title</label>
            <input className="input" value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} required placeholder="What needs to be done?" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={3} value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="Context, links, expectations…" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Priority</label>
              <select className="input" value={createForm.priority} onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}>
                <option value={1}>P1 · Urgent</option>
                <option value={2}>P2 · Normal</option>
                <option value={3}>P3 · Low</option>
              </select>
            </div>
            <div>
              <label className="label">Effort (hours)</label>
              <input className="input" type="number" min={1} max={40} value={createForm.effortHours} onChange={(e) => setCreateForm({ ...createForm, effortHours: e.target.value })} />
            </div>
            <div>
              <label className="label">Deadline</label>
              <input className="input" type="date" value={createForm.deadline} onChange={(e) => setCreateForm({ ...createForm, deadline: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create task'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

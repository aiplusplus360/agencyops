import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, Spinner, Modal, Badge, availabilityStyles } from '../../components/ui';

export default function CapabilityRegistry() {
  const [workers, setWorkers] = useState([]);
  const [skills, setSkills] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [editEnabled, setEditEnabled] = useState(true);

  useEffect(() => {
    refresh();
    api
      .get('/settings')
      .then((s) => setEditEnabled(s?.employeeManagement?.editEnabled !== false))
      .catch(() => {});
  }, []);

  async function refresh() {
    const [w, s] = await Promise.all([
      api.get('/workers').catch(() => []),
      api.get('/skills').catch(() => []),
    ]);
    setWorkers(w);
    setSkills(s);
  }

  function openEdit(w) {
    setEditing(w);
    setForm({
      seniorityTier: w.seniorityTier,
      baseCapacity: w.baseCapacity,
      strengthsNotes: w.strengthsNotes || '',
      skillIds: w.skills.map((s) => s.id),
    });
  }

  async function save() {
    await api.patch(`/workers/${editing.id}`, {
      ...form,
      skills: form.skillIds.map((skillId) => ({ skillId, proficiency: 3 })),
    });
    setEditing(null);
    refresh();
  }

  return (
    <div>
      <PageHeader title="Employees" subtitle="Every worker's skill sets, seniority tiers, task capacities and strengths" />
      <div className="grid gap-4 md:grid-cols-2">
        {workers.map((w) => (
          <div key={w.id} className="card p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft font-bold text-brand">{w.name?.[0]}</div>
                <div>
                  <h3 className="font-semibold text-slate-900">{w.name}</h3>
                  <p className="text-xs text-slate-500">{w.email}</p>
                </div>
              </div>
              {editEnabled ? (
                <button className="text-xs font-medium text-brand hover:underline" onClick={() => openEdit(w)}>Edit</button>
              ) : (
                <span className="text-xs text-slate-400" title="Editing is turned off in Settings">Read-only</span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className={availabilityStyles[w.availability] || ''}>{w.availability}</Badge>
              <Badge className="bg-slate-100 text-slate-600">{w.seniorityTier}</Badge>
              <Badge className="bg-brand-soft text-brand">{w.activeTasks}/{w.effectiveCapacity} load</Badge>
              {w.scalingState !== 'STEADY' && (
                <Badge className={w.scalingState === 'UP' ? 'bg-emerald-soft text-emerald-700' : 'bg-amber-soft text-amber-700'}>
                  scaling {w.scalingState.toLowerCase()} ×{w.scalingFactor}
                </Badge>
              )}
            </div>
            <div className="mt-3">
              <p className="label">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {w.skills.map((s) => <Badge key={s.id}>{s.name}</Badge>)}
              </div>
            </div>
            {w.strengthsNotes && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{w.strengthsNotes}</p>}
          </div>
        ))}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.name || ''}`}>
        {form && (
          <div className="space-y-4">
            <div>
              <label className="label">Seniority tier</label>
              <select className="input" value={form.seniorityTier} onChange={(e) => setForm({ ...form, seniorityTier: e.target.value })}>
                {['JUNIOR', 'MID', 'SENIOR', 'LEAD'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Base capacity (max concurrent tasks)</label>
              <input type="number" min="1" max="10" className="input" value={form.baseCapacity} onChange={(e) => setForm({ ...form, baseCapacity: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Strengths & notes</label>
              <textarea className="input" rows="3" value={form.strengthsNotes} onChange={(e) => setForm({ ...form, strengthsNotes: e.target.value })} />
            </div>
            <div>
              <label className="label">Skills</label>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setForm({
                      ...form,
                      skillIds: form.skillIds.includes(s.id) ? form.skillIds.filter((x) => x !== s.id) : [...form.skillIds, s.id],
                    })}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${form.skillIds.includes(s.id) ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

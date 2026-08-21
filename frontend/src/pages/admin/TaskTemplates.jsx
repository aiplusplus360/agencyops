import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, Spinner, Modal, Badge } from '../../components/ui';

export default function TaskTemplates() {
  const [templates, setTemplates] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', title: '', description: '', effortHours: 4, cadence: 'WEEKLY', skillTags: '' });

  useEffect(() => { load(); }, []);

  async function load() {
    api.get('/templates').then(setTemplates).catch(() => setTemplates([]));
  }

  async function save() {
    await api.post('/templates', {
      ...form,
      skillTags: form.skillTags.split(',').map((s) => s.trim()).filter(Boolean),
      acceptanceCriteria: ['Deliverable submitted'],
    });
    setCreating(false);
    setForm({ name: '', title: '', description: '', effortHours: 4, cadence: 'WEEKLY', skillTags: '' });
    load();
  }

  async function toggleActive(t) {
    await api.patch(`/templates/${t.id}`, { active: !t.active });
    load();
  }

  if (!templates) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Recurring Task Templates"
        subtitle="AI auto-instantiates these tasks on schedule — no admin prompts needed"
        actions={<button className="btn-primary" onClick={() => setCreating(true)}>+ New template</button>}
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <div key={t.id} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{t.title}</h3>
                <p className="text-xs text-slate-500">{t.name}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className="bg-brand-soft text-brand">{t.cadence}</Badge>
                <button className="text-xs text-slate-400 hover:text-brand" onClick={() => toggleActive(t)}>{t.active ? 'Active' : 'Paused'}</button>
              </div>
            </div>
            {t.description && <p className="mt-2 text-sm text-slate-500">{t.description}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {t.skillTags?.map((s) => <span key={s} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{s}</span>)}
            </div>
            <p className="mt-3 text-xs text-slate-400">{t.effortHours}h effort · {t.instances?.filter((i) => i.status === 'GENERATED').length} generated</p>
          </div>
        ))}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="New template">
        <div className="space-y-4">
          <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Task title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className="label">Description</label><textarea className="input" rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Cadence</label>
              <select className="input" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}>
                <option>DAILY</option><option>WEEKLY</option><option>MONTHLY</option>
              </select>
            </div>
            <div><label className="label">Effort (hours)</label><input type="number" className="input" value={form.effortHours} onChange={(e) => setForm({ ...form, effortHours: Number(e.target.value) })} /></div>
          </div>
          <div><label className="label">Skill tags (comma separated)</label><input className="input" value={form.skillTags} onChange={(e) => setForm({ ...form, skillTags: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn-primary" onClick={save}>Create</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, Spinner, Modal, EmptyState } from '../../components/ui';

export default function Products() {
  const [products, setProducts] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', targetUsers: '', techStack: '', goals: '' });
  const [detail, setDetail] = useState(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    api.get('/products').then(setProducts).catch(() => setProducts([]));
  }

  async function save() {
    if (editing) {
      await api.patch(`/products/${editing.id}`, form);
      setEditing(null);
    } else {
      await api.post('/products', form);
      setCreating(false);
    }
    setForm({ name: '', description: '', targetUsers: '', techStack: '', goals: '' });
    refresh();
  }

  async function openDetail(id) {
    const p = await api.get(`/products/${id}`);
    setDetail(p);
  }

  return (
    <div>
      <PageHeader
        title="Product"
        subtitle="Permanent memory of your products — the AI uses these as reference context for every campaign roadmap"
        actions={<button className="btn-primary" onClick={() => setCreating(true)}>+ New product</button>}
      />

      {products?.length === 0 && <EmptyState icon="▣" title="No products yet" body="Add your products so the AI can reference them when decomposing your brain-dumps." />}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products?.map((p) => (
          <div key={p.id} className="card p-5">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold text-slate-900">{p.name}</h3>
              <div className="flex gap-2">
                <button className="text-xs text-slate-400 hover:text-brand" onClick={() => { setEditing(p); setForm({ name: p.name, description: p.description || '', targetUsers: p.targetUsers || '', techStack: p.techStack || '', goals: p.goals || '' }); }}>Edit</button>
                <button className="text-xs text-slate-400 hover:text-brand" onClick={() => openDetail(p.id)}>View</button>
              </div>
            </div>
            {p.description && <p className="mt-1 text-sm text-slate-500">{p.description}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-slate-400">
              {p.techStack && <span className="rounded bg-slate-100 px-2 py-0.5">{p.techStack}</span>}
              <span className="rounded bg-slate-100 px-2 py-0.5">{p._count?.documents ?? 0} docs</span>
              <span className="rounded bg-slate-100 px-2 py-0.5">{p._count?.tasks ?? 0} tasks</span>
            </div>
          </div>
        ))}
      </div>

      <Modal open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} title={editing ? 'Edit product' : 'New product'}>
        <div className="space-y-4">
          <div><label className="label">Product name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Description</label><textarea className="input" rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><label className="label">Target audience</label><input className="input" value={form.targetUsers} onChange={(e) => setForm({ ...form, targetUsers: e.target.value })} /></div>
          <div><label className="label">Platforms & channels</label><input className="input" value={form.techStack} onChange={(e) => setForm({ ...form, techStack: e.target.value })} /></div>
          <div><label className="label">Campaign goals</label><textarea className="input" rows="2" value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => { setCreating(false); setEditing(null); }}>Cancel</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name || 'Client'} wide>
        {detail && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{detail.description}</p>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="label">Target audience</p><p className="text-sm">{detail.targetUsers || '—'}</p></div>
              <div><p className="label">Platforms & channels</p><p className="text-sm">{detail.techStack || '—'}</p></div>
            </div>
            <div><p className="label">Campaign goals</p><p className="text-sm">{detail.goals || '—'}</p></div>
            <div>
              <p className="label">Knowledge base documents</p>
              {detail.documents?.length === 0 && <p className="text-sm text-slate-500">No documents uploaded.</p>}
              {detail.documents?.map((d) => <p key={d.id} className="truncate rounded bg-slate-50 px-3 py-1.5 text-sm text-slate-600">{d.fileRef}</p>)}
            </div>
            <div>
              <p className="label">Related tasks</p>
              {detail.tasks?.slice(0, 10).map((t) => <p key={t.id} className="truncate text-sm text-slate-700">{t.title}</p>)}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

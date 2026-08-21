import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { Badge, EmptyState, PageHeader, Spinner } from '../../components/ui';

const TYPE_STYLE = {
  FACT: 'bg-brand-soft text-brand',
  PREFERENCE: 'bg-amber-soft text-amber-700',
  DECISION: 'bg-emerald-soft text-emerald-700',
  LESSON: 'bg-rose-50 text-rose-600',
};

const TYPE_ICON = { FACT: '📌', PREFERENCE: '💭', DECISION: '✅', LESSON: '📚' };

export default function Memory() {
  const [memories, setMemories] = useState(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState('FACT');
  const [newCategory, setNewCategory] = useState('other');
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const [msg, setMsg] = useState(null);

  async function load() {
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    if (query.trim()) params.set('q', query.trim());
    const list = await api.get(`/memories?${params.toString()}`).catch(() => []);
    setMemories(list || []);
  }

  useEffect(() => { load(); }, [typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!memories) return [];
    const q = query.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter((m) => m.content.toLowerCase().includes(q) || m.category?.toLowerCase().includes(q));
  }, [memories, query]);

  async function addMemory() {
    const content = newContent.trim();
    if (!content) return;
    try {
      await api.post('/memories', { content, type: newType, category: newCategory });
      setNewContent('');
      setShowAdd(false);
      setMsg({ type: 'ok', text: 'Memory saved — the AI will use it from now on.' });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Failed to save memory.' });
    }
  }

  async function togglePin(m) {
    await api.post(`/memories/${m.id}/pin`).catch(() => {});
    load();
  }

  async function saveEdit(id) {
    const content = editText.trim();
    if (!content) return;
    try {
      await api.patch(`/memories/${id}`, { content });
      setEditing(null);
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Failed to update memory.' });
    }
  }

  async function removeMemory(id) {
    if (!confirm('Delete this memory?')) return;
    await api.del(`/memories/${id}`).catch(() => {});
    load();
  }

  const total = memories?.length || 0;

  return (
    <div>
      <PageHeader
        title="AI Memory"
        subtitle="Everything the AI-COO remembers about you, your team and your business. It uses this to give smarter, more personal advice — and it learns from every conversation."
        actions={
          <button className="btn-primary" onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? 'Cancel' : '+ Add memory'}
          </button>
        }
      />

      {msg && (
        <div className={`mb-4 rounded-lg px-4 py-2 text-sm ${msg.type === 'ok' ? 'bg-emerald-soft text-emerald-800' : 'bg-rose-50 text-rose-600'}`}>
          {msg.text}
        </div>
      )}

      {showAdd && (
        <div className="card mb-4 p-5">
          <p className="mb-2 text-sm font-semibold text-slate-800">Add a memory the AI should always know</p>
          <textarea
            className="input"
            rows={2}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="e.g. We never run campaigns on X without client approval first. Budget is $5k/month."
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select className="input w-auto" value={newType} onChange={(e) => setNewType(e.target.value)}>
              {Object.keys(TYPE_STYLE).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              className="input w-auto"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="category (e.g. budget, process)"
            />
            <button className="btn-primary ml-auto" onClick={addMemory}>Save memory</button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="input w-64"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search memories…"
        />
        <select className="input w-auto" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="FACT">FACT</option>
          <option value="PREFERENCE">PREFERENCE</option>
          <option value="DECISION">DECISION</option>
          <option value="LESSON">LESSON</option>
        </select>
        <span className="text-xs text-slate-400">{total} memories</span>
      </div>

      {!memories ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🧠"
          title={total === 0 ? 'No memories yet' : 'No matches'}
          body={
            total === 0
              ? 'The AI will start remembering things from your conversations automatically. Add one manually above, or just chat with the AI.'
              : 'Try a different search.'
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((m) => (
            <div key={m.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge className={TYPE_STYLE[m.type] || ''}>{TYPE_ICON[m.type] || ''} {m.type}</Badge>
                  {m.category && <Badge className="bg-slate-100 text-slate-500">{m.category}</Badge>}
                  {m.important && <Badge className="bg-amber-soft text-amber-700">★ pinned</Badge>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    className="rounded p-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title={m.important ? 'Unpin' : 'Pin (always inject into AI context)'}
                    onClick={() => togglePin(m)}
                  >
                    {m.important ? '★' : '☆'}
                  </button>
                  <button
                    className="rounded p-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Edit"
                    onClick={() => { setEditing(m.id); setEditText(m.content); }}
                  >
                    ✎
                  </button>
                  <button
                    className="rounded p-1 text-xs text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    title="Delete"
                    onClick={() => removeMemory(m.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {editing === m.id ? (
                <div className="mt-2">
                  <textarea
                    className="input"
                    rows={2}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn-primary" onClick={() => saveEdit(m.id)}>Save</button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-700">{m.content}</p>
              )}
              <p className="mt-2 text-[11px] text-slate-400">
                {new Date(m.createdAt).toLocaleDateString()}
                {m.source ? ` · via ${m.source}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

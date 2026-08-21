import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { Badge, availabilityStyles, HeroBanner } from '../../components/ui';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || '',
    avatar: user?.avatar || '',
    email: user?.email || '',
    emailPassword: '',
  });
  const [emailNotifs, setEmailNotifs] = useState(!!user?.emailNotifs);
  const [pw, setPw] = useState({ currentPassword: '', password: '' });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const [registry, setRegistry] = useState([]);
  const [mySkills, setMySkills] = useState(() => (user?.worker?.skills || []).map((s) => s.name));
  const [skillInput, setSkillInput] = useState('');
  const [strengthsNotes, setStrengthsNotes] = useState(user?.worker?.strengthsNotes || '');
  const [workBusy, setWorkBusy] = useState(false);

  const [availability, setAvailability] = useState(user?.worker?.availability || 'ACTIVE');
  const [availBusy, setAvailBusy] = useState(false);
  const [availMsg, setAvailMsg] = useState(null);
  const [loadInfo, setLoadInfo] = useState(null);

  useEffect(() => {
    api.get('/skills').then(setRegistry).catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.workerId) {
      api.get(`/workers/${user.workerId}`).then(setLoadInfo).catch(() => {});
    }
  }, [user?.workerId]);

  const AVAIL_OPTIONS = [
    { key: 'ACTIVE', icon: '🟢', label: 'Active', tip: 'Ready for new work' },
    { key: 'AT_CAPACITY', icon: '⚖️', label: 'At capacity', tip: 'Full for now' },
    { key: 'BACK_TOMORROW', icon: '🌙', label: 'Back tomorrow', tip: 'Paused today' },
    { key: 'ON_LEAVE', icon: '🏖️', label: 'On leave', tip: 'Tasks re-routed' },
  ];

  async function setAvailabilityNow(key) {
    setAvailBusy(true);
    setAvailMsg(null);
    try {
      const r = await api.patch('/availability/me', { availability: key });
      setAvailability(key);
      await refreshUser();
      api.get(`/workers/${user.workerId}`).then(setLoadInfo).catch(() => {});
      setAvailMsg(r.rebalanced?.length ? `${r.rebalanced.length} task(s) re-routed to teammates.` : 'Status updated.');
    } catch (ex) {
      setAvailMsg(null);
      setErr(ex.message);
    } finally {
      setAvailBusy(false);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true); setMsg(null); setErr(null);
    try {
      const updated = await api.patch('/users/me', {
        ...form,
        emailNotifs,
        // current password is required whenever the login email changes
        ...(form.email?.trim() !== user?.email ? { currentPassword: form.emailPassword } : {}),
      });
      setMsg('Profile saved.');
      await refreshUser();
      setForm((f) => ({ ...f, emailPassword: '' }));
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    setBusy(true); setMsg(null); setErr(null);
    try {
      await api.patch('/users/me', { password: pw.password, currentPassword: pw.currentPassword });
      setMsg('Password changed. You have been signed out of other devices.');
      setPw({ currentPassword: '', password: '' });
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  function addSkill() {
    const s = skillInput.trim();
    if (!s) return;
    if (!mySkills.some((x) => x.toLowerCase() === s.toLowerCase())) {
      setMySkills((p) => [...p, s]);
    }
    setSkillInput('');
  }

  function removeSkill(name) {
    setMySkills((p) => p.filter((x) => x !== name));
  }

  async function saveWorkProfile(e) {
    e.preventDefault();
    setWorkBusy(true); setMsg(null); setErr(null);
    try {
      await api.patch('/users/me', { skills: mySkills, strengthsNotes });
      const u = await refreshUser();
      setMySkills((u?.worker?.skills || []).map((s) => s.name));
      setStrengthsNotes(u?.worker?.strengthsNotes || '');
      setMsg('Work profile saved.');
    } catch (ex) { setErr(ex.message); } finally { setWorkBusy(false); }
  }

  const isWorker = user?.role === 'WORKER';
  const worker = user?.worker;
  const initials = (user?.name || 'U').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="mx-auto max-w-3xl">
      <HeroBanner
        eyebrow={isWorker ? 'Delivery Terminal' : 'Agency Command'}
        title="My Profile"
        subtitle="Manage your account, login details, and work profile."
        actions={
          <div className="flex items-center gap-3 rounded-xl bg-white/15 px-4 py-2 backdrop-blur">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-bold text-brand">{initials}</span>
            <div className="leading-tight">
              <p className="font-semibold">{user?.name}</p>
              <p className="text-xs text-white/75">{isWorker ? 'Worker' : 'Admin'}</p>
            </div>
          </div>
        }
      />

      {msg && <div className="mb-4 rounded-xl bg-emerald-soft px-4 py-3 text-sm text-emerald-700">{msg}</div>}
      {err && <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{err}</div>}

      <div className="space-y-6">
        <form onSubmit={saveProfile} className="card space-y-4 p-6">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-lg">👤</span>
            <h2 className="font-semibold text-slate-900">Account details</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Full name</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">Login email</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@agency.com"
              />
            </div>
          </div>
          {form.email?.trim() !== user?.email && (
            <p className="rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber-700">You're changing your login email — enter your current password below to confirm.</p>
          )}
          {form.email?.trim() !== user?.email && (
            <div>
              <label className="label">Current password (to confirm email change)</label>
              <input type="password" className="input" value={form.emailPassword} onChange={(e) => setForm({ ...form, emailPassword: e.target.value })} autoComplete="current-password" />
            </div>
          )}
          {isWorker && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={emailNotifs} onChange={(e) => setEmailNotifs(e.target.checked)} className="mt-0.5" />
              <span>Email me when tasks are assigned, graded, or need revision (SMTP must be configured)</span>
            </label>
          )}
          <div className="flex justify-end">
            <button className="btn-primary" disabled={busy}>Save changes</button>
          </div>
        </form>

        {isWorker && (
          <div className="card space-y-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-lg">📡</span>
                <div>
                  <h2 className="font-semibold text-slate-900">My availability</h2>
                  <p className="text-xs text-slate-500">One tap updates your status — the team adjusts your queue automatically.</p>
                </div>
              </div>
              {availBusy && <span className="text-xs text-slate-400">Saving…</span>}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {AVAIL_OPTIONS.map((o) => {
                const selected = availability === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    disabled={availBusy}
                    onClick={() => setAvailabilityNow(o.key)}
                    className={`group flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all duration-150 disabled:opacity-50 ${
                      selected
                        ? 'border-brand bg-brand-soft shadow-sm ring-1 ring-brand/30'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className="text-base leading-none">{o.icon}</span>
                      {selected && <span className="text-[10px] font-bold text-brand">✓</span>}
                    </span>
                    <span className={`text-sm font-semibold ${selected ? 'text-brand' : 'text-slate-700'}`}>{o.label}</span>
                    <span className="text-[10px] leading-tight text-slate-400">{o.tip}</span>
                  </button>
                );
              })}
            </div>

            {loadInfo && (
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <span className="text-sm font-bold text-slate-800">{loadInfo.activeTasks ?? 0}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    <span>Load</span>
                    <span>{loadInfo.effectiveCapacity} capacity</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-200">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${((loadInfo.activeTasks ?? 0) / (loadInfo.effectiveCapacity || 1)) >= 1 ? 'bg-rose-500' : ((loadInfo.activeTasks ?? 0) / (loadInfo.effectiveCapacity || 1)) >= 0.8 ? 'bg-amber' : 'bg-emerald'}`}
                      style={{ width: `${Math.min(100, Math.round(((loadInfo.activeTasks ?? 0) / (loadInfo.effectiveCapacity || 1)) * 100))}%` }}
                    />
                  </div>
                </div>
                <span className={`badge ${availabilityStyles[availability] || 'bg-slate-100 text-slate-600'}`}>{availability.replace(/_/g, ' ')}</span>
              </div>
            )}

            {availMsg && (
              <p className={`text-xs ${availMsg.includes('re-routed') ? 'text-amber-600' : 'text-emerald-600'}`}>
                {availMsg.includes('re-routed') ? '⚠️ ' : '✓ '}{availMsg}
              </p>
            )}
          </div>
        )}

        {isWorker && worker && (
          <form onSubmit={saveWorkProfile} className="card space-y-4 p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-soft text-lg">💼</span>
              <h2 className="font-semibold text-slate-900">My work profile</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-slate-100 text-slate-600">{worker.seniorityTier}</Badge>
              <Badge className="bg-brand-soft text-brand">{worker.effectiveCapacity} task capacity</Badge>
            </div>
            <div>
              <p className="label">My skills</p>
              {mySkills.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {mySkills.map((name) => (
                    <span key={name} className="inline-flex items-center gap-1 rounded-lg bg-brand-soft py-0.5 pl-2.5 pr-1 text-sm font-medium text-brand">
                      {name}
                      <button type="button" onClick={() => removeSkill(name)} title={`Remove ${name}`} className="rounded-md px-1 text-brand/60 hover:bg-brand hover:text-white">×</button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No skills added yet — add the skills you have below.</p>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  className="input"
                  list="skill-registry"
                  placeholder="Add a skill (e.g. Copywriting, Google Ads, Figma)"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
                />
                <datalist id="skill-registry">
                  {registry.map((s) => <option key={s.id} value={s.name} />)}
                </datalist>
                <button type="button" className="btn-secondary shrink-0" onClick={addSkill}>Add</button>
              </div>
            </div>
            <div>
              <label className="label">About me / strengths</label>
              <textarea
                className="input"
                rows={3}
                placeholder="What are you great at? Anything the team should know about how you work."
                value={strengthsNotes}
                onChange={(e) => setStrengthsNotes(e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-400">
              Your seniority tier and task capacity are set by the agency owner. Your availability, skills, strengths and contact details are yours to manage.
            </p>
            <div className="flex justify-end">
              <button className="btn-primary" disabled={workBusy}>Save work profile</button>
            </div>
          </form>
        )}

        <form onSubmit={changePassword} className="card space-y-4 p-6">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-lg">🔒</span>
            <h2 className="font-semibold text-slate-900">Change password</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Current password</label>
              <input type="password" className="input" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required />
            </div>
            <div>
              <label className="label">New password</label>
              <input type="password" className="input" minLength={6} value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} required />
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-secondary" disabled={busy}>Change password</button>
          </div>
        </form>
      </div>
    </div>
  );
}

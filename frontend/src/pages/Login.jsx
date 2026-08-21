import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = mode === 'login'
        ? await login(form.email, form.password)
        : await register({ name: form.name, email: form.email, password: form.password, role: 'WORKER' });
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 p-4">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-brand/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-emerald/10 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-indigo-600 text-3xl font-bold text-white shadow-lg shadow-brand/30">
            A
          </div>
          <h1 className="text-3xl font-bold text-slate-900">AgencyOps</h1>
          <p className="mt-1.5 text-sm text-slate-500">Closed-Loop AI Agency Operations Engine</p>
        </div>

        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-brand to-indigo-600 px-6 py-4">
            <p className="font-semibold text-white">{mode === 'login' ? 'Welcome back' : 'Join the team'}</p>
            <p className="text-xs text-white/80">{mode === 'login' ? 'Sign in to your delivery terminal' : 'Create your agency account'}</p>
          </div>
          <div className="p-6">
            <div className="mb-5 flex rounded-lg bg-slate-100 p-1">
              {['login', 'register'].map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(null); }}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {m === 'login' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="label">Full name</label>
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
              )}
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div>
                <label className="label">Password</label>
                <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
              </div>
              {mode === 'login' && (
                <div className="text-right">
                  <Link to="/forgot-password" className="text-sm text-brand hover:underline">Forgot password?</Link>
                </div>
              )}
              {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
              <button className="btn-primary w-full !py-2.5" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Demo: alice@coo.app / worker123 · elena@coo.app / worker123
        </p>
      </div>
    </div>
  );
}

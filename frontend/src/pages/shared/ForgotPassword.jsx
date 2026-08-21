import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';

export default function ForgotPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  async function requestReset(e) {
    e.preventDefault();
    setBusy(true); setMsg(null); setErr(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setMsg('If that email exists, a password reset link has been sent. Check your inbox (and spam).');
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  async function doReset(e) {
    e.preventDefault();
    setBusy(true); setMsg(null); setErr(null);
    try {
      await api.post('/auth/reset-password', { token, password });
      setMsg('Password reset. Redirecting to sign in…');
      setTimeout(() => navigate('/login'), 1500);
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white">A</div>
          <h1 className="text-2xl font-bold text-slate-900">AgencyOps</h1>
          <p className="mt-1 text-sm text-slate-500">{token ? 'Set a new password' : 'Reset your password'}</p>
        </div>

        <div className="card p-6">
          {msg && <div className="mb-4 rounded-lg bg-emerald-soft px-3 py-2 text-sm text-emerald-700">{msg}</div>}
          {err && <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}

          {token ? (
            <form onSubmit={doReset} className="space-y-4">
              <div>
                <label className="label">New password</label>
                <input type="password" className="input" minLength={6} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" required />
              </div>
              <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button>
            </form>
          ) : (
            <form onSubmit={requestReset} className="space-y-4">
              <div>
                <label className="label">Account email</label>
                <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          <Link to="/login" className="font-medium text-brand hover:underline">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

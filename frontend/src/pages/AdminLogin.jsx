import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PIN_LENGTH = 6;

function ShieldIcon({ className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function KeyIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function FingerprintIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 11c0 5-2 8-2 8" />
      <path d="M8 15c-1 3-1.5 5-1.5 5" />
      <path d="M16 15c.6 2 1 3.5 1 4.5" />
      <path d="M12 6a4 4 0 0 1 4 4" />
      <path d="M12 2a8 8 0 0 1 8 8c0 1.6-.3 3.1-.8 4.4" />
      <path d="M4.8 14.4A8 8 0 0 1 4 10" />
    </svg>
  );
}

export default function AdminLogin() {
  const { user, loading, loginAdmin, verifyAdminPin } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [pin, setPin] = useState(Array(PIN_LENGTH).fill(''));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const pinRefs = useRef([]);

  useEffect(() => {
    if (!loading && user && user.role === 'ADMIN') navigate('/', { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (step === 2) setTimeout(() => pinRefs.current[0]?.focus(), 80);
  }, [step]);

  async function submitCredentials(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await loginAdmin(identifier.trim(), password);
      if (res && res.requirePin) {
        setChallenge(res.challenge);
        setStep(2);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(e) {
    e.preventDefault();
    if (busy) return;
    const code = pin.join('');
    if (code.length !== PIN_LENGTH) {
      setError('Enter all 6 digits');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyAdminPin(challenge, code);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'PIN verification failed');
      setPin(Array(PIN_LENGTH).fill(''));
      pinRefs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  function handleDigitChange(i, val) {
    const digit = val.replace(/\D/g, '').slice(-1);
    setPin((prev) => {
      const next = [...prev];
      next[i] = digit;
      return next;
    });
    if (digit && i < PIN_LENGTH - 1) pinRefs.current[i + 1]?.focus();
  }

  function handleDigitKeyDown(i, e) {
    if (e.key === 'Backspace' && !pin[i] && i > 0) pinRefs.current[i - 1]?.focus();
    if (e.key === 'Enter') submitPin(e);
  }

  function handlePaste(e) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(PIN_LENGTH).fill('');
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setPin(next);
    pinRefs.current[Math.min(text.length, PIN_LENGTH - 1)]?.focus();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-fuchsia-950 p-4">
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/40">
            <ShieldIcon className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold text-white">Admin Portal</h1>
          <p className="mt-1.5 text-sm text-indigo-200/70">Restricted access · System owner only</p>
        </div>

        <div className="card overflow-hidden !border-white/10 !bg-white/95 backdrop-blur-xl">
          <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">{step === 1 ? 'Step 1 · Credentials' : 'Step 2 · PIN'}</p>
                <p className="text-xs text-white/80">
                  {step === 1 ? 'Enter your administrator credentials' : 'Enter your 6-digit security PIN'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {[1, 2].map((s) => (
                  <span
                    key={s}
                    className={`h-1.5 w-6 rounded-full transition-all ${step >= s ? 'bg-white' : 'bg-white/30'}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="p-6">
            {step === 1 ? (
              <form onSubmit={submitCredentials} className="space-y-4">
                <div>
                  <label className="label flex items-center gap-1.5">
                    <KeyIcon className="h-3.5 w-3.5 text-slate-400" /> Username
                  </label>
                  <input
                    className="input"
                    placeholder="Administrator username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
                <div>
                  <label className="label flex items-center gap-1.5">
                    <ShieldIcon className="h-3.5 w-3.5 text-slate-400" /> Password
                  </label>
                  <input
                    type="password"
                    className="input"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                {error && <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</div>}
                <button className="btn-primary w-full !py-2.5" disabled={busy}>
                  {busy ? 'Verifying…' : 'Continue'}
                </button>
                <div className="pt-1 text-center">
                  <Link to="/login" className="text-xs text-slate-400 hover:text-slate-600">
                    ← Back to employee sign in
                  </Link>
                </div>
              </form>
            ) : (
              <form onSubmit={submitPin} className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-600">
                  <FingerprintIcon className="h-4 w-4 shrink-0" />
                  <span>
                    Signed in as <span className="font-semibold">{identifier}</span> — enter the PIN to unlock your session.
                  </span>
                </div>
                <div>
                  <label className="label text-center text-sm text-slate-500">6-digit PIN</label>
                  <div className="mt-2 flex justify-center gap-2" onPaste={handlePaste}>
                    {pin.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => (pinRefs.current[i] = el)}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(i, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(i, e)}
                        className="h-14 w-11 rounded-xl border-2 border-slate-200 bg-white text-center text-2xl font-bold text-slate-900 shadow-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20"
                      />
                    ))}
                  </div>
                </div>
                {error && <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</div>}
                <button className="btn-primary w-full !py-2.5" disabled={busy || pin.join('').length !== PIN_LENGTH}>
                  {busy ? 'Unlocking…' : 'Unlock portal'}
                </button>
                <div className="flex items-center justify-center gap-4 pt-1">
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-slate-600"
                    onClick={() => {
                      setStep(1);
                      setPin(Array(PIN_LENGTH).fill(''));
                      setError(null);
                    }}
                  >
                    ← Back
                  </button>
                  <Link to="/login" className="text-xs text-slate-400 hover:text-slate-600">
                    Sign out & leave
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-indigo-200/40">
          Unauthorized access attempts are monitored.
        </p>
      </div>
    </div>
  );
}

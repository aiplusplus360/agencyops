import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PageHeader, Spinner, EmptyState } from '../../components/ui';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [adjustments, setAdjustments] = useState([]);

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => setSettings(null));
    api.get('/settings/learning-adjustments').then(setAdjustments).catch(() => setAdjustments([]));
  }, []);

  async function save() {
    await api.patch('/settings', settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testEmail() {
    const r = await api.post('/settings/test-email', {});
    setTestResult(r.ok ? 'Test email sent successfully.' : r.error || 'Failed');
  }

  if (!settings) return <Spinner />;

  const set = (key, value) => setSettings((p) => ({ ...p, [key]: value }));

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="AI behavior thresholds, escalation policy, employee management and scaling rules"
        actions={<button className="btn-primary" onClick={save}>{saved ? 'Saved ✓' : 'Save changes'}</button>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-slate-900">Evaluation Rubric</h2>
          <div className="space-y-3">
            <div>
              <label className="label">Quality threshold (0-100)</label>
              <input type="number" className="input" value={settings.qualityThreshold} onChange={(e) => set('qualityThreshold', Number(e.target.value))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Intent weight</label><input type="number" step="0.05" className="input" value={settings.rubricWeights?.intent} onChange={(e) => set('rubricWeights', { ...settings.rubricWeights, intent: Number(e.target.value) })} /></div>
              <div><label className="label">Completeness</label><input type="number" step="0.05" className="input" value={settings.rubricWeights?.completeness} onChange={(e) => set('rubricWeights', { ...settings.rubricWeights, completeness: Number(e.target.value) })} /></div>
              <div><label className="label">Deadline</label><input type="number" step="0.05" className="input" value={settings.rubricWeights?.deadline} onChange={(e) => set('rubricWeights', { ...settings.rubricWeights, deadline: Number(e.target.value) })} /></div>
            </div>
            <div>
              <label className="label">Max revision attempts</label>
              <input type="number" className="input" value={settings.maxRevisionAttempts} onChange={(e) => set('maxRevisionAttempts', Number(e.target.value))} />
            </div>
          </div>

          <h2 className="mb-4 mt-6 font-semibold text-slate-900">Escalation Ladder</h2>
          <div className="space-y-3">
            <div>
              <label className="label">Reminder hours before deadline (comma separated)</label>
              <input className="input" value={settings.escalation?.remind?.join(', ')} onChange={(e) => set('escalation', { ...settings.escalation, remind: e.target.value.split(',').map(Number) })} />
            </div>
            <div>
              <label className="label">Overdue window before escalation (hours)</label>
              <input type="number" className="input" value={settings.escalation?.overdueWindowHours} onChange={(e) => set('escalation', { ...settings.escalation, overdueWindowHours: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Idle task threshold (hours before admin flag)</label>
              <input type="number" className="input" value={settings.idleStartHours} onChange={(e) => set('idleStartHours', Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-900">Adaptive Scaling</h2>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={settings.scaling?.enabled} onChange={(e) => set('scaling', { ...settings.scaling, enabled: e.target.checked })} />
              <span className="text-sm">Enabled (auto-adjust worker capacity from performance)</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div><label className="label">Up threshold</label><input type="number" className="input" value={settings.scaling?.upThreshold} onChange={(e) => set('scaling', { ...settings.scaling, upThreshold: Number(e.target.value) })} /></div>
              <div><label className="label">Down threshold</label><input type="number" className="input" value={settings.scaling?.downThreshold} onChange={(e) => set('scaling', { ...settings.scaling, downThreshold: Number(e.target.value) })} /></div>
              <div><label className="label">Min factor</label><input type="number" step="0.1" className="input" value={settings.scaling?.minFactor} onChange={(e) => set('scaling', { ...settings.scaling, minFactor: Number(e.target.value) })} /></div>
              <div><label className="label">Max factor</label><input type="number" step="0.1" className="input" value={settings.scaling?.maxFactor} onChange={(e) => set('scaling', { ...settings.scaling, maxFactor: Number(e.target.value) })} /></div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-900">Auto-Refill</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Min queue size</label><input type="number" className="input" value={settings.autoRefill?.minQueue} onChange={(e) => set('autoRefill', { ...settings.autoRefill, minQueue: Number(e.target.value) })} /></div>
              <div><label className="label">Batch size</label><input type="number" className="input" value={settings.autoRefill?.batchSize} onChange={(e) => set('autoRefill', { ...settings.autoRefill, batchSize: Number(e.target.value) })} /></div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-900">Email / Digest</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={settings.digest?.dailyEnabled} onChange={(e) => set('digest', { ...settings.digest, dailyEnabled: e.target.checked })} />
                <span className="text-sm">Daily digest</span>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={settings.digest?.weeklyEnabled} onChange={(e) => set('digest', { ...settings.digest, weeklyEnabled: e.target.checked })} />
                <span className="text-sm">Weekly digest</span>
              </div>
              <p className="text-xs text-slate-400">SMTP credentials are configured in backend/.env. The daily digest sends at 08:00.</p>
              <button className="btn-secondary" onClick={testEmail}>Send test email</button>
              {testResult && <p className="text-sm text-slate-600">{testResult}</p>}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-900">Operations Watchtower</h2>
            <p className="mb-3 text-xs text-slate-400">
              Continuously checks employee progress and posts an auto-triggered brief in your AI chat when work is
              overdue, not started, blocked, or when someone is idle. If you don't reply in-app within the escalation
              window, the same brief is emailed to you.
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.watchtower?.enabled !== false}
                  onChange={(e) => set('watchtower', { ...settings.watchtower, enabled: e.target.checked })} />
                <span className="text-sm">Enabled (auto-progress updates)</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Check every (minutes)</label>
                  <input type="number" min="1" className="input"
                    value={settings.watchtower?.scanMinutes ?? 1}
                    onChange={(e) => set('watchtower', { ...settings.watchtower, scanMinutes: Number(e.target.value) })} />
                  <p className="mt-1 text-[11px] text-slate-400">The system scans all activity this often, then decides whether to alert you.</p>
                </div>
                <div>
                  <label className="label">Minimum minutes between identical alerts</label>
                  <input type="number" min="1" className="input"
                    value={settings.watchtower?.minIntervalMinutes ?? 10}
                    onChange={(e) => set('watchtower', { ...settings.watchtower, minIntervalMinutes: Number(e.target.value) })} />
                  <p className="mt-1 text-[11px] text-slate-400">Prevents spam when nothing changes.</p>
                </div>
                <div>
                  <label className="label">Email if no reply after (hours)</label>
                  <input type="number" min="1" className="input"
                    value={settings.watchtower?.escalationHours ?? 3}
                    onChange={(e) => set('watchtower', { ...settings.watchtower, escalationHours: Number(e.target.value) })} />
                </div>
                <div className="col-span-2">
                  <label className="label">Escalation email recipient (leave blank for owner email)</label>
                  <input type="email" className="input"
                    value={settings.watchtower?.emailTo || ''}
                    onChange={(e) => set('watchtower', { ...settings.watchtower, emailTo: e.target.value })}
                    placeholder="owner@agency.com" />
                </div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-900">AI Cost Budget</h2>
            <p className="mb-2 text-xs text-slate-400">Alert when estimated AI spend crosses this monthly threshold. 0 = disabled.</p>
            <div>
              <label className="label">Monthly budget (USD)</label>
              <input type="number" step="0.01" min="0" className="input" value={settings.aiBudgetUsd ?? 0}
                onChange={(e) => set('aiBudgetUsd', Number(e.target.value))} />
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-900">AI Model</h2>
            <div>
              <label className="label">Default model</label>
              <select
                className="input"
                value={settings.modelSelection || 'auto'}
                onChange={(e) => set('modelSelection', e.target.value)}
              >
                <option value="auto">Auto — AI picks per task (recommended)</option>
                <option value="deepseek-v4-pro">DeepSeek V4 Pro (strongest reasoning)</option>
                <option value="deepseek-v4-flash">DeepSeek V4 Flash (fast &amp; cheap)</option>
              </select>
              <p className="mt-1.5 text-xs text-slate-400">
                Auto uses V4 Flash for quick passes and routes planning, onboarding and strategy to V4 Pro. You can
                override per-chat from the AI Assistant's model dropdown.
              </p>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-900">AI Web Research</h2>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={settings.webResearchEnabled !== false}
                onChange={(e) => set('webResearchEnabled', e.target.checked)}
              />
              <div>
                <span className="text-sm">Enable live web research</span>
                <p className="mt-0.5 text-xs text-slate-400">
                  Lets the AI-COO search the web (DuckDuckGo, free) and read pages when your question needs current
                  info — trends, pricing, platform changes, examples. Findings and sources show up in the chat.
                </p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 font-semibold text-slate-900">Employee Management</h2>
            <div className="space-y-3">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={settings.employeeManagement?.createEnabled !== false}
                  onChange={(e) => set('employeeManagement', { ...settings.employeeManagement, createEnabled: e.target.checked })}
                />
                <div>
                  <span className="text-sm">Allow creating employees (logins)</span>
                  <p className="mt-0.5 text-xs text-slate-400">When off, the AI and Employees page can't add new accounts or make logins.</p>
                </div>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={settings.employeeManagement?.editEnabled !== false}
                  onChange={(e) => set('employeeManagement', { ...settings.employeeManagement, editEnabled: e.target.checked })}
                />
                <div>
                  <span className="text-sm">Allow editing employees</span>
                  <p className="mt-0.5 text-xs text-slate-400">When off, employee profiles (skills, tier, capacity, account details) can't be edited anywhere.</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-6 p-5">
        <h2 className="mb-1 font-semibold text-slate-900">Learning Adjustments</h2>
        <p className="mb-4 text-sm text-slate-500">
          The AI captures every score/assignment override you make and tunes its rubric & matching from recurring patterns. Revert any adjustment you disagree with.
        </p>
        {adjustments.length === 0 && <EmptyState icon="🧠" title="No learning adjustments yet" body="Override an evaluation score or assignment and the AI will log a learning adjustment here." />}
        <div className="space-y-2">
          {adjustments.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="badge bg-brand-soft text-brand">{a.adjustmentType}</span>
                  <span className="text-sm font-medium text-slate-800">{a.description || a.entityType}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}</p>
              </div>
              <button
                className="btn-secondary shrink-0 !px-2 !py-1 text-xs"
                onClick={async () => {
                  await api.del(`/settings/learning-adjustments/${a.id}`);
                  setAdjustments((prev) => prev.filter((x) => x.id !== a.id));
                }}
              >
                Revert
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

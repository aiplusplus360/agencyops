import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { Badge } from '../../components/ui';
import { useSocket } from '../../context/SocketContext';
import VisualBlocks from './VisualBlocks';

const HORIZON_LABEL = { D15: '15-Day Runway', D30: '30-Day Milestones', D60_90: '60-90 Day Horizons' };
const HORIZON_COLOR = {
  D15: 'border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-violet-50/60',
  D30: 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-teal-50/60',
  D60_90: 'border-amber-200 bg-gradient-to-br from-amber-50/80 to-orange-50/60',
};

const SUGGESTIONS = [
  'Plan a launch campaign for Aurora Skincare — landing page, email flow, teaser reels and Meta ads',
  'Build a content calendar for GreenLeaf Organics for next month and assign it to Carol',
  'Set up Google Ads for Vertex Fitness to drive membership leads, give it to Bob',
  'Add a new product: an organic dog food brand called PupJoy, target is millennial pet parents, they sell on Shopify',
  'Hire a senior graphic designer named Fiona Lee — strong in branding and Figma',
  'What are my employees names?',
  'Who is overloaded right now?',
];

const SUGGESTION_META = [
  { icon: 'rocket', chip: 'bg-gradient-to-br from-indigo-500 to-blue-500', border: 'border-indigo-100 hover:border-indigo-300 hover:shadow-indigo-200/60' },
  { icon: 'calendar', chip: 'bg-gradient-to-br from-violet-500 to-purple-500', border: 'border-violet-100 hover:border-violet-300 hover:shadow-violet-200/60' },
  { icon: 'target', chip: 'bg-gradient-to-br from-fuchsia-500 to-pink-500', border: 'border-fuchsia-100 hover:border-fuchsia-300 hover:shadow-fuchsia-200/60' },
  { icon: 'package', chip: 'bg-gradient-to-br from-amber-500 to-orange-500', border: 'border-amber-100 hover:border-amber-300 hover:shadow-amber-200/60' },
  { icon: 'users', chip: 'bg-gradient-to-br from-emerald-500 to-teal-500', border: 'border-emerald-100 hover:border-emerald-300 hover:shadow-emerald-200/60' },
  { icon: 'users', chip: 'bg-gradient-to-br from-sky-500 to-cyan-500', border: 'border-sky-100 hover:border-sky-300 hover:shadow-sky-200/60' },
  { icon: 'chart', chip: 'bg-gradient-to-br from-rose-500 to-red-500', border: 'border-rose-100 hover:border-rose-300 hover:shadow-rose-200/60' },
];

const CLIENT_FIELDS = [
  { key: 'name', label: 'Client name', textarea: false },
  { key: 'description', label: 'Description', textarea: true },
  { key: 'targetUsers', label: 'Target audience', textarea: false },
  { key: 'techStack', label: 'Platforms & channels', textarea: false },
  { key: 'goals', label: 'Campaign goals', textarea: true },
];

const TIERS = ['JUNIOR', 'MID', 'SENIOR', 'LEAD'];

const REC_TYPE_STYLE = {
  warning: { icon: 'alert', chip: 'bg-amber-100 text-amber-600', row: 'border-amber-200/70 bg-gradient-to-br from-amber-50/80 to-orange-50/60' },
  danger: { icon: 'alert', chip: 'bg-rose-100 text-rose-600', row: 'border-rose-200/70 bg-gradient-to-br from-rose-50/80 to-red-50/60' },
  assign: { icon: 'user', chip: 'bg-indigo-100 text-indigo-600', row: 'border-indigo-200/70 bg-gradient-to-br from-indigo-50/80 to-violet-50/60' },
  info: { icon: 'info', chip: 'bg-sky-100 text-sky-600', row: 'border-sky-200/70 bg-gradient-to-br from-sky-50/80 to-cyan-50/60' },
};

function Recommendations({ recs }) {
  if (!recs?.length) return null;
  const iconFor = { alert: Icon.Alert, user: Icon.User, info: Icon.Info };
  return (
    <div className="mt-3 space-y-1.5">
      {recs.map((r, i) => {
        const s = REC_TYPE_STYLE[r.type] || REC_TYPE_STYLE.info;
        const RecIcon = iconFor[s.icon] || Icon.Info;
        return (
          <div key={`${r.title}-${i}`} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${s.row}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${s.chip}`}>
              <RecIcon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-800">{r.title}</p>
              {r.detail && <p className="text-xs text-slate-500">{r.detail}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskRow({ task }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white/80 px-3 py-2.5 transition-colors hover:border-violet-200">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-800">{task.title}</p>
        {task.assignee ? (
          <Badge className="shrink-0 bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-200">→ {task.assignee}</Badge>
        ) : (
          <Badge className="shrink-0 bg-slate-100 text-slate-500">Open pool</Badge>
        )}
      </div>
      {task.description && <p className="mt-0.5 text-xs text-slate-500">{task.description}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {task.effortHours && <span className="rounded-lg bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-500">{task.effortHours}h</span>}
        {(task.skillTags || []).map((s) => (
          <span key={s} className="rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-100">{s}</span>
        ))}
      </div>
    </div>
  );
}

const DOT_COLORS = ['bg-indigo-500', 'bg-violet-500', 'bg-fuchsia-500'];

/* ---------- Beautiful inline SVG icons (dependency-free, Lucide-style) ---------- */
const iconProps = {
  className: 'h-4 w-4',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
};

const Icon = {
  Plus: (p) => (
    <svg {...iconProps} {...p}><path d="M12 5v14M5 12h14" /></svg>
  ),
  Chat: (p) => (
    <svg {...iconProps} {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
  ),
  Send: (p) => (
    <svg {...iconProps} {...p}><path d="m22 2-7 20-4-9-9-4 20-7z" /><path d="M22 2 11 13" /></svg>
  ),
  Stop: (p) => (
    <svg {...iconProps} {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
  ),
  Trash: (p) => (
    <svg {...iconProps} {...p}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
  ),
  Pencil: (p) => (
    <svg {...iconProps} {...p}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
  ),
  Sparkle: (p) => (
    <svg {...iconProps} {...p}><path d="M12 3l1.9 5.8L19.7 10.7l-5.8 1.9L12 18.4l-1.9-5.8-5.8-1.9 5.8-1.9L12 3z" /></svg>
  ),
  Bolt: (p) => (
    <svg {...iconProps} {...p}><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></svg>
  ),
  X: (p) => (
    <svg {...iconProps} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>
  ),
  ChevronDown: (p) => (
    <svg {...iconProps} {...p}><path d="m6 9 6 6 6-6" /></svg>
  ),
  Rocket: (p) => (
    <svg {...iconProps} {...p}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
  ),
  Calendar: (p) => (
    <svg {...iconProps} {...p}><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>
  ),
  Target: (p) => (
    <svg {...iconProps} {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
  ),
  Users: (p) => (
    <svg {...iconProps} {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  Package: (p) => (
    <svg {...iconProps} {...p}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
  ),
  Alert: (p) => (
    <svg {...iconProps} {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
  ),
  Info: (p) => (
    <svg {...iconProps} {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
  ),
  User: (p) => (
    <svg {...iconProps} {...p}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
  ),
  Mail: (p) => (
    <svg {...iconProps} {...p}><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
  ),
  Clipboard: (p) => (
    <svg {...iconProps} {...p}><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></svg>
  ),
  FileText: (p) => (
    <svg {...iconProps} {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></svg>
  ),
  Globe: (p) => (
    <svg {...iconProps} {...p}><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>
  ),
  Wand: (p) => (
    <svg {...iconProps} {...p}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z" /><path d="m14 7 3 3" /><path d="M5 6v4" /><path d="M19 14v4" /><path d="M10 2v2" /><path d="M7 8H3" /><path d="M21 16h-4" /><path d="M11 3H9" /></svg>
  ),
  Check: (p) => (
    <svg {...iconProps} {...p}><path d="M20 6 9 17l-5-5" /></svg>
  ),
  Sparkles: (p) => (
    <svg {...iconProps} {...p}><path d="M9.9 2.3 11.5 7l4.7 1.6-4.7 1.6-1.6 4.7-1.6-4.7L4 8.6 8.7 7z" /><path d="M19 13l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" /></svg>
  ),
  Chart: (p) => (
    <svg {...iconProps} {...p}><path d="M4 20V10M10 20V4M16 20v-9M22 20H2" /></svg>
  ),
  MapPin: (p) => (
    <svg {...iconProps} {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
  ),
};

/** Vibrant "AI is thinking" indicator — bouncing gradient dots + sparkle. */
function ThinkingBubble() {
  return (
    <div className="inline-flex items-center gap-3 rounded-2xl border border-indigo-100 bg-white/95 px-4 py-3.5 shadow-lg shadow-indigo-100/60 backdrop-blur">
      <div className="flex h-9 w-9 shrink-0 animate-float items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-300/50">
        <Icon.Sparkle className="h-5 w-5" />
      </div>
      <div className="flex items-center gap-1.5">
        {DOT_COLORS.map((color, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 animate-bounce rounded-full ${color}`}
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
      <span className="text-sm font-medium text-slate-500">Thinking…</span>
    </div>
  );
}

/** Compact pill dropdown used for product/model pickers. */
function PillSelect({ value, onChange, title, className = '', children }) {
  return (
    <div className={`relative ${className}`}>
      <select
        className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-indigo-100 bg-white pl-3 pr-8 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-violet-200 hover:text-slate-800 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-200 sm:w-auto"
        value={value}
        onChange={onChange}
        title={title}
      >
        {children}
      </select>
      <Icon.ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

/** Best-effort city → lat/lng lookup (OpenStreetMap Nominatim). Returns null when offline or unknown. */
async function geocodeLocation(location) {
  const q = String(location || '').trim();
  if (!q) return null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
      headers: { Accept: 'application/json' },
    });
    const data = await res.json();
    if (Array.isArray(data) && data[0]) {
      const lat = Number(data[0].lat);
      const lng = Number(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  } catch {}
  return null;
}

export default function AiChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState([]);
  const [productIds, setProductIds] = useState([]);
  const [selectedSuggested, setSelectedSuggested] = useState(new Set());
  const [draftMsgId, setDraftMsgId] = useState(null);
  const [clientDraft, setClientDraft] = useState(null);
  const [savingClient, setSavingClient] = useState(false);
  const [clientMsg, setClientMsg] = useState(null);
  const [employeeDraft, setEmployeeDraft] = useState(null);
  const [employeeDrafts, setEmployeeDrafts] = useState(null);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [employeeMsg, setEmployeeMsg] = useState(null);
  const [taskChanges, setTaskChanges] = useState(null);
  const [savingTaskChanges, setSavingTaskChanges] = useState(false);
  const [taskChangeMsg, setTaskChangeMsg] = useState(null);
  const [productChanges, setProductChanges] = useState(null);
  const [savingProductChanges, setSavingProductChanges] = useState(false);
  const [productChangeMsg, setProductChangeMsg] = useState(null);
  const [emailDraft, setEmailDraft] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);
  const [skills, setSkills] = useState([]);
  const [approving, setApproving] = useState(false);
  const [approval, setApproval] = useState(null);
  const [error, setError] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [currentConvId, setCurrentConvId] = useState(null);
  const [convOpen, setConvOpen] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [thinkingOpen, setThinkingOpen] = useState({});
  const [modelSel, setModelSel] = useState('auto');
  const [empPolicy, setEmpPolicy] = useState({ createEnabled: true, editEnabled: true });
  const { on } = useSocket();
  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const abortRef = useRef(null);

  // Remember which conversation is active so a page refresh resumes the
  // same thread instead of silently starting a new one.
  useEffect(() => {
    if (currentConvId) localStorage.setItem('ao_current_conv', currentConvId);
  }, [currentConvId]);

  async function refreshConversations() {
    const list = await api.get('/conversations').catch(() => []);
    setConversations(list || []);
    return list || [];
  }

  useEffect(() => {
    api.get('/products').then((d) => setProducts(d || [])).catch(() => {});
    api.get('/skills').then((d) => setSkills(d || [])).catch(() => {});
    api
      .get('/settings')
      .then((s) => setEmpPolicy({ createEnabled: s?.employeeManagement?.createEnabled !== false, editEnabled: s?.employeeManagement?.editEnabled !== false }))
      .catch(() => {});
    // Resume the most recent conversation so a single thread follows
    // everything — a new one is only created when the owner clicks New chat.
    refreshConversations().then((list) => {
      if (list?.length) {
        const saved = localStorage.getItem('ao_current_conv');
        const target = list.find((c) => c.id === saved) || list[0];
        if (target) loadConversation(target.id);
      }
    });
  }, []);

  // Scroll the conversation to the bottom whenever the content changes
  // (sent message, reply, loading state, error, drafts). Instant scroll is
  // used instead of smooth so it can never be interrupted mid-animation.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: 'end' });
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, busy, approval, error, clientDraft, employeeDraft, employeeDrafts, taskChanges, productChanges, emailDraft]);

  // Live Operations Watchtower: when a new auto-alert lands, refresh the
  // conversations list and, if we're already on the watchtower thread (or on
  // the empty home state), load it so the brief appears without a refresh.
  const latest = useRef({ currentConvId, loadConversation });
  latest.current = { currentConvId, loadConversation };
  useEffect(() => {
    return on('watchtower', (payload) => {
      refreshConversations();
      const { currentConvId: convId, loadConversation: load } = latest.current;
      if (!payload?.conversationId) return;
      if (!convId || convId === payload.conversationId) load(payload.conversationId);
    });
  }, [on]);

  async function send(text) {
    const content = (text || input).trim();
    if (!content || busy) return;
    setInput('');
    setError(null);

    const userMsg = { id: Date.now(), role: 'user', content };
    setMessages((m) => [...m, userMsg]);

    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const history = [...messages, userMsg];
      const res = await api.post(
        '/ai-chat',
        {
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          productIds,
          conversationId: currentConvId || undefined,
          model: modelSel === 'auto' ? undefined : modelSel,
        },
        { timeoutMs: 180000, signal: controller.signal }
      );
      if (res.conversationId) setCurrentConvId(res.conversationId);
      const msgId = Date.now() + 1;
      setMessages((m) => [
        ...m,
        {
          id: msgId,
          role: 'assistant',
          content: res.reply,
          draft: res.draft || null,
          visuals: res.visuals || null,
          recommendations: res.recommendations || [],
          thinking: res.thinking || null,
          review: res.review || null,
          research: res.research || null,
          webResearch: res.webResearch || null,
          modelUsed: res.modelUsed || null,
          modelLabel: res.modelLabel || null,
        },
      ]);
      if (res.draft) setDraftMsgId(msgId);
      if (res.draft) setSelectedSuggested(new Set((res.draft.suggestedTasks || []).map((t) => t.title)));
      if (res.clientDraft) {
        setClientDraft((prev) => ({
          name: res.clientDraft.name || prev?.name || '',
          description: res.clientDraft.description || prev?.description || '',
          targetUsers: res.clientDraft.targetUsers || prev?.targetUsers || '',
          techStack: res.clientDraft.techStack || prev?.techStack || '',
          goals: res.clientDraft.goals || prev?.goals || '',
        }));
        setClientMsg(null);
      } else if (res.clientDraft === null) {
        const mentionsClient = history.some(
          (m) => m.role === 'user' && /client|brand|onboard|portfolio/i.test(m.content)
        );
        if (!mentionsClient) setClientDraft(null);
      }
      if (res.employeeDraft) {
        setEmployeeDraft((prev) => ({
          name: res.employeeDraft.name || prev?.name || '',
          email: res.employeeDraft.email || prev?.email || '',
          seniorityTier: res.employeeDraft.seniorityTier || prev?.seniorityTier || 'MID',
          baseCapacity: res.employeeDraft.baseCapacity || prev?.baseCapacity || 3,
          strengthsNotes: res.employeeDraft.strengthsNotes || prev?.strengthsNotes || '',
          skills: res.employeeDraft.skills || prev?.skills || [],
          location: res.employeeDraft.location || prev?.location || '',
          lat: res.employeeDraft.lat || prev?.lat || null,
          lng: res.employeeDraft.lng || prev?.lng || null,
        }));
        setEmployeeMsg(null);
        setEmployeeDrafts(null);
      } else if (res.employeeDrafts?.length) {
        setEmployeeDrafts(res.employeeDrafts.map((e) => ({
          name: e.name || '',
          email: e.email || '',
          seniorityTier: e.seniorityTier || 'MID',
          baseCapacity: e.baseCapacity || 3,
          strengthsNotes: e.strengthsNotes || '',
          skills: e.skills || [],
          location: e.location || '',
          lat: e.lat || null,
          lng: e.lng || null,
        })));
        setEmployeeDraft(null);
        setEmployeeMsg(null);
      } else if (res.employeeDraft === null && !res.employeeDrafts) {
        const mentionsEmployee = history.some(
          (m) => m.role === 'user' && /hire|employee|team member|onboard|designer|copywriter|login/i.test(m.content)
        );
        if (!mentionsEmployee) setEmployeeDraft(null);
      }
      if (res.taskChanges?.length) {
        setTaskChanges(res.taskChanges);
        setTaskChangeMsg(null);
      } else if (res.taskChanges === null) {
        setTaskChanges(null);
        setTaskChangeMsg(null);
      }
      if (res.productChanges?.length) {
        setProductChanges(res.productChanges);
        setProductChangeMsg(null);
      } else if (res.productChanges === null) {
        setProductChanges(null);
        setProductChangeMsg(null);
      }
      if (res.emailDraft) {
        setEmailDraft((prev) => ({
          to: res.emailDraft.to || prev?.to || '',
          subject: res.emailDraft.subject || prev?.subject || '',
          body: res.emailDraft.body || prev?.body || '',
        }));
        setEmailMsg(null);
      } else if (res.emailDraft === null) {
        setEmailDraft(null);
        setEmailMsg(null);
      }
      refreshConversations();
    } catch (e) {
      if (e?.name === 'AbortError' || controller.signal.aborted) {
        // User pressed Stop — treat this as a graceful cancellation.
        setMessages((m) => [...m, {
          id: Date.now() + 1,
          role: 'assistant',
          content: 'Stopped — I’ll hold here. Ask me anything when you’re ready.',
        }]);
        setError(null);
      } else {
        const msg =
          e?.name === 'TimeoutError' || /timed out|aborted/i.test(e?.message || '')
            ? 'The AI-COO took too long to respond this time — please try again. If this keeps happening, let me know and I\'ll check the backend.'
            : e.message || 'Something went wrong';
        setError(msg);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function toggleSuggested(title) {
    setSelectedSuggested((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  async function approve(draft) {
    setApproving(true);
    setError(null);
    try {
      const rawText = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n\n') || 'Campaign plan';
      const { vision } = await api.post('/visions', { rawText, productIds, ai: draft });
      const res = await api.post(`/visions/${vision.id}/approve`, {
        roadmap: draft.roadmap,
        suggestedTasks: (draft.suggestedTasks || []).filter((t) => selectedSuggested.has(t.title)),
      });
      setApproval({ vision, assignments: res.assignments || [], unassignedCount: res.unassignedCount || 0, totalTasks: res.totalTasks || 0 });
    } catch (e) {
      setError(e.message || 'Failed to approve the plan');
    } finally {
      setApproving(false);
    }
  }

  async function startNew() {
    setMessages([]);
    setApproval(null);
    setError(null);
    setDraftMsgId(null);
    setClientDraft(null);
    setClientMsg(null);
    setEmployeeDraft(null);
    setEmployeeDrafts(null);
    setEmployeeMsg(null);
    setTaskChanges(null);
    setTaskChangeMsg(null);
    setProductChanges(null);
    setProductChangeMsg(null);
    setEmailDraft(null);
    setEmailMsg(null);
    setSelectedSuggested(new Set());
    setThinkingOpen({});
    const conv = await api.post('/conversations', {}).catch(() => null);
    if (conv?.id) {
      setCurrentConvId(conv.id);
      refreshConversations();
    }
  }

  async function loadConversation(id) {
    const { messages: msgs } = await api.get(`/conversations/${id}/messages`).catch(() => ({ messages: [] }));
    setCurrentConvId(id);
    setConversations((p) =>
      p.map((c) => (c.id === id ? { ...c, messageCount: msgs.length, preview: msgs[0]?.content?.slice(0, 80) || '' } : c))
    );
    setMessages(
      msgs.map((m, i) => ({
        id: m.id || i,
        role: m.role,
        content: m.content,
        draft: m.draft || null,
        visuals: m.meta?.visuals || null,
        recommendations: m.meta?.recommendations || [],
        thinking: m.meta?.thinking || null,
        review: m.meta?.review || null,
        research: null,
        webResearch: m.meta?.webResearch || null,
        modelUsed: m.meta?.modelUsed || null,
        modelLabel: m.meta?.modelLabel || null,
        watchtower: m.meta?.watchtower || null,
      }))
    );
    setApproval(null);
    setClientDraft(null);
    setEmployeeDraft(null);
    setEmployeeDrafts(null);
    setTaskChanges(null);
    setTaskChangeMsg(null);
    setProductChanges(null);
    setProductChangeMsg(null);
    setEmailDraft(null);
    setEmailMsg(null);
    setDraftMsgId(null);
    setThinkingOpen({});
    const withDraft = msgs.filter((m) => m.draft);
    if (withDraft.length) {
      const last = withDraft[withDraft.length - 1];
      const msgId = last.id || msgs.indexOf(last);
      setTimeout(() => {
        setDraftMsgId(msgId);
        setSelectedSuggested(new Set((last.draft.suggestedTasks || []).map((t) => t.title)));
      }, 0);
    }
    const withTaskChanges = msgs.filter((m) => m.meta?.taskChanges?.length);
    if (withTaskChanges.length) {
      const last = withTaskChanges[withTaskChanges.length - 1];
      setTaskChanges(last.meta.taskChanges);
    }
    const withProductChanges = msgs.filter((m) => m.meta?.productChanges?.length);
    if (withProductChanges.length) {
      const last = withProductChanges[withProductChanges.length - 1];
      setProductChanges(last.meta.productChanges);
    }
    setConvOpen(false);
  }

  async function deleteConversation(id) {
    await api.del(`/conversations/${id}`).catch(() => {});
    const list = await refreshConversations();
    if (currentConvId === id) {
      setCurrentConvId(null);
      setMessages([]);
      setDraftMsgId(null);
      setApproval(null);
      setTaskChanges(null);
      setTaskChangeMsg(null);
      setProductChanges(null);
      setProductChangeMsg(null);
    } else if (!list.length) {
      setCurrentConvId(null);
    }
  }

  async function renameConversation(id, title) {
    const t = String(title || '').trim();
    if (!t) return;
    await api.patch(`/conversations/${id}`, { title: t }).catch(() => {});
    setRenaming(null);
    refreshConversations();
  }

  function discardDraft() {
    setMessages((m) => m.filter((x) => x.id !== draftMsgId));
    setDraftMsgId(null);
    setSelectedSuggested(new Set());
  }

  function updateClientField(key, value) {
    setClientDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function addClient() {
    if (!clientDraft?.name?.trim()) {
      setClientMsg({ type: 'error', text: 'Client name is required before adding to the portfolio.' });
      return;
    }
    setSavingClient(true);
    setError(null);
    try {
      await api.post('/products', clientDraft);
      const list = await api.get('/products').catch(() => []);
      setProducts(list || []);
      setClientMsg({ type: 'ok', text: `"${clientDraft.name}" added to your products. You can now link it for campaign planning.` });
      setClientDraft(null);
    } catch (e) {
      setClientMsg({ type: 'error', text: e.message || 'Failed to add the client.' });
    } finally {
      setSavingClient(false);
    }
  }

  function updateEmployeeField(key, value) {
    setEmployeeDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleEmployeeSkill(skillName) {
    setEmployeeDraft((prev) => {
      const has = prev.skills.includes(skillName);
      return { ...prev, skills: has ? prev.skills.filter((s) => s !== skillName) : [...prev.skills, skillName] };
    });
  }

  async function addEmployee() {
    if (!employeeDraft?.name?.trim()) {
      setEmployeeMsg({ type: 'error', text: 'Employee name is required before adding to the team.' });
      return;
    }
    if (!employeeDraft?.email?.trim()) {
      setEmployeeMsg({ type: 'error', text: 'Email is required — it\'s their login.' });
      return;
    }
    setSavingEmployee(true);
    setError(null);
    try {
      const payload = { ...employeeDraft };
      if (payload.location && (!payload.lat || !payload.lng)) {
        const geo = await geocodeLocation(payload.location);
        if (geo) { payload.lat = geo.lat; payload.lng = geo.lng; }
      }
      const res = await api.post('/users', payload);
      setEmployeeMsg({
        type: 'ok',
        text: `"${res.name}" was added to the team (${res.email}). Their login password is: ${res.password} — share it with them.`,
      });
      setEmployeeDraft(null);
    } catch (e) {
      setEmployeeMsg({ type: 'error', text: e.message || 'Failed to add the employee.' });
    } finally {
      setSavingEmployee(false);
    }
  }

  async function addEmployeesBulk() {
    const bad = employeeDrafts?.find((d) => !d.name?.trim() || !d.email?.trim());
    if (bad) {
      setEmployeeMsg({ type: 'error', text: `Every profile needs a name and an email. "${bad.name || 'Unnamed'}" is missing one.` });
      return;
    }
    setSavingEmployee(true);
    setError(null);
    setEmployeeMsg(null);
    try {
      const employees = [];
      for (const d of employeeDrafts) {
        const emp = { ...d };
        if (emp.location && (!emp.lat || !emp.lng)) {
          const geo = await geocodeLocation(emp.location);
          if (geo) { emp.lat = geo.lat; emp.lng = geo.lng; }
        }
        employees.push(emp);
      }
      const res = await api.post('/users/bulk', { employees });
      const ok = res.created || [];
      const errs = res.errors || [];
      if (ok.length) {
        const lines = ok.map((u) => `• ${u.name} — ${u.email} / password: ${u.password}`);
        setEmployeeMsg({
          type: 'ok',
          text: `${ok.length} login${ok.length > 1 ? 's' : ''} created:\n${lines.join('\n')}`,
        });
        setEmployeeDrafts(null);
      }
      if (errs.length) {
        setEmployeeMsg({
          type: 'error',
          text: `Skipped: ${errs.map((e) => `${e.name} (${e.error})`).join('; ')}`,
        });
      }
      if (!ok.length && !errs.length) setEmployeeMsg({ type: 'error', text: 'Nothing was created — the server returned an empty response.' });
    } catch (e) {
      setEmployeeMsg({ type: 'error', text: e.message || 'Failed to create the logins.' });
    } finally {
      setSavingEmployee(false);
    }
  }

  function updateBulkEmployeeField(index, field, value) {
    setEmployeeDrafts((prev) => (prev || []).map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  }

  function describeTaskChange(c) {
    if (c.action === 'reschedule') return `Move deadline to ${c.newDeadline || '?'}`;
    if (c.action === 'reassign') return `Reassign to ${c.newAssignee || '?'}`;
    if (c.action === 'edit') {
      const bits = [];
      if (c.fields?.title) bits.push(`title → "${c.fields.title}"`);
      if (c.fields?.description) bits.push('description');
      if (c.fields?.priority) bits.push(`priority → ${c.fields.priority}`);
      if (c.fields?.effortHours) bits.push(`effort → ${c.fields.effortHours}h`);
      if (c.fields?.skillTags?.length) bits.push(`skills → ${c.fields.skillTags.join(', ')}`);
      return bits.length ? bits.join(' · ') : 'Update details';
    }
    return 'Change';
  }

  function describeProductChange(c) {
    if (c.action === 'delete') return 'Remove from portfolio';
    if (c.action === 'edit') {
      const bits = [];
      const f = c.fields || {};
      if (f.name) bits.push(`name → "${f.name}"`);
      if (f.description !== undefined && f.description !== null) bits.push('description');
      if (f.targetUsers) bits.push(`audience → "${f.targetUsers}"`);
      if (f.techStack) bits.push(`platforms → "${f.techStack}"`);
      if (f.goals) bits.push(`goals → "${f.goals}"`);
      if (f.active !== undefined) bits.push(f.active ? 'reactivate' : 'archive/deactivate');
      return bits.length ? bits.join(' · ') : 'Update details';
    }
    return 'Change';
  }

  async function applyTaskChanges() {
    if (!taskChanges?.length) return;
    setSavingTaskChanges(true);
    setError(null);
    setTaskChangeMsg(null);
    try {
      const res = await api.post('/tasks/apply-changes', { changes: taskChanges });
      const ok = res.applied || [];
      const errs = res.errors || [];
      if (ok.length) {
        const lines = ok.map((r) => {
          if (r.action === 'reschedule') return `• "${r.title}" → deadline ${r.newDeadline}`;
          if (r.action === 'reassign') return `• "${r.title}" → now with ${r.workerName}`;
          return `• "${r.title}" → details updated`;
        });
        setTaskChangeMsg({
          type: 'ok',
          text: `${ok.length} change${ok.length > 1 ? 's' : ''} applied:\n${lines.join('\n')}`,
        });
        setTaskChanges(null);
      }
      if (errs.length) {
        setTaskChangeMsg({
          type: 'error',
          text: `Skipped: ${errs.map((e) => `${e.taskMatch || e.action} (${e.error})`).join('; ')}`,
        });
      }
      if (!ok.length && !errs.length) setTaskChangeMsg({ type: 'error', text: 'Nothing was applied.' });
    } catch (e) {
      setTaskChangeMsg({ type: 'error', text: e.message || 'Failed to apply the changes.' });
    } finally {
      setSavingTaskChanges(false);
    }
  }

  async function applyProductChanges() {
    if (!productChanges?.length) return;
    setSavingProductChanges(true);
    setError(null);
    setProductChangeMsg(null);
    try {
      const res = await api.post('/products/apply-changes', { changes: productChanges });
      const ok = res.applied || [];
      const errs = res.errors || [];
      if (ok.length) {
        const lines = ok.map((r) => {
          if (r.action === 'delete') return `• "${r.name}" → removed from portfolio`;
          if (r.fields?.name && r.fields.name !== r.name) return `• "${r.name}" → renamed to "${r.fields.name}"`;
          return `• "${r.name}" → details updated`;
        });
        setProductChangeMsg({
          type: 'ok',
          text: `${ok.length} change${ok.length > 1 ? 's' : ''} applied:\n${lines.join('\n')}`,
        });
        setProductChanges(null);
      }
      if (errs.length) {
        setProductChangeMsg({
          type: 'error',
          text: `Skipped: ${errs.map((e) => `${e.productMatch || e.action} (${e.error})`).join('; ')}`,
        });
      }
      if (!ok.length && !errs.length) setProductChangeMsg({ type: 'error', text: 'Nothing was applied.' });
    } catch (e) {
      setProductChangeMsg({ type: 'error', text: e.message || 'Failed to apply the changes.' });
    } finally {
      setSavingProductChanges(false);
    }
  }

  async function sendEmailDraft() {
    if (!emailDraft) return;
    setSendingEmail(true);
    setError(null);
    setEmailMsg(null);
    try {
      const res = await api.post('/emails/send', emailDraft);
      setEmailMsg({
        type: 'ok',
        text: res.skipped
          ? 'Email saved to the log — SMTP is not configured yet, so it was not actually delivered.'
          : `Sent to ${emailDraft.to} ✓`,
      });
      setEmailDraft(null);
    } catch (e) {
      setEmailMsg({ type: 'error', text: e.message || 'Failed to send the email.' });
    } finally {
      setSendingEmail(false);
    }
  }

  function toggleBulkEmployeeSkill(index, skillName) {
    setEmployeeDrafts((prev) =>
      (prev || []).map((d, i) => {
        if (i !== index) return d;
        const has = (d.skills || []).includes(skillName);
        return { ...d, skills: has ? d.skills.filter((s) => s !== skillName) : [...(d.skills || []), skillName] };
      })
    );
  }

  const latestDraft = messages.find((m) => m.id === draftMsgId)?.draft || null;

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col supports-[height:100dvh]:h-[calc(100dvh-5rem)] md:h-[calc(100vh-6.5rem)] md:supports-[height:100dvh]:h-[calc(100dvh-6.5rem)]">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Icon-only actions */}
        <div className="flex items-center gap-2">
          {/* Conversations */}
          <div className="relative">
            <button
              className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-100 bg-white text-indigo-500 shadow-md shadow-indigo-100/60 transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:text-violet-600 hover:shadow-lg hover:shadow-violet-200/60"
              onClick={() => setConvOpen((o) => !o)}
              title="Past conversations"
            >
              <Icon.Chat className="h-5 w-5" />
              {conversations.length > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 px-1 text-[10px] font-bold text-white shadow">
                  {conversations.length}
                </span>
              )}
            </button>
            {convOpen && (
              <div className="absolute left-0 top-14 z-40 w-72 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-3xl border border-indigo-100/80 bg-white/95 p-3 shadow-2xl shadow-indigo-200/60 backdrop-blur animate-pop">
                <div className="mb-2 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Conversations</p>
                    {conversations.length > 0 && (
                      <span className="rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-2 py-0.5 text-[10px] font-bold text-white">
                        {conversations.length}
                      </span>
                    )}
                  </div>
                  <button
                    className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
                    onClick={() => setConvOpen(false)}
                    title="Close"
                  >
                    <Icon.X className="h-4 w-4" />
                  </button>
                </div>
                {conversations.length === 0 && (
                  <p className="px-1 py-3 text-center text-sm text-slate-400">No past conversations yet.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {conversations.map((c) =>
                    renaming === c.id ? (
                      <input
                        className="input w-full text-xs"
                        defaultValue={c.title}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameConversation(c.id, e.target.value);
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        onBlur={(e) => renameConversation(c.id, e.target.value)}
                      />
                    ) : (
                      <div key={c.id} className="group relative">
                        <button
                          className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-all ${
                            currentConvId === c.id
                              ? 'border-transparent bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-300/50'
                              : 'border-indigo-100 bg-white text-indigo-400 shadow-sm hover:-translate-y-0.5 hover:border-violet-200 hover:text-violet-600 hover:shadow-md'
                          }`}
                          title={c.title || 'Untitled conversation'}
                          onClick={() => loadConversation(c.id)}
                        >
                          {c.title?.includes('Watchtower') ? (
                            <Icon.Bolt className="h-5 w-5" />
                          ) : (
                            <Icon.Chat className="h-5 w-5" />
                          )}
                        </button>
                        <div className="pointer-events-none absolute -bottom-1 left-1/2 z-10 hidden max-w-40 -translate-x-1/2 translate-y-full truncate rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">
                          {c.title || 'Untitled'}
                        </div>
                        <div className="absolute -right-1.5 -top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-400 shadow ring-1 ring-slate-200 transition-colors hover:text-violet-600"
                            title="Rename"
                            onClick={(e) => { e.stopPropagation(); setRenaming(c.id); }}
                          >
                            <Icon.Pencil className="h-3 w-3" />
                          </button>
                          <button
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-400 shadow ring-1 ring-slate-200 transition-colors hover:text-rose-600"
                            title="Delete"
                            onClick={(e) => { e.stopPropagation(); if (confirm('Delete this conversation?')) deleteConversation(c.id); }}
                          >
                            <Icon.Trash className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
          {/* New chat */}
          <button
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-300/50 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-400/50 active:scale-95"
            onClick={startNew}
            title="New chat"
          >
            <Icon.Plus className="h-5 w-5" />
          </button>
        </div>

        {/* Vibrant title chip */}
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-4 py-2.5 text-white shadow-lg shadow-violet-200/70 sm:flex-none">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Icon.Sparkle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold leading-tight">AI-COO Assistant</h1>
            <p className="truncate text-[11px] leading-tight text-white/80">Plan, hire, email — just ask</p>
          </div>
        </div>

        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {products.length > 0 && (
            <PillSelect
              className="w-full flex-1 sm:w-auto sm:flex-none"
              value={productIds[0] || ''}
              onChange={(e) => setProductIds(e.target.value ? [e.target.value] : [])}
              title="Link a product to focus the AI on that client"
            >
              <option value="">No product linked (general)</option>
              {products.map((p) => <option key={p.id} value={p.id}>Link product: {p.name}</option>)}
            </PillSelect>
          )}
          <PillSelect
            className="w-full flex-1 sm:w-auto sm:flex-none"
            value={modelSel}
            onChange={(e) => setModelSel(e.target.value)}
            title="AI model — Auto lets the AI-COO pick the best model for each question"
          >
            <option value="auto">Model: Auto</option>
            <option value="deepseek-v4-pro">Model: V4 Pro</option>
            <option value="deepseek-v4-flash">Model: V4 Flash</option>
          </PillSelect>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto rounded-3xl border border-indigo-100/70 bg-gradient-to-br from-indigo-50/90 via-white to-fuchsia-50/80 p-3 shadow-inner sm:p-4">
        {/* Ambient blobs */}
        <div className="pointer-events-none absolute -left-10 top-10 h-40 w-40 rounded-full bg-violet-200/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 top-1/3 h-44 w-44 rounded-full bg-fuchsia-200/30 blur-3xl" />

        {messages.length === 0 && !busy && (
          <div className="relative flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 animate-float items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-xl shadow-violet-300/60">
              <Icon.Sparkle className="h-8 w-8" />
            </div>
            <h2 className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-2xl font-extrabold text-transparent">
              What do we need to get done?
            </h2>
            <p className="mt-1.5 max-w-md text-sm text-slate-500">
              Describe a campaign, launch or product request in plain words. I'll break it into tasks, suggest the extras,
              and assign the right people when you say who. New product or new employee? Tell me about them and I'll add them.
            </p>
            <div className="mt-6 grid w-full max-w-xl gap-2">
              {SUGGESTIONS.map((s, i) => {
                const meta = SUGGESTION_META[i % SUGGESTION_META.length];
                const SIcon = Icon[meta.icon];
                return (
                  <button
                    key={s}
                    className={`group flex items-center gap-3 rounded-2xl border bg-white/90 px-4 py-2.5 text-left text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${meta.border}`}
                    onClick={() => send(s)}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${meta.chip}`}>
                      {SIcon && <SIcon className="h-4 w-4" />}
                    </span>
                    <span className="text-slate-600 transition-colors group-hover:text-slate-800">{s}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`relative flex items-end gap-2.5 animate-fade-up ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-300/50">
                <Icon.Sparkle className="h-4 w-4" />
              </div>
            )}
              <div
                className={`max-w-[92%] rounded-3xl px-4 py-3 text-sm shadow-lg sm:max-w-[85%] ${
                  m.role === 'user'
                    ? 'rounded-br-lg bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-violet-300/40'
                    : 'rounded-bl-lg border border-indigo-100/80 bg-white/95 text-slate-800 shadow-indigo-100/50 backdrop-blur'
                }`}
              >
                {m.role === 'assistant' && m.watchtower && (
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                      <Icon.Bolt className="h-3 w-3" /> Auto update
                    </span>
                    {m.watchtower.sentAt && (
                      <span className="text-[10px] font-medium text-slate-400">
                        {new Date(m.watchtower.sentAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === 'assistant' && m.visuals?.length > 0 && <VisualBlocks visuals={m.visuals} />}
              {m.role === 'assistant' && (m.thinking?.evidence?.length || m.thinking?.gaps?.length || m.thinking?.risks?.length || m.thinking?.plan || m.webResearch?.queries?.length || m.webResearch?.sources?.length) && (
                <div className="mt-3 border-t border-violet-100/70 pt-2">
                  <button
                    className="flex w-full items-center justify-between rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50 to-fuchsia-50/60 px-3 py-2 text-left transition-colors hover:from-violet-100/70 hover:to-fuchsia-100/60"
                    onClick={() => setThinkingOpen((p) => ({ ...p, [m.id]: !p[m.id] }))}
                  >
                    <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-violet-600">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-sm">
                        <Icon.Wand className="h-3.5 w-3.5" />
                      </span>
                      How I thought about this
                    </span>
                    <span className="flex items-center gap-2">
                      {m.modelLabel && (
                        <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-500 ring-1 ring-indigo-100">
                          {m.modelLabel}
                        </span>
                      )}
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm transition-transform" style={{ transform: thinkingOpen[m.id] ? 'rotate(180deg)' : 'none' }}>
                        <Icon.ChevronDown className="h-3 w-3" />
                      </span>
                    </span>
                  </button>
                  {thinkingOpen[m.id] && (
                    <div className="mt-2 space-y-2 rounded-xl bg-gradient-to-br from-slate-50 to-violet-50/40 p-3 text-xs text-slate-600 ring-1 ring-slate-100">
                      {m.thinking.intent && (
                        <p><span className="font-semibold text-violet-600">Intent:</span> {m.thinking.intent}</p>
                      )}
                      {m.thinking.understanding && (
                        <p><span className="font-semibold text-violet-600">Understanding:</span> {m.thinking.understanding}</p>
                      )}
                      {m.thinking.evidence?.length > 0 && (
                        <div>
                          <p className="font-semibold text-emerald-600">Evidence found:</p>
                          <ul className="ml-3 list-disc space-y-0.5">
                            {m.thinking.evidence.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        </div>
                      )}
                      {m.thinking.gaps?.length > 0 && (
                        <div>
                          <p className="font-semibold text-amber-600">What's still missing:</p>
                          <ul className="ml-3 list-disc space-y-0.5">
                            {m.thinking.gaps.map((g, i) => <li key={i}>{g}</li>)}
                          </ul>
                        </div>
                      )}
                      {m.thinking.risks?.length > 0 && (
                        <div>
                          <p className="font-semibold text-rose-600">Risks I'm watching:</p>
                          <ul className="ml-3 list-disc space-y-0.5">
                            {m.thinking.risks.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                      {m.thinking.plan && (
                        <p><span className="font-semibold text-violet-600">Plan:</span> {m.thinking.plan}</p>
                      )}
                      {(m.webResearch?.queries?.length > 0 || m.webResearch?.sources?.length > 0) && (
                        <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-2.5">
                          <p className="flex items-center gap-1.5 font-semibold text-sky-700">
                            <Icon.Globe className="h-3.5 w-3.5" /> Web sources consulted
                          </p>
                          {m.webResearch.queries?.length > 0 && (
                            <div className="mt-1">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Searches run</p>
                              <ul className="ml-3 list-disc space-y-0.5">
                                {m.webResearch.queries.map((q, i) => <li key={i}>“{q}”</li>)}
                              </ul>
                            </div>
                          )}
                          {m.webResearch.sources?.length > 0 && (
                            <div className="mt-1.5">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Pages consulted</p>
                              <ul className="ml-3 list-disc space-y-1">
                                {m.webResearch.sources.map((s, i) => (
                                  <li key={i}>
                                    <a
                                      href={s.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="break-all text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                                      title={s.url}
                                    >
                                      {s.title || s.url}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {m.role === 'assistant' && m.review?.issues?.length > 0 && (
                <div className="mt-2 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-orange-50/60 px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                    <Icon.Alert className="h-3.5 w-3.5" /> Self-review
                  </p>
                  <ul className="ml-3 mt-1 list-disc space-y-0.5 text-xs text-amber-800">
                    {m.review.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                  </ul>
                  {m.review.advice && <p className="mt-1 text-xs italic text-amber-700">{m.review.advice}</p>}
                </div>
              )}
              {m.role === 'assistant' && m.recommendations?.length > 0 && (
                <div className="mt-3 border-t border-violet-100/70 pt-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-600">
                    <Icon.Sparkles className="h-3.5 w-3.5" /> AI-COO recommends
                  </p>
                  <Recommendations recs={m.recommendations} />
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="relative flex items-end gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-300/50">
              <Icon.Sparkle className="h-4 w-4" />
            </div>
            <ThinkingBubble />
          </div>
        )}

        {/* Scroll sentinel — keeps the conversation pinned to the bottom */}
        <div ref={endRef} />

        {latestDraft && !approval && (
          <div className="relative overflow-hidden rounded-3xl border border-violet-200/80 bg-white p-5 shadow-xl shadow-violet-100/60 animate-fade-up">
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gradient-to-br from-indigo-200/40 to-fuchsia-200/40 blur-2xl" />
            <div className="relative mb-3 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-200">
                  <Icon.FileText className="h-4 w-4" />
                </span>
                Draft plan — ready for your approval
              </h3>
              <Badge className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-sm">Preview only</Badge>
            </div>

            <p className="text-sm text-slate-600">{latestDraft.visionStatement}</p>

            {(latestDraft.objectives || []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {latestDraft.objectives.map((o) => (
                  <span key={o} className="rounded-full bg-gradient-to-r from-violet-50 to-fuchsia-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-100">{o}</span>
                ))}
              </div>
            )}

            <div className="relative mt-4 space-y-3">
              {(latestDraft.roadmap || []).map((m) => (
                <div key={m.title} className={`rounded-2xl border p-3.5 ${HORIZON_COLOR[m.horizon] || 'border-slate-200'}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">{m.title}</p>
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 shadow-sm">{HORIZON_LABEL[m.horizon] || m.horizon}</span>
                  </div>
                  {m.description && <p className="mb-2 text-xs text-slate-500">{m.description}</p>}
                  <div className="space-y-1.5">
                    {(m.tasks || []).map((t) => <TaskRow key={t.title} task={t} />)}
                  </div>
                </div>
              ))}
            </div>

            {(latestDraft.suggestedTasks || []).length > 0 && (
              <div className="relative mt-4 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-orange-50/60 p-3">
                <p className="mb-2 text-sm font-bold text-slate-800">AI suggested additional tasks — tick the ones you want</p>
                <div className="space-y-1.5">
                  {latestDraft.suggestedTasks.map((t) => (
                    <label key={t.title} className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-amber-100 transition-colors hover:ring-amber-300">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-amber-500"
                        checked={selectedSuggested.has(t.title)}
                        onChange={() => toggleSuggested(t.title)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{t.title}</p>
                        {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="relative mt-4 flex items-center justify-end gap-2">
              <button className="btn-secondary" onClick={discardDraft}>Discard draft</button>
              <button className="btn-primary" disabled={approving} onClick={() => approve(latestDraft)}>
                {approving ? 'Creating tasks…' : `Approve & create tasks ✓`}
              </button>
            </div>
            <p className="relative mt-2 text-right text-[11px] text-slate-400">
              Tasks with a named person are assigned to them; the rest stay in the open pool for the AI to route.
            </p>
          </div>
        )}

        {clientDraft && (
          <div className="relative overflow-hidden rounded-3xl border border-fuchsia-200/80 bg-white p-5 shadow-xl shadow-fuchsia-100/60 animate-fade-up">
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-fuchsia-200/40 blur-2xl" />
            <div className="relative mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white shadow-md shadow-fuchsia-200">
                  <Icon.Package className="h-4 w-4" />
                </span>
                New product profile — ready to add
              </h3>
              <Badge className="bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-sm">Draft</Badge>
            </div>
            <p className="text-xs text-slate-500">
              The AI-COO built this from our discussion. Review the details — fill anything missing — then add it to your products.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {CLIENT_FIELDS.map((f) => (
                <div key={f.key} className={f.textarea ? 'md:col-span-2' : ''}>
                  <label className="label">{f.label}</label>
                  {f.textarea ? (
                    <textarea
                      className="input"
                      rows={2}
                      value={clientDraft[f.key] || ''}
                      onChange={(e) => updateClientField(f.key, e.target.value)}
                      placeholder={f.label}
                    />
                  ) : (
                    <input
                      className="input"
                      value={clientDraft[f.key] || ''}
                      onChange={(e) => updateClientField(f.key, e.target.value)}
                      placeholder={f.label}
                    />
                  )}
                </div>
              ))}
            </div>
            {clientMsg && (
              <div className={`mt-3 rounded-xl px-4 py-2 text-sm ${clientMsg.type === 'ok' ? 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'}`}>
                {clientMsg.text}
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button className="btn-secondary" onClick={() => { setClientDraft(null); setClientMsg(null); }}>
                Discard
              </button>
              <button className="btn-primary" disabled={savingClient} onClick={addClient}>
                {savingClient ? 'Adding…' : 'Add product ✓'}
              </button>
            </div>
          </div>
        )}

        {employeeDraft && (
          <div className="relative overflow-hidden rounded-3xl border border-sky-200/80 bg-white p-5 shadow-xl shadow-sky-100/60 animate-fade-up">
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-sky-200/40 blur-2xl" />
            <div className="relative mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-200">
                  <Icon.User className="h-4 w-4" />
                </span>
                New employee profile — ready to add to the team
              </h3>
              <Badge className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-sm">Draft</Badge>
            </div>
            <p className="text-xs text-slate-500">
              The AI-COO built this from our discussion. Review the details, adjust skills or capacity, then add the employee.
              They'll get a login so they can work their queue.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Full name</label>
                <input className="input" value={employeeDraft.name || ''} onChange={(e) => updateEmployeeField('name', e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label className="label">Email (login)</label>
                <input className="input" type="email" value={employeeDraft.email || ''} onChange={(e) => updateEmployeeField('email', e.target.value)} placeholder="name@agency.com" />
              </div>
              <div>
                <label className="label">Seniority tier</label>
                <select className="input" value={employeeDraft.seniorityTier || 'MID'} onChange={(e) => updateEmployeeField('seniorityTier', e.target.value)}>
                  {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Base capacity (max concurrent tasks)</label>
                <input className="input" type="number" min="1" max="10" value={employeeDraft.baseCapacity || 3} onChange={(e) => updateEmployeeField('baseCapacity', Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Location (city)</label>
                <div className="relative">
                  <input
                    className="input pr-9"
                    value={employeeDraft.location || ''}
                    onChange={(e) => updateEmployeeField('location', e.target.value)}
                    onBlur={async (e) => {
                      if (!String(e.target.value || '').trim()) return;
                      const geo = await geocodeLocation(e.target.value);
                      setEmployeeDraft((p) => (geo ? { ...p, lat: geo.lat, lng: geo.lng } : { ...p, lat: null, lng: null }));
                    }}
                    placeholder="e.g. Lahore, Pakistan"
                  />
                  <Icon.MapPin className={`pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 ${employeeDraft.lat && employeeDraft.lng ? 'text-sky-500' : 'text-slate-300'}`} />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Used to plot your team on the map.</p>
              </div>
              <div className="md:col-span-2">
                <label className="label">Strengths & notes</label>
                <textarea className="input" rows={2} value={employeeDraft.strengthsNotes || ''} onChange={(e) => updateEmployeeField('strengthsNotes', e.target.value)} placeholder="e.g. Strong visual design, great with brand systems" />
              </div>
              <div className="md:col-span-2">
                <label className="label">Skills</label>
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleEmployeeSkill(s.name)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${employeeDraft.skills.includes(s.name) ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {s.name}
                    </button>
                  ))}
                  {skills.length === 0 && <p className="text-sm text-slate-500">No skill registry yet — skills will be added as they're typed.</p>}
                </div>
              </div>
            </div>
            {employeeMsg && (
              <div className={`mt-3 whitespace-pre-line rounded-xl px-4 py-2 text-sm ${employeeMsg.type === 'ok' ? 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'}`}>
                {employeeMsg.text}
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              {!empPolicy.createEnabled && (
                <p className="mr-auto text-xs text-amber-600">Creating employees is turned off in Settings.</p>
              )}
              <button className="btn-secondary" onClick={() => { setEmployeeDraft(null); setEmployeeMsg(null); }}>
                Discard
              </button>
              <button className="btn-primary" disabled={savingEmployee || !empPolicy.createEnabled} onClick={addEmployee}>
                {savingEmployee ? 'Adding…' : 'Add employee ✓'}
              </button>
            </div>
          </div>
        )}

        {employeeDrafts && employeeDrafts.length > 0 && (
          <div className="relative overflow-hidden rounded-3xl border border-sky-200/80 bg-gradient-to-br from-sky-50/80 to-cyan-50/60 p-5 shadow-xl shadow-sky-100/60 animate-fade-up">
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-cyan-200/40 blur-2xl" />
            <div className="relative mb-1 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-bold text-slate-800">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-200">
                  <Icon.Users className="h-4 w-4" />
                </span>
                {employeeDrafts.length} login profile{employeeDrafts.length > 1 ? 's' : ''} ready
              </h3>
              <span className="rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                Review before creating
              </span>
            </div>
            <p className="relative mb-4 text-sm text-slate-600">
              Edit the details below — each person gets a login and password when you hit Create.
            </p>

            <div className="relative space-y-4">
              {employeeDrafts.map((ed, idx) => (
                <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                    Employee {idx + 1} of {employeeDrafts.length}
                  </p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="label">Full name</label>
                      <input
                        className="input"
                        value={ed.name || ''}
                        onChange={(e) => updateBulkEmployeeField(idx, 'name', e.target.value)}
                        placeholder="Full name"
                      />
                    </div>
                    <div>
                      <label className="label">Login email</label>
                      <input
                        className="input"
                        type="email"
                        value={ed.email || ''}
                        onChange={(e) => updateBulkEmployeeField(idx, 'email', e.target.value)}
                        placeholder="name@coo.app"
                      />
                    </div>
                    <div>
                      <label className="label">Seniority tier</label>
                      <select
                        className="input"
                        value={ed.seniorityTier || 'MID'}
                        onChange={(e) => updateBulkEmployeeField(idx, 'seniorityTier', e.target.value)}
                      >
                        {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Base capacity (max concurrent tasks)</label>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        max="10"
                        value={ed.baseCapacity || 3}
                        onChange={(e) => updateBulkEmployeeField(idx, 'baseCapacity', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="label">Location (city)</label>
                      <div className="relative">
                        <input
                          className="input pr-9"
                          value={ed.location || ''}
                          onChange={(e) => updateBulkEmployeeField(idx, 'location', e.target.value)}
                          onBlur={async (e) => {
                            if (!String(e.target.value || '').trim()) return;
                            const geo = await geocodeLocation(e.target.value);
                            updateBulkEmployeeField(idx, 'lat', geo ? geo.lat : null);
                            updateBulkEmployeeField(idx, 'lng', geo ? geo.lng : null);
                          }}
                          placeholder="e.g. Islamabad, Pakistan"
                        />
                        <Icon.MapPin className={`pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 ${ed.lat && ed.lng ? 'text-sky-500' : 'text-slate-300'}`} />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Strengths & notes</label>
                      <textarea
                        className="input"
                        rows={2}
                        value={ed.strengthsNotes || ''}
                        onChange={(e) => updateBulkEmployeeField(idx, 'strengthsNotes', e.target.value)}
                        placeholder="e.g. AI proposal drafting, deal closing"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label">Skills</label>
                      <div className="flex flex-wrap gap-1.5">
                        {skills.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleBulkEmployeeSkill(idx, s.name)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                              (ed.skills || []).includes(s.name) ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {s.name}
                          </button>
                        ))}
                        {skills.length === 0 && <p className="text-sm text-slate-500">No skill registry yet — skills will be added as they're typed.</p>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {employeeMsg && (
              <div className={`relative mt-3 whitespace-pre-line rounded-xl px-4 py-2 text-sm ${employeeMsg.type === 'ok' ? 'bg-white text-emerald-800 ring-1 ring-emerald-200' : 'bg-white text-rose-600 ring-1 ring-rose-200'}`}>
                {employeeMsg.text}
              </div>
            )}
            <div className="relative mt-4 flex items-center justify-end gap-2">
              {!empPolicy.createEnabled && (
                <p className="mr-auto text-xs text-amber-600">Creating employees is turned off in Settings.</p>
              )}
              <button
                className="btn-secondary"
                onClick={() => { setEmployeeDrafts(null); setEmployeeMsg(null); }}
              >
                Discard
              </button>
              <button className="btn-primary" disabled={savingEmployee || !empPolicy.createEnabled} onClick={addEmployeesBulk}>
                {savingEmployee ? 'Creating…' : `Create ${employeeDrafts.length} login${employeeDrafts.length > 1 ? 's' : ''} ✓`}
              </button>
            </div>
          </div>
        )}

        {taskChanges && taskChanges.length > 0 && (
          <div className="relative overflow-hidden rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-orange-50/60 p-5 shadow-xl shadow-amber-100/60 animate-fade-up">
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-amber-200/40 blur-2xl" />
            <div className="relative mb-1 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-bold text-amber-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-200">
                  <Icon.Clipboard className="h-4 w-4" />
                </span>
                {taskChanges.length} task change{taskChanges.length > 1 ? 's' : ''} proposed
              </h3>
              <span className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                Review before applying
              </span>
            </div>
            <p className="relative mb-4 text-sm text-amber-900/70">
              The AI-COO will update these existing tasks when you hit Apply — reschedule, edit details, or move them to a different teammate.
            </p>

            <div className="relative space-y-2">
              {taskChanges.map((c, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200/70 bg-white px-4 py-3 shadow-sm">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">
                      {c.taskMatch || c.taskId || 'Task'}
                    </p>
                    <p className="mt-0.5 text-sm text-amber-800">{describeTaskChange(c)}</p>
                    {c.reason && <p className="mt-0.5 text-xs text-slate-500">{c.reason}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                    {c.action}
                  </span>
                </div>
              ))}
            </div>

            {taskChangeMsg && (
              <div className={`relative mt-3 whitespace-pre-line rounded-xl px-4 py-2 text-sm ${taskChangeMsg.type === 'ok' ? 'bg-white text-emerald-800 ring-1 ring-emerald-200' : 'bg-white text-rose-600 ring-1 ring-rose-200'}`}>
                {taskChangeMsg.text}
              </div>
            )}
            <div className="relative mt-4 flex items-center justify-end gap-2">
              <button className="btn-secondary" onClick={() => { setTaskChanges(null); setTaskChangeMsg(null); }}>
                Discard
              </button>
              <button className="btn-primary" disabled={savingTaskChanges} onClick={applyTaskChanges}>
                {savingTaskChanges ? 'Applying…' : `Apply ${taskChanges.length} change${taskChanges.length > 1 ? 's' : ''} ✓`}
              </button>
            </div>
          </div>
        )}

        {productChanges && productChanges.length > 0 && (
          <div className="relative overflow-hidden rounded-3xl border border-violet-200/80 bg-gradient-to-br from-violet-50/80 to-fuchsia-50/60 p-5 shadow-xl shadow-violet-100/60 animate-fade-up">
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-violet-200/40 blur-2xl" />
            <div className="relative mb-1 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-bold text-violet-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-200">
                  <Icon.Package className="h-4 w-4" />
                </span>
                {productChanges.length} product change{productChanges.length > 1 ? 's' : ''} proposed
              </h3>
              <span className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                Review before applying
              </span>
            </div>
            <p className="relative mb-4 text-sm text-violet-900/70">
              The AI-COO will update your portfolio when you hit Apply — edit product details or remove products.
            </p>

            <div className="relative space-y-2">
              {productChanges.map((c, idx) => (
                <div key={idx} className="flex items-start justify-between gap-3 rounded-2xl border border-violet-200/70 bg-white px-4 py-3 shadow-sm">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">
                      {c.productMatch || c.productId || 'Product'}
                    </p>
                    <p className="mt-0.5 text-sm text-violet-800">{describeProductChange(c)}</p>
                    {c.reason && <p className="mt-0.5 text-xs text-slate-500">{c.reason}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-700">
                    {c.action}
                  </span>
                </div>
              ))}
            </div>

            {productChangeMsg && (
              <div className={`relative mt-3 whitespace-pre-line rounded-xl px-4 py-2 text-sm ${productChangeMsg.type === 'ok' ? 'bg-white text-emerald-800 ring-1 ring-emerald-200' : 'bg-white text-rose-600 ring-1 ring-rose-200'}`}>
                {productChangeMsg.text}
              </div>
            )}
            <div className="relative mt-4 flex items-center justify-end gap-2">
              <button className="btn-secondary" onClick={() => { setProductChanges(null); setProductChangeMsg(null); }}>
                Discard
              </button>
              <button className="btn-primary" disabled={savingProductChanges} onClick={applyProductChanges}>
                {savingProductChanges ? 'Applying…' : `Apply ${productChanges.length} change${productChanges.length > 1 ? 's' : ''} ✓`}
              </button>
            </div>
          </div>
        )}

        {emailDraft && (
          <div className="relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-teal-50/60 p-5 shadow-xl shadow-emerald-100/60 animate-fade-up">
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-emerald-200/40 blur-2xl" />
            <div className="relative mb-1 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-bold text-emerald-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-200">
                  <Icon.Mail className="h-4 w-4" />
                </span>
                Email ready to send
              </h3>
              <span className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                Review before sending
              </span>
            </div>
            <p className="relative mb-4 text-sm text-emerald-900/70">
              The AI-COO drafted this from your request. Review the recipient, subject and message — then hit Send and it goes out from the agency inbox.
            </p>

            <div className="relative grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">To</label>
                <input
                  className="input"
                  type="email"
                  value={emailDraft.to || ''}
                  onChange={(e) => setEmailDraft((p) => ({ ...p, to: e.target.value }))}
                  placeholder="name@agency.com"
                />
              </div>
              <div>
                <label className="label">Subject</label>
                <input
                  className="input"
                  value={emailDraft.subject || ''}
                  onChange={(e) => setEmailDraft((p) => ({ ...p, subject: e.target.value }))}
                  placeholder="Subject line"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">Message</label>
                <textarea
                  className="input"
                  rows={5}
                  value={emailDraft.body || ''}
                  onChange={(e) => setEmailDraft((p) => ({ ...p, body: e.target.value }))}
                  placeholder="Email body…"
                />
              </div>
            </div>

            {emailMsg && (
              <div className={`relative mt-3 whitespace-pre-line rounded-xl px-4 py-2 text-sm ${emailMsg.type === 'ok' ? 'bg-white text-emerald-800 ring-1 ring-emerald-200' : 'bg-white text-rose-600 ring-1 ring-rose-200'}`}>
                {emailMsg.text}
              </div>
            )}
            <div className="relative mt-4 flex items-center justify-end gap-2">
              <button className="btn-secondary" onClick={() => { setEmailDraft(null); setEmailMsg(null); }}>
                Discard
              </button>
              <button className="btn-primary" disabled={sendingEmail} onClick={sendEmailDraft}>
                {sendingEmail ? 'Sending…' : 'Send email ✓'}
              </button>
            </div>
          </div>
        )}

        {approval && (
          <div className="relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-teal-50/60 p-5 shadow-xl shadow-emerald-100/60 animate-fade-up">
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-emerald-200/40 blur-2xl" />
            <div className="relative">
              <h3 className="flex items-center gap-2 font-bold text-emerald-800">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-200">
                  <Icon.Check className="h-4 w-4" />
                </span>
                Plan approved 🎉
              </h3>
              <p className="mt-1 text-sm text-slate-700">
                Created <span className="font-semibold">{approval.totalTasks}</span> task(s) from the discussion.
              </p>
              {approval.assignments.length > 0 && (
                <div className="mt-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-emerald-100">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Assigned to team members</p>
                  <div className="space-y-1">
                    {approval.assignments.map((a) => (
                      <div key={a.taskTitle} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">{a.taskTitle}</span>
                        <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm">→ {a.workerName}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {approval.unassignedCount > 0 && (
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-semibold">{approval.unassignedCount}</span> task(s) left in the open pool — the AI will route them automatically.
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <button className="btn-secondary" onClick={startNew}>Start a new discussion</button>
                <a className="btn-primary" href="/roadmaps">View roadmaps →</a>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 flex animate-fade-up items-start gap-2.5 rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50 to-red-50/70 px-4 py-3 shadow-lg shadow-rose-100/60">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-red-500 text-white shadow-sm">
            <Icon.X className="h-3.5 w-3.5" />
          </span>
          <p className="flex-1 text-sm leading-snug text-rose-700">{error}</p>
          <button
            className="shrink-0 rounded-lg p-1 text-rose-400 transition-colors hover:bg-rose-100 hover:text-rose-600"
            onClick={() => setError(null)}
            title="Dismiss"
          >
            <Icon.X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Input */}
      <div className="mt-3">
        <div className="flex items-end gap-2 rounded-3xl border border-indigo-100 bg-white p-2 shadow-xl shadow-indigo-100/50 transition-all focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100">
          <textarea
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-slate-400"
            rows={1}
            placeholder="Ask me anything — plan, hire, email…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          {busy ? (
            <button
              className="flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-red-500 px-5 text-sm font-bold text-white shadow-lg shadow-rose-200 transition-all hover:scale-[1.03] hover:shadow-xl active:scale-95"
              onClick={stop}
              title="Stop generating"
            >
              <Icon.Stop className="h-4 w-4" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              className="flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-5 text-sm font-bold text-white shadow-lg shadow-violet-200 transition-all hover:scale-[1.03] hover:shadow-xl hover:shadow-violet-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              disabled={!input.trim()}
              onClick={() => send()}
            >
              <Icon.Send className="h-4 w-4" />
              <span>Send</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

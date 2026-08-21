import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];

const TYPE_ACCENT = {
  list: { chip: 'from-indigo-500 to-blue-500', ring: 'ring-indigo-100', dot: 'bg-indigo-500' },
  table: { chip: 'from-violet-500 to-purple-500', ring: 'ring-violet-100', dot: 'bg-violet-500' },
  bar: { chip: 'from-fuchsia-500 to-pink-500', ring: 'ring-fuchsia-100', dot: 'bg-fuchsia-500' },
  line: { chip: 'from-emerald-500 to-teal-500', ring: 'ring-emerald-100', dot: 'bg-emerald-500' },
  pie: { chip: 'from-amber-500 to-orange-500', ring: 'ring-amber-100', dot: 'bg-amber-500' },
  map: { chip: 'from-sky-500 to-cyan-500', ring: 'ring-sky-100', dot: 'bg-sky-500' },
  stats: { chip: 'from-rose-500 to-red-500', ring: 'ring-rose-100', dot: 'bg-rose-500' },
};

const TYPE_ICON = {
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  table: 'M3 5h18v14H3zM3 10h18M9 10v9',
  bar: 'M4 20V10M10 20V4M16 20v-9M22 20H2',
  line: 'M3 17l6-6 4 4 8-8M3 21h18',
  pie: 'M21 12A9 9 0 1 1 12 3v9zM21 12h-9V3a9 9 0 0 1 9 9z',
  map: 'M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3zM9 4v13M15 7v13',
  stats: 'M4 20h16M6 16v-5M10 16V8M14 16v-7M18 16V4',
};

function TypeIcon({ type, className }) {
  const d = TYPE_ICON[type] || TYPE_ICON.stats;
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d={d} />
    </svg>
  );
}

function BlockShell({ type, title, subtitle, children }) {
  const accent = TYPE_ACCENT[type] || TYPE_ACCENT.stats;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white/90 shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100/80 px-3.5 py-2.5">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm ${accent.chip}`}>
          <TypeIcon type={type} className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          {title && <p className="truncate text-[13px] font-bold text-slate-800">{title}</p>}
          {subtitle && <p className="truncate text-[11px] text-slate-400">{subtitle}</p>}
        </div>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/* ---------------- list ---------------- */
function VList({ block }) {
  return (
    <div className="space-y-1.5">
      {(block.items || []).map((it, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 transition-colors hover:border-indigo-200 hover:bg-white"
        >
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-800">{it.title}</p>
            {it.subtitle && <p className="truncate text-[11px] text-slate-500">{it.subtitle}</p>}
          </div>
          {it.badge && (
            <span className="shrink-0 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
              {it.badge}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- table ---------------- */
function VTable({ block }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-left">
        <thead>
          <tr>
            {(block.columns || []).map((c, i) => (
              <th key={i} className="border-b border-slate-100 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 first:pl-0">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(block.rows || []).map((row, r) => (
            <tr key={r} className="transition-colors hover:bg-indigo-50/40">
              {(row || []).map((cell, c) => (
                <td key={c} className={`border-b border-slate-50 px-2.5 py-2 text-[12.5px] text-slate-700 ${c === 0 ? 'font-semibold text-slate-800' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- bar ---------------- */
function VBar({ block }) {
  const data = (block.labels || []).map((label, i) => ({ name: label, value: block.values?.[i] || 0 }));
  const long = data.some((d) => d.name.length > 8);
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={long ? 'vertical' : 'horizontal'}
          margin={long ? { left: 8, right: 12, top: 4, bottom: 4 } : { left: -18, right: 12, top: 4, bottom: 0 }}
        >
          {long ? (
            <>
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={Math.min(120, Math.max(60, Math.max(...data.map((d) => d.name.length)) * 7))}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} angle={data.length > 5 ? -25 : 0} height={data.length > 5 ? 42 : 28} textAnchor={data.length > 5 ? 'end' : 'middle'} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={34} />
            </>
          )}
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <Tooltip
            cursor={{ fill: '#f5f3ff' }}
            contentStyle={{ borderRadius: 12, border: '1px solid #e0e7ff', fontSize: 12, boxShadow: '0 8px 24px rgba(99,102,241,0.15)' }}
          />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={34}>
            {(block.labels || []).map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- line ---------------- */
function VLine({ block }) {
  const labels = block.labels || [];
  const series = block.series || [];
  const data = labels.map((label, i) => {
    const row = { name: label };
    series.forEach((s, si) => { row[s.name || `Series ${si + 1}`] = s.values?.[i] ?? null; });
    return row;
  });
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -18, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={34} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: '1px solid #d1fae5', fontSize: 12, boxShadow: '0 8px 24px rgba(16,185,129,0.15)' }}
          />
          {series.map((s, si) => (
            <Line
              key={s.name || si}
              type="monotone"
              dataKey={s.name || `Series ${si + 1}`}
              stroke={COLORS[si % COLORS.length]}
              strokeWidth={2.5}
              dot={{ r: 3, fill: COLORS[si % COLORS.length], strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- pie ---------------- */
function VPie({ block }) {
  const data = (block.labels || []).map((label, i) => ({ name: label, value: block.values?.[i] || 0 }));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div>
      <div className="relative h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={78}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {(data || []).map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => `${v} (${Math.round((Number(v) / total) * 100)}%)`}
              contentStyle={{ borderRadius: 12, border: '1px solid #fef3c7', fontSize: 12, boxShadow: '0 8px 24px rgba(245,158,11,0.15)' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-extrabold text-slate-800">{total}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">total</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {(data || []).map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-lg bg-slate-50/60 px-2 py-1">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="truncate text-[11px] text-slate-600">{d.name}</span>
            <span className="ml-auto text-[11px] font-bold text-slate-700">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- stats ---------------- */
function VStats({ block }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {(block.stats || []).map((s, i) => (
        <div key={i} className="relative overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-3 shadow-sm">
          <div className="pointer-events-none absolute -right-4 -top-4 h-12 w-12 rounded-full opacity-20 blur-xl" style={{ background: COLORS[i % COLORS.length] }} />
          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
          <p className="mt-0.5 truncate text-lg font-extrabold text-slate-800">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

/* ---------------- map ---------------- */
const project = (lng, lat) => [((lng + 180) / 360) * 1000, ((90 - lat) / 180) * 500];

const CONTINENTS = [
  // North America
  [[-168, 71], [-140, 70], [-120, 69], [-95, 68], [-80, 62], [-70, 60], [-60, 52], [-66, 45], [-74, 40], [-80, 25], [-90, 29], [-97, 27], [-105, 30], [-112, 29], [-117, 33], [-122, 38], [-124, 44], [-125, 48], [-132, 55], [-140, 60], [-152, 58], [-160, 62], [-165, 68]],
  // South America
  [[-76, 8], [-62, 10], [-55, 5], [-50, -3], [-45, -12], [-40, -20], [-38, -30], [-45, -35], [-55, -38], [-62, -42], [-68, -55], [-72, -48], [-75, -40], [-77, -32], [-72, -25], [-76, -15], [-81, -6], [-78, 0], [-76, 6]],
  // Africa
  [[-17, 33], [-8, 35], [0, 36], [10, 36], [20, 33], [32, 31], [35, 30], [34, 25], [32, 22], [37, 18], [43, 12], [51, 11], [45, 2], [40, -8], [35, -20], [30, -30], [25, -34], [18, -33], [15, -25], [12, -18], [9, -5], [4, -1], [-6, 3], [-12, 4], [-16, 12], [-13, 20], [-8, 28]],
  // Europe
  [[-9, 43], [0, 39], [3, 43], [8, 45], [12, 44], [13, 40], [18, 40], [20, 38], [24, 40], [28, 42], [30, 44], [28, 47], [30, 50], [34, 52], [38, 55], [40, 59], [36, 62], [32, 65], [28, 70], [24, 68], [20, 64], [18, 60], [14, 58], [10, 56], [6, 55], [3, 53], [0, 50], [-4, 48], [-8, 47]],
  // Asia
  [[38, 62], [45, 68], [55, 70], [65, 70], [75, 72], [85, 75], [100, 77], [120, 73], [140, 72], [160, 70], [178, 66], [170, 60], [160, 55], [155, 50], [145, 50], [140, 45], [135, 45], [132, 40], [130, 35], [125, 35], [122, 30], [122, 25], [120, 23], [115, 21], [110, 20], [108, 16], [104, 14], [100, 12], [98, 8], [100, 4], [97, 2], [90, 2], [85, 5], [80, 5], [77, 8], [73, 10], [70, 10], [67, 14], [62, 17], [60, 24], [55, 26], [50, 26], [45, 30], [48, 35], [52, 38], [56, 38], [60, 40], [55, 44], [50, 44], [48, 46], [45, 42], [42, 42], [40, 45], [40, 50], [40, 55]],
  // Australia
  [[114, -22], [123, -17], [130, -12], [136, -12], [141, -14], [143, -19], [146, -19], [150, -22], [153, -25], [152, -29], [147, -32], [146, -37], [140, -38], [135, -35], [132, -32], [129, -31], [125, -32], [122, -32], [118, -34], [115, -33], [113, -26]],
  // Greenland
  [[-55, 75], [-45, 78], [-38, 75], [-35, 70], [-40, 66], [-45, 62], [-52, 60], [-58, 63], [-55, 70]],
];

const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${project(p[0], p[1])[0].toFixed(1)} ${project(p[0], p[1])[1].toFixed(1)}`).join(' ') + ' Z';

const ISLAND_BLOBS = [
  { cx: project(0, 53)[0], cy: project(0, 53)[1], rx: 9, ry: 13 }, // UK
  { cx: project(139, 38)[0], cy: project(139, 38)[1], rx: 8, ry: 20 }, // Japan
  { cx: project(47, -19)[0], cy: project(47, -19)[1], rx: 9, ry: 30 }, // Madagascar
  { cx: project(112, -6)[0], cy: project(112, -6)[1], rx: 26, ry: 9 }, // Indonesia / SE Asia
];

function VMap({ block }) {
  const points = (block.points || []).map((p) => ({ ...p, x: project(p.lng, p.lat)[0], y: project(p.lng, p.lat)[1] }));
  const graticules = [];
  for (let lng = -150; lng <= 150; lng += 30) graticules.push({ x1: project(lng, 85)[0], x2: project(lng, -85)[0], y1: project(lng, 85)[1], y2: project(lng, -85)[1] });
  for (let lat = -60; lat <= 60; lat += 30) graticules.push({ x1: project(-180, lat)[0], x2: project(180, lat)[0], y1: project(-180, lat)[1], y2: project(180, lat)[1] });

  return (
    <div className="overflow-hidden rounded-xl border border-sky-100 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 shadow-inner">
      <svg viewBox="0 0 1000 500" className="h-auto w-full" role="img" aria-label="World map">
        <defs>
          <radialGradient id="oceanGlow" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#1e1b4b" />
            <stop offset="100%" stopColor="#0f172a" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="1000" height="500" fill="url(#oceanGlow)" />
        {graticules.map((g, i) => (
          <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#ffffff" strokeOpacity={0.05} strokeWidth={1} />
        ))}
        <ellipse cx={500} cy={478} rx={430} ry={20} fill="#818cf8" opacity={0.18} />
        {ISLAND_BLOBS.map((b, i) => (
          <ellipse key={`island-${i}`} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill="#a5b4fc" opacity={0.45} />
        ))}
        {CONTINENTS.map((c, i) => (
          <path key={i} d={toPath(c)} fill="#a5b4fc" opacity={0.5} stroke="#c7d2fe" strokeOpacity={0.35} strokeWidth={0.8} />
        ))}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={7} fill={COLORS[i % COLORS.length]} opacity={0.25}>
              <animate attributeName="r" values="5;12;5" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.35;0.05;0.35" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle cx={p.x} cy={p.y} r={4.5} fill={COLORS[i % COLORS.length]} stroke="#ffffff" strokeWidth={1.2} />
            <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="12.5" fontWeight={700} fill="#ffffff" style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3, strokeLinejoin: 'round' }}>
              {p.label}
            </text>
            {p.value && (
              <text x={p.x} y={p.y + 7} textAnchor="middle" fontSize="10" fill="#a5b4fc" style={{ paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 2.5, strokeLinejoin: 'round' }}>
                {p.value}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ---------------- main ---------------- */
export default function VisualBlocks({ visuals }) {
  if (!Array.isArray(visuals) || !visuals.length) return null;
  return (
    <div className="mt-3 space-y-2.5">
      {(visuals || []).map((block, i) => {
        const accent = TYPE_ACCENT[block.type] || TYPE_ACCENT.stats;
        return (
          <div key={i} className={`rounded-2xl ring-1 ${accent.ring}`}>
            <BlockShell type={block.type} title={block.title} subtitle={block.subtitle}>
              {block.type === 'list' && <VList block={block} />}
              {block.type === 'table' && <VTable block={block} />}
              {block.type === 'bar' && <VBar block={block} />}
              {block.type === 'line' && <VLine block={block} />}
              {block.type === 'pie' && <VPie block={block} />}
              {block.type === 'stats' && <VStats block={block} />}
              {block.type === 'map' && <VMap block={block} />}
            </BlockShell>
          </div>
        );
      })}
    </div>
  );
}

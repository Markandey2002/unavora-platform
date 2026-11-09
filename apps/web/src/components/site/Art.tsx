// Original, code-drawn architectural ILLUSTRATIONS in the brand palette. They stand in for photography until approved
// photos exist (CONTENT_AND_ASSET_REGISTER.md) and are always labelled as illustrations; they never depict a real
// UNAVORA property. Deterministic per seed, so a listing always gets the same picture (no layout shift, cacheable).
import type { ReactNode } from "react";

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(s: string | number): number {
  if (typeof s === "number") return s;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const SKIES = [
  ["#0f1c33", "#2a3f63", "#c9a660", "#f3dfb4"], // dusk
  ["#16294a", "#3d5a86", "#d9b878", "#f6ecd8"], // golden hour
  ["#1b2f52", "#5b7aa6", "#c7d3e3", "#efe9de"], // soft day
  ["#101d35", "#1f3357", "#8a7a5c", "#e3c58a"], // night glow
];

function Sky({ id, sky, w, h }: { id: string; sky: string[]; w: number; h: number }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="0.45" stopColor={sky[1]} />
          <stop offset="0.8" stopColor={sky[2]} />
          <stop offset="1" stopColor={sky[3]} />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.72" cy="0.78" r="0.45">
          <stop offset="0" stopColor="#f6ecd8" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="#e3c58a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#e3c58a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a3f63" />
          <stop offset="0.55" stopColor="#1f3357" />
          <stop offset="1" stopColor="#101d35" />
        </linearGradient>
        <linearGradient id={`${id}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a2b47" />
          <stop offset="1" stopColor="#0c1628" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#${id}-sky)`} />
      <rect width={w} height={h} fill={`url(#${id}-sun)`} />
    </>
  );
}

/** A tower with a window grid; a deterministic share of windows is lit warm gold. */
function Tower({ x, y, w, h, r, tone = "#1f3357", lit = 0.28, rows, cols, crown }: {
  x: number; y: number; w: number; h: number; r: () => number; tone?: string; lit?: number; rows?: number; cols?: number; crown?: boolean;
}) {
  const nr = rows ?? Math.max(4, Math.floor(h / 14));
  const nc = cols ?? Math.max(2, Math.floor(w / 12));
  const cw = (w - 8) / nc;
  const ch = (h - 12) / nr;
  const windows: ReactNode[] = [];
  for (let i = 0; i < nr; i++) {
    for (let j = 0; j < nc; j++) {
      const on = r() < lit;
      windows.push(
        <rect key={`${i}-${j}`} x={x + 4 + j * cw + cw * 0.18} y={y + 8 + i * ch + ch * 0.22} width={cw * 0.64} height={ch * 0.5}
          fill={on ? "#e3c58a" : "#3b5277"} opacity={on ? 0.55 + r() * 0.4 : 0.35} />,
      );
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={tone} />
      <rect x={x} y={y} width={w * 0.12} height={h} fill="#ffffff" opacity="0.05" />
      {crown && <rect x={x + w * 0.2} y={y - 10} width={w * 0.6} height={10} fill={tone} />}
      {windows}
    </g>
  );
}

/** Residential tower with continuous curved balconies and planting (premium high-rise). */
function BalconyTower({ x, y, w, h, r }: { x: number; y: number; w: number; h: number; r: () => number }) {
  const floors = Math.floor(h / 16);
  const parts: ReactNode[] = [];
  for (let i = 0; i < floors; i++) {
    const fy = y + i * 16;
    const bulge = 6 + Math.sin(i * 0.55) * 5;
    parts.push(
      <g key={i}>
        <rect x={x + 6} y={fy + 3} width={w - 12} height={11} fill={r() < 0.35 ? "#e3c58a" : "#2a3f63"} opacity={r() < 0.35 ? 0.75 : 0.9} />
        <path d={`M${x - bulge} ${fy + 14} Q${x + w / 2} ${fy + 18 + bulge * 0.3} ${x + w + bulge} ${fy + 14} L${x + w + bulge} ${fy + 16} Q${x + w / 2} ${fy + 20 + bulge * 0.3} ${x - bulge} ${fy + 16} Z`}
          fill="#f7f5f0" opacity="0.92" />
        {r() < 0.5 && <circle cx={x + 4 + r() * (w - 8)} cy={fy + 12} r={3 + r() * 3} fill="#3f6b4f" opacity="0.85" />}
      </g>,
    );
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={floors * 16} fill="#16294a" />
      {parts}
    </g>
  );
}

function Trees({ y, from, to, r, count, scale = 1 }: { y: number; from: number; to: number; r: () => number; count: number; scale?: number }) {
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const x = from + ((to - from) * (i + r() * 0.8)) / count;
        const s = (10 + r() * 10) * scale;
        return (
          <g key={i}>
            <rect x={x - 1} y={y - s * 0.4} width={2} height={s * 0.5} fill="#1b2a22" />
            <ellipse cx={x} cy={y - s * 0.75} rx={s * 0.6} ry={s * 0.75} fill={i % 3 ? "#2f5a43" : "#3f6b4f"} />
          </g>
        );
      })}
    </g>
  );
}

/** Full-bleed hero illustration: a dusk skyline with a signature residential tower. */
export function HeroArt({ title }: { title: string }) {
  const r = rng(20261108);
  const W = 1600, H = 900, base = 760;
  const far = Array.from({ length: 16 }, (_, i) => ({ x: i * 104 - 20 + r() * 30, w: 60 + r() * 50, h: 120 + r() * 220 }));
  const mid = [
    { x: 80, w: 120, h: 360 }, { x: 230, w: 90, h: 470 }, { x: 980, w: 110, h: 420 }, { x: 1120, w: 140, h: 520 },
    { x: 1300, w: 100, h: 380 }, { x: 1430, w: 130, h: 460 },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={title} className="size-full">
      <Sky id="hero" sky={SKIES[0]} w={W} h={H} />
      <g opacity="0.35">{far.map((b, i) => <rect key={i} x={b.x} y={base - b.h} width={b.w} height={b.h} fill="#2a3f63" />)}</g>
      {mid.map((b, i) => <Tower key={i} x={b.x} y={base - b.h} w={b.w} h={b.h} r={r} tone={i % 2 ? "#1a2c4c" : "#1f3357"} lit={0.32} crown={i === 3} />)}
      <BalconyTower x={560} y={base - 600} w={190} h={600} r={r} />
      <BalconyTower x={770} y={base - 470} w={150} h={470} r={r} />
      <rect y={base} width={W} height={H - base} fill="url(#hero-ground)" />
      <rect y={base} width={W} height={2} fill="#e3c58a" opacity="0.45" />
      <Trees y={base + 6} from={0} to={W} r={r} count={46} scale={1.6} />
      <g opacity="0.18">{mid.map((b, i) => <rect key={i} x={b.x} y={base + 30} width={b.w} height={Math.min(110, b.h / 4)} fill="#e3c58a" />)}</g>
    </svg>
  );
}

export type ArtKind = "tower" | "villa" | "office" | "plot";

export function artKind(category?: string, typeCode?: string): ArtKind {
  if (typeCode === "villa" || typeCode === "independent_house") return "villa";
  if (category === "commercial" || typeCode === "office" || typeCode === "retail" || typeCode === "warehouse") return "office";
  if (category === "land" || typeCode === "plot") return "plot";
  return "tower";
}

/** Card/detail illustration, 4:3 by default; `wide` gives 16:9. */
export function PropertyArt({ kind, seed, label, wide = false }: { kind: ArtKind; seed: number; label: string; wide?: boolean }) {
  const r = rng(seed);
  const W = wide ? 1600 : 800, H = 900, ground = 690;
  const id = `a${seed.toString(36)}${kind}${wide ? "w" : ""}`;
  const sky = SKIES[seed % SKIES.length];
  const cx = W / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" role="img" aria-label={label} className="size-full">
      <Sky id={id} sky={sky} w={W} h={H} />
      <g opacity="0.3">
        {Array.from({ length: wide ? 14 : 8 }, (_, i) => {
          const h = 90 + r() * 200;
          return <rect key={i} x={i * (W / (wide ? 14 : 8)) + r() * 20} y={ground - h} width={50 + r() * 40} height={h} fill="#2a3f63" />;
        })}
      </g>
      {kind === "tower" && (
        <>
          <Tower x={cx - 330} y={ground - 360} w={120} h={360} r={r} tone="#1a2c4c" />
          <BalconyTower x={cx - 150} y={ground - 560} w={180} h={560} r={r} />
          <BalconyTower x={cx + 60} y={ground - 430} w={150} h={430} r={r} />
          <Tower x={cx + 240} y={ground - 300} w={110} h={300} r={r} tone="#1f3357" />
        </>
      )}
      {kind === "office" && (
        <>
          <g>
            <rect x={cx - 230} y={ground - 520} width={300} height={520} fill={`url(#${id}-glass)`} />
            {Array.from({ length: 12 }, (_, i) => <rect key={i} x={cx - 230 + i * 25} y={ground - 520} width={1.5} height={520} fill="#e3c58a" opacity="0.35" />)}
            {Array.from({ length: 20 }, (_, i) => <rect key={i} x={cx - 230} y={ground - 520 + i * 26} width={300} height={1} fill="#ffffff" opacity="0.12" />)}
            <polygon points={`${cx - 230},${ground - 520} ${cx - 120},${ground - 520} ${cx - 230},${ground - 260}`} fill="#ffffff" opacity="0.06" />
          </g>
          <Tower x={cx + 90} y={ground - 360} w={170} h={360} r={r} tone="#1a2c4c" lit={0.45} cols={8} />
          <rect x={cx - 260} y={ground - 40} width={540} height={40} fill="#101d35" />
          <rect x={cx - 260} y={ground - 40} width={540} height={2} fill="#e3c58a" opacity="0.6" />
        </>
      )}
      {kind === "villa" && (
        <g>
          <rect x={cx - 280} y={ground - 170} width={560} height={170} fill="#f7f5f0" />
          <rect x={cx - 310} y={ground - 190} width={360} height={20} fill="#101d35" />
          <rect x={cx + 40} y={ground - 300} width={260} height={130} fill="#ece6da" />
          <rect x={cx + 20} y={ground - 318} width={300} height={18} fill="#101d35" />
          {[0, 1, 2].map((i) => <rect key={i} x={cx - 250 + i * 95} y={ground - 150} width={70} height={110} fill="#2a3f63" opacity="0.9" />)}
          {[0, 1].map((i) => <rect key={i} x={cx + 70 + i * 110} y={ground - 280} width={80} height={90} fill="#e3c58a" opacity="0.6" />)}
          <rect x={cx + 60} y={ground - 150} width={190} height={150} fill="#e3c58a" opacity="0.55" />
          <rect x={cx - 280} y={ground - 2} width={560} height={2} fill="#c9a660" />
        </g>
      )}
      {kind === "plot" && (
        <g>
          <polygon points={`0,${ground} ${W},${ground} ${W},${H} 0,${H}`} fill="#4b6b46" opacity="0.55" />
          {Array.from({ length: 5 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={ground + 20 + i * i * 9} x2={W} y2={ground + 20 + i * i * 9} stroke="#e3c58a" strokeWidth="2" strokeDasharray="10 8" opacity="0.7" />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`v${i}`} x1={cx + (i - 4) * 40} y1={ground + 14} x2={cx + (i - 4) * 210} y2={H} stroke="#e3c58a" strokeWidth="2" strokeDasharray="10 8" opacity="0.7" />
          ))}
          <rect x={cx - 120} y={ground + 70} width={150} height={60} fill="#e3c58a" opacity="0.18" />
        </g>
      )}
      <rect y={ground} width={W} height={H - ground} fill={`url(#${id}-ground)`} opacity={kind === "plot" ? 0.45 : 1} />
      <Trees y={ground + 8} from={0} to={W} r={r} count={wide ? 26 : 14} scale={kind === "plot" ? 1.8 : 2.2} />
    </svg>
  );
}

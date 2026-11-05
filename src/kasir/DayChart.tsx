import { useEffect, useRef, useState } from 'react';
import { fmtDay, rp, rpk } from './format';

export interface DayPoint { d: Date; inc: number; n: number; out: number }

export default function DayChart({ series }: { series: DayPoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth) || 720));
    ro.observe(el);
    setWidth(Math.round(el.clientWidth) || 720);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const off = (e: MouseEvent) => { if (!(e.target as Element).closest('.chart .hit')) setHover(null); };
    document.addEventListener('click', off);
    return () => document.removeEventListener('click', off);
  }, []);

  const W = Math.max(280, width), H = W < 500 ? 200 : 260;
  const padL = 44, padR = 8, padT = 12, padB = 26;
  const max = Math.max(1, ...series.map((s) => s.inc));
  const step = [100e3, 250e3, 500e3, 1e6, 2e6, 2.5e6, 5e6, 10e6].find((s) => max / s <= 4) ?? 10e6;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const n = series.length, slot = (W - padL - padR) / n;
  const bw = Math.max(3, Math.min(22, slot - (slot < 12 ? 2 : 4)));
  const r = Math.min(4, bw / 2);
  const bar = (x: number, v: number) => {
    if (!v) return '';
    const yt = y(v), yb = y(0), h = yb - yt, rr = Math.min(r, h);
    return `M${x},${yb}V${yt + rr}Q${x},${yt} ${x + rr},${yt}H${x + bw - rr}Q${x + bw},${yt} ${x + bw},${yt + rr}V${yb}Z`;
  };
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - padL - padR) / 34))));

  const hs = hover !== null ? series[hover] : null;
  const hx = hover !== null ? padL + slot * hover + slot / 2 : 0;
  const boxW = box.current?.getBoundingClientRect().width ?? W;
  const scale = boxW / W;

  return (
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik pemasukan per hari" onMouseLeave={() => setHover(null)}>
        <g className="grid">{ticks.map((v) => <line key={v} x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} />)}</g>
        <g className="axis">
          {ticks.map((v) => <text key={v} x={padL - 8} y={y(v) + 4} textAnchor="end">{v ? rpk(v) : '0'}</text>)}
          {series.map((s, i) => (n - 1 - i) % every === 0 && (
            <text key={i} x={padL + slot * i + slot / 2} y={H - 8} textAnchor="middle">{s.d.getDate()}</text>
          ))}
        </g>
        {series.map((s, i) => (
          <g key={`${n}-${i}`}>
            {s.inc > 0 && (
              <path className="bar" style={{ '--i': i } as React.CSSProperties}
                d={bar(padL + slot * i + slot / 2 - bw / 2, s.inc)} fill="var(--c-in)" />
            )}
            <rect className="hit" x={padL + slot * i} y={padT} width={slot} height={H - padT - padB} fill="transparent"
              onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          </g>
        ))}
        <line x1={hx} x2={hx} y1={padT} y2={H - padB} stroke="var(--line-strong)" strokeDasharray="3 3" opacity={hs ? 1 : 0} />
      </svg>
      <div
        className={`tip${hs ? ' on' : ''}`}
        style={hs ? { left: Math.min(Math.max(hx * scale, 90), boxW - 90), top: y(hs.inc) * scale } : undefined}
      >
        {hs && (
          <>
            <b>{fmtDay(hs.d, { weekday: 'long', day: 'numeric', month: 'short' })}</b>
            <div className="tr"><span>Pemasukan</span>{rp(hs.inc)}</div>
            <div className="tr"><span>Transaksi</span>{hs.n}</div>
          </>
        )}
      </div>
    </div>
  );
}

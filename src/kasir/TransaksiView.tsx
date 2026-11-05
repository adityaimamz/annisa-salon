import { useEffect, useMemo, useState } from 'react';
import { loadTransactions } from './api';
import { dayKey, fmtDay, fmtTime, rp, startOfDay } from './format';
import type { Tx } from './types';
import { ReceiptSheet, useToast } from './ui';

type Range = 'today' | 'yesterday' | '7';

export default function TransaksiView({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const [range, setRange] = useState<Range>('today');
  const [all, setAll] = useState<Tx[] | null>(null);
  const [sel, setSel] = useState<Tx | null>(null);
  const today = startOfDay(new Date());

  useEffect(() => {
    const since = new Date(today); since.setDate(since.getDate() - 6);
    loadTransactions(since.getTime()).then(setAll).catch((e) => toast(`Gagal memuat transaksi: ${e.message}`, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const list = useMemo(() => {
    const start = new Date(today), end = new Date(today);
    end.setDate(end.getDate() + 1);
    if (range === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
    if (range === '7') start.setDate(start.getDate() - 6);
    return (all ?? []).filter((t) => t.at >= start.getTime() && t.at < end.getTime()).sort((a, b) => b.at - a.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, range]);

  const sum = list.reduce((a, t) => a + t.total, 0);
  const meta = range === '7'
    ? `${fmtDay(Date.now() - 6 * 864e5, { day: 'numeric', month: 'short' })} – ${fmtDay(today, { day: 'numeric', month: 'short' })}`
    : fmtDay(range === 'today' ? today : today.getTime() - 864e5);
  const seg: [Range, string][] = [['today', 'Hari ini'], ['yesterday', 'Kemarin'], ['7', '7 hari']];

  let last = '';
  return (
    <section className="view" aria-label="Transaksi">
      <div className="v-head">
        <div><h1>Transaksi</h1><p className="meta">{meta}</p></div>
        <div className="seg">
          {seg.map(([r, label]) => (
            <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="pad">
        <div className="sumrow">
          <div><span>Pemasukan</span><b>{rp(sum)}</b></div>
          <div><span>Transaksi</span><b>{list.length}</b></div>
          <div><span>Rata-rata</span><b>{rp(list.length ? sum / list.length : 0)}</b></div>
        </div>
        <table className="tx-table">
          <thead><tr><th>Jam</th><th>No. struk</th><th>Pelanggan &amp; layanan</th><th>Bayar</th><th className="num">Total</th></tr></thead>
          <tbody>
            {all === null ? (
              <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 40 }}>Memuat…</td></tr>
            ) : list.length ? list.map((t, idx) => {
              const k = dayKey(t.at);
              const head = range === '7' && k !== last;
              last = k;
              return (
                <FragmentRow key={t.id} head={head ? fmtDay(t.at) : null}>
                  <tr className="tx-row" style={{ '--i': idx } as React.CSSProperties} onClick={() => setSel(t)}>
                    <td className="c-time">{fmtTime(t.at)}</td>
                    <td className="c-no muted">{t.no}</td>
                    <td className="c-items">
                      <div>{t.cust || 'Pelanggan'}</div>
                      <div className="muted">{t.lines.map((l) => l.name + (l.qty > 1 ? ' ×' + l.qty : '')).join(', ')}</div>
                    </td>
                    <td className="c-pay"><span className="pill">{t.pay}</span></td>
                    <td className="c-total num"><b>{rp(t.total)}</b></td>
                  </tr>
                </FragmentRow>
              );
            }) : (
              <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 40 }}>Belum ada transaksi.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ReceiptSheet tx={sel} fresh={false} onClose={() => setSel(null)} />
    </section>
  );
}

function FragmentRow({ head, children }: { head: string | null; children: React.ReactNode }) {
  return (
    <>
      {head && <tr className="day-row"><td colSpan={5}>{head}</td></tr>}
      {children}
    </>
  );
}

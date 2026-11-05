import { useEffect, useMemo, useState } from 'react';
import { addExpense, loadExpenses, loadTransactions } from './api';
import DayChart, { type DayPoint } from './DayChart';
import { dayKey, fmtDay, money, num, rp, rpk, startOfDay } from './format';
import { EXP_CATS, type Category, type Expense, type Tx } from './types';
import { CloseBtn, Sheet, useToast } from './ui';

type Range = '7' | '30' | 'month';
const PAYC: Record<string, string> = { Tunai: '#1F8A5B', QRIS: '#6A63C9', Transfer: '#7A817C' };

export default function KeuanganView({ cats, refreshKey }: { cats: Category[]; refreshKey: number }) {
  const toast = useToast();
  const [range, setRange] = useState<Range>('30');
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [exps, setExps] = useState<Expense[]>([]);
  const [showTable, setShowTable] = useState(false);
  const [expOpen, setExpOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const today = startOfDay(new Date());

  useEffect(() => {
    // 31 hari periode ini + 31 hari periode sebelumnya
    const since = new Date(today); since.setDate(since.getDate() - 62);
    Promise.all([loadTransactions(since.getTime()), loadExpenses(since.getTime())])
      .then(([t, e]) => { setTxs(t); setExps(e); })
      .catch((e) => toast(`Gagal memuat data keuangan: ${e.message}`, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, version]);

  const d = useMemo(() => {
    const n = range === 'month' ? today.getDate() : Number(range);
    const days = Array.from({ length: n }, (_, i) => { const x = new Date(today); x.setDate(x.getDate() - (n - 1 - i)); return x; });
    const start = days[0].getTime(), end = today.getTime() + 864e5, prevStart = start - (end - start);
    const all = txs ?? [];
    const tx = all.filter((t) => t.at >= start && t.at < end), ex = exps.filter((x) => x.at >= start && x.at < end);
    const ptx = all.filter((t) => t.at >= prevStart && t.at < start), pex = exps.filter((x) => x.at >= prevStart && x.at < start);
    const inc = tx.reduce((a, t) => a + t.total, 0), out = ex.reduce((a, x) => a + x.amt, 0);
    const pin = ptx.reduce((a, t) => a + t.total, 0), pout = pex.reduce((a, x) => a + x.amt, 0);
    const series: DayPoint[] = days.map((day) => {
      const k = dayKey(day);
      const dt = tx.filter((t) => dayKey(t.at) === k);
      return { d: day, inc: dt.reduce((a, t) => a + t.total, 0), n: dt.length, out: ex.filter((x) => dayKey(x.at) === k).reduce((a, x) => a + x.amt, 0) };
    });
    return { start, tx, ex, inc, out, pin, pout, series };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, exps, range]);

  const { tx, ex, inc, out, pin, pout, series } = d;
  const delta = (a: number, b: number) => (b ? `${a >= b ? '▲' : '▼'} ${Math.abs(Math.round(((a - b) / b) * 100))}% vs periode lalu` : '');
  const tone = (a: number, b: number, upIsGood: boolean) => (b && a !== b ? ((a > b) === upIsGood ? ' up' : ' down') : '');

  const lines = tx.flatMap((t) => t.lines);
  const byCat = cats.map((c) => ({ name: c.name, v: lines.filter((l) => l.cat === c.id).reduce((a, l) => a + l.price * l.qty, 0) })).sort((a, b) => b.v - a.v);
  const cmax = Math.max(1, ...byCat.map((c) => c.v)), ctot = byCat.reduce((a, c) => a + c.v, 0) || 1;
  const byExp = EXP_CATS.map((c) => ({ name: c, v: ex.filter((x) => x.cat === c).reduce((a, x) => a + x.amt, 0) })).filter((c) => c.v).sort((a, b) => b.v - a.v);
  const emax = Math.max(1, ...byExp.map((c) => c.v));
  const pays = (['Tunai', 'QRIS', 'Transfer'] as const).map((p) => ({ p, v: tx.filter((t) => t.pay === p).reduce((a, t) => a + t.total, 0) }));
  const expSorted = ex.slice().sort((a, b) => b.at - a.at);
  const seg: [Range, string][] = [['7', '7 hari'], ['30', '30 hari'], ['month', 'Bulan ini']];
  const hoverNone = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;

  return (
    <section className="view" aria-label="Keuangan">
      <div className="v-head">
        <div><h1>Keuangan</h1>
          <p className="meta">{fmtDay(d.start, { day: 'numeric', month: 'short' })} – {fmtDay(today, { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
        <div className="seg">
          {seg.map(([r, label]) => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{label}</button>)}
        </div>
      </div>
      <div className="pad">
        <div className="kpis">
          <div className="kpi hero"><span>Laba bersih</span><b>{rp(inc - out)}</b><small>{inc ? `Margin ${Math.round(((inc - out) / inc) * 100)}%` : ''}</small></div>
          <div className="kpi"><span><i className="sw" style={{ background: 'var(--c-in)' }} />Pemasukan</span><b>{rp(inc)}</b><small className={tone(inc, pin, true)}>{delta(inc, pin)}</small></div>
          <div className="kpi"><span><i className="sw" style={{ background: 'var(--c-out)' }} />Pengeluaran</span><b>{rp(out)}</b><small className={tone(out, pout, false)}>{delta(out, pout)}</small></div>
          <div className="kpi"><span>Transaksi</span><b>{tx.length}</b><small>{tx.length ? `Rata-rata ${rp(inc / tx.length)}` : ''}</small></div>
        </div>

        <div className="panels">
          <div className="panel">
            <div className="panel-head">
              <div><h2>Pemasukan per hari</h2><p className="ph-sub">{hoverNone ? 'Ketuk batang untuk detail' : 'Arahkan kursor ke batang untuk detail'}</p></div>
              <button className="linkbtn" type="button" onClick={() => setShowTable((v) => !v)}>{showTable ? 'Sembunyikan tabel' : 'Lihat tabel'}</button>
            </div>
            <DayChart series={series} />
            {showTable && (
              <table className="datatable">
                <thead><tr><th>Tanggal</th><th>Pemasukan</th><th>Pengeluaran</th><th>Selisih</th></tr></thead>
                <tbody>{series.map((s) => (
                  <tr key={s.d.getTime()}><td>{fmtDay(s.d, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td>{rp(s.inc)}</td><td>{rp(s.out)}</td><td>{rp(s.inc - s.out)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><div><h2>Pemasukan per kategori</h2><p className="ph-sub">Sebelum diskon</p></div></div>
            <div className="hbar">
              {byCat.map((c) => (
                <div className="hbar-row" key={c.name} title={`${c.name}: ${rp(c.v)}`}>
                  <span>{c.name}</span><div className="track"><div className="fill" style={{ transform: `scaleX(${Math.max(0.01, c.v / cmax)})` }} /></div>
                  <b>{rpk(c.v)}<span className="pct">{Math.round((c.v / ctot) * 100)}%</span></b>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div><h2>Pengeluaran</h2><p className="ph-sub">{ex.length} catatan · {rp(out)}</p></div>
              <button className="btn btn-green btn-sm" type="button" onClick={() => setExpOpen(true)}>+ Catat pengeluaran</button>
            </div>
            <div className="hbar exp-bars">
              {byExp.map((c) => (
                <div className="hbar-row" key={c.name} title={`${c.name}: ${rp(c.v)}`}>
                  <span>{c.name}</span><div className="track"><div className="fill" style={{ transform: `scaleX(${Math.max(0.01, c.v / emax)})` }} /></div>
                  <b>{rpk(c.v)}<span className="pct">{out ? Math.round((c.v / out) * 100) : 0}%</span></b>
                </div>
              ))}
            </div>
            <ul className="exp-list">
              {expSorted.length ? <>
                {expSorted.slice(0, 8).map((x) => (
                  <li key={x.id}><span className="n">{x.note || x.cat}</span><span className="a">{rp(x.amt)}</span>
                    <span className="m">{x.cat} · {fmtDay(x.at, { day: 'numeric', month: 'short' })}</span></li>
                ))}
                {expSorted.length > 8 && <li><span className="m">+ {expSorted.length - 8} catatan lainnya</span></li>}
              </> : <li><span className="m">Belum ada pengeluaran.</span></li>}
            </ul>
          </div>

          <div className="panel">
            <div className="panel-head"><div><h2>Metode bayar</h2><p className="ph-sub">Pemasukan menurut cara bayar</p></div></div>
            <div className="pay-split">
              {pays.map((x) => <div key={x.p} style={{ flex: x.v || 0, background: PAYC[x.p] }} title={`${x.p}: ${rp(x.v)}`} />)}
            </div>
            <div className="pay-legend">
              {pays.map((x) => (
                <div key={x.p}><span><i className="sw" style={{ background: PAYC[x.p] }} />{x.p}<em>{inc ? Math.round((x.v / inc) * 100) : 0}%</em></span><b>{rp(x.v)}</b></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ExpenseSheet open={expOpen} onClose={() => setExpOpen(false)} onSaved={() => { setVersion((v) => v + 1); toast('Pengeluaran tersimpan'); }} />
    </section>
  );
}

function ExpenseSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [cat, setCat] = useState(EXP_CATS[0]);
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setDate(dayKey(new Date())); setAmt(''); setNote(''); setCat(EXP_CATS[0]); } }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const a = num(amt);
    if (!a || busy) return;
    const [Y, M, D] = date.split('-').map(Number);
    setBusy(true);
    try {
      await addExpense({ cat, amt: a, note: note.trim(), at: new Date(Y, M - 1, D, 12).getTime() });
      onClose(); onSaved();
    } catch (err) {
      toast(`Gagal menyimpan: ${(err as Error).message}`, true);
    } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="expTitle">
      <form className="sheet-in" onSubmit={submit} noValidate>
        <CloseBtn onClick={onClose} />
        <h3 id="expTitle">Catat pengeluaran</h3>
        <div className="field" style={{ marginTop: 20 }}>
          <span className="label">Kategori</span>
          <div className="chips">
            {EXP_CATS.map((c) => (
              <label className="chip" key={c}><input type="radio" name="ecat" value={c} checked={cat === c} onChange={() => setCat(c)} /><span>{c}</span></label>
            ))}
          </div>
        </div>
        <div className="field row2">
          <div><label htmlFor="expAmt">Nominal</label>
            <input className="input" id="expAmt" inputMode="numeric" placeholder="Rp0" value={amt ? 'Rp' + money(num(amt)) : ''} onChange={(e) => setAmt(e.target.value)} autoFocus /></div>
          <div><label htmlFor="expDate">Tanggal</label>
            <input className="input" id="expDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="expNote">Keterangan</label>
          <input className="input" id="expNote" placeholder="Misal: beli cat rambut 6 tube" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button className="btn btn-green" type="submit" style={{ width: '100%' }} disabled={!num(amt) || busy}>
          {busy ? 'Menyimpan…' : 'Simpan pengeluaran'}
        </button>
      </form>
    </Sheet>
  );
}

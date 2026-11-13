import { useEffect, useMemo, useState } from 'react';
import {
  getDailyCashSummary, getPeriodModal, loadExpenses, loadTransactions, saveDailyCashOpening,
} from './api';
import DateRange, { defaultRange } from './DateRange';
import DayChart, { type DayPoint } from './DayChart';
import { dayKey, fmtDay, money, num, rp, rpk, startOfDay } from './format';
import ExpenseSheet, { expenseCats } from './ExpenseSheet';
import { calcPortion } from './TransaksiView';
import type { Category, DailyCashSummary, Expense, Tx } from './types';
import { useToast } from './ui';

type Range = 'today' | 'yesterday' | '7' | '30' | 'month' | 'lastmonth' | 'custom';
const MAX_DAYS = 366;
const PAYC: Record<string, string> = { Tunai: '#1F8A5B', QRIS: '#6A63C9', Transfer: '#7A817C' };

export default function KeuanganView({ cats, refreshKey, onOpenPengeluaran }: { cats: Category[]; refreshKey: number; onOpenPengeluaran: () => void }) {
  const toast = useToast();
  const [range, setRange] = useState<Range>('30');
  const [unitFilter, setUnitFilter] = useState<'all' | 'salon' | 'gbee'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [exps, setExps] = useState<Expense[]>([]);
  const [showTable, setShowTable] = useState(false);
  const [expOpen, setExpOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const openExp = (x: Expense | null) => { setEditing(x); setExpOpen(true); };
  const [version, setVersion] = useState(0);
  const [modalAwal, setModalAwal] = useState<number>(0);
  const today = useMemo(() => startOfDay(new Date()), []);

  useEffect(() => {
    // 31 hari periode ini + 31 hari periode sebelumnya
    // 62 hari terakhir, atau sejak dua bulan lalu (untuk Bulan lalu + pembandingnya), mana yang lebih lama
    const since = new Date(today); since.setDate(since.getDate() - 62);
    since.setTime(Math.min(since.getTime(), new Date(today.getFullYear(), today.getMonth() - 2, 1).getTime()));
    if (range === 'custom' && from) {
      // rentang bebas: muat sejak awal rentang dikurangi panjangnya (untuk pembanding periode lalu)
      const f = new Date(`${from}T00:00:00`), len = Math.max(1, Math.round((new Date(`${to || from}T00:00:00`).getTime() - f.getTime()) / 864e5) + 1);
      since.setTime(Math.min(since.getTime(), f.getTime() - len * 864e5));
    }
    Promise.all([loadTransactions(since.getTime()), loadExpenses(since.getTime())])
      .then(([t, e]) => { setTxs(t); setExps(e); })
      .catch((e) => toast(`Gagal memuat data keuangan: ${e.message}`, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, version, range === 'custom' ? from : '', range === 'custom' ? to : '']);

  const isSingleDay = useMemo(() => {
    if (range === 'today' || range === 'yesterday') return true;
    if (range === 'custom' && from && (!to || from === to)) return true;
    return false;
  }, [range, from, to]);

  const targetDay = useMemo(() => {
    if (range === 'custom' && from) return from;
    if (range === 'yesterday') return dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
    return dayKey(today);
  }, [range, from, today]);

  const [cashSummary, setCashSummary] = useState<DailyCashSummary | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [modalInput, setModalInput] = useState('');
  const [modalNote, setModalNote] = useState('');
  const [savingModal, setSavingModal] = useState(false);

  // Tutup mode edit jika tanggal berganti
  useEffect(() => {
    setEditModal(false);
  }, [targetDay]);

  const d = useMemo(() => {
    let days: Date[];
    const f = from ? new Date(`${from}T00:00:00`) : null, u = to ? new Date(`${to}T00:00:00`) : null;
    if (range === 'today') {
      days = [new Date(today)];
    } else if (range === 'yesterday') {
      days = [new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)];
    } else if (range === 'custom' && f && u && u >= f) {
      const len = Math.min(MAX_DAYS, Math.round((u.getTime() - f.getTime()) / 864e5) + 1);
      days = Array.from({ length: len }, (_, i) => new Date(f.getFullYear(), f.getMonth(), f.getDate() + i));
    } else if (range === 'lastmonth') {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const len = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
      days = Array.from({ length: len }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1));
    } else {
      const n = range === 'month' ? today.getDate() : Number(range);
      days = Array.from({ length: n }, (_, i) => { const x = new Date(today); x.setDate(x.getDate() - (n - 1 - i)); return x; });
    }
    const start = days[0].getTime(), end = days[days.length - 1].getTime() + 864e5, prevStart = start - (end - start);
    const all = txs ?? [];
    const txIncome = (t: Tx) => (unitFilter === 'all' ? t.total : calcPortion(t)[unitFilter]);
    const expMatch = (x: Expense) => (unitFilter === 'all' ? true : x.unit === unitFilter);

    const tx = all.filter((t) => t.at >= start && t.at < end && (unitFilter === 'all' || calcPortion(t)[unitFilter] > 0));
    const ex = exps.filter((x) => x.at >= start && x.at < end && expMatch(x));
    const ptx = all.filter((t) => t.at >= prevStart && t.at < start && (unitFilter === 'all' || calcPortion(t)[unitFilter] > 0));
    const pex = exps.filter((x) => x.at >= prevStart && x.at < start && expMatch(x));
    const inc = tx.reduce((a, t) => a + txIncome(t), 0), out = ex.reduce((a, x) => a + x.amt, 0);
    const pin = ptx.reduce((a, t) => a + txIncome(t), 0), pout = pex.reduce((a, x) => a + x.amt, 0);

    const incSalon = all.filter((t) => t.at >= start && t.at < end).reduce((a, t) => a + calcPortion(t).salon, 0);
    const incGbee = all.filter((t) => t.at >= start && t.at < end).reduce((a, t) => a + calcPortion(t).gbee, 0);

    const series: DayPoint[] = days.map((day) => {
      const k = dayKey(day);
      const dt = tx.filter((t) => dayKey(t.at) === k);
      return { d: day, inc: dt.reduce((a, t) => a + txIncome(t), 0), n: dt.length, out: ex.filter((x) => dayKey(x.at) === k).reduce((a, x) => a + x.amt, 0) };
    });
    return { start, last: days[days.length - 1], tx, ex, inc, out, pin, pout, series, incSalon, incGbee };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, exps, range, from, to, unitFilter]);

  const { tx, ex, inc, out, pin, pout, series, incSalon, incGbee } = d;
  const delta = (a: number, b: number) => (b ? `${a >= b ? '▲' : '▼'} ${Math.abs(Math.round(((a - b) / b) * 100))}% vs periode lalu` : '');
  const tone = (a: number, b: number, upIsGood: boolean) => (b && a !== b ? ((a > b) === upIsGood ? ' up' : ' down') : '');

  // Ambil summary kas laci untuk single-day
  useEffect(() => {
    if (!isSingleDay) return;
    let ignore = false;
    getDailyCashSummary(targetDay)
      .then((s) => {
        if (!ignore) {
          setCashSummary(s);
          setModalAwal(s.opening_cash);
        }
      })
      .catch(() => {
        if (!ignore) setModalAwal(0);
      });
    return () => { ignore = true; };
  }, [isSingleDay, targetDay, refreshKey, version]);

  // Ambil total suntikan modal untuk rentang multi-hari
  const periodEndMs = d.last.getTime() + 864e5;
  useEffect(() => {
    if (isSingleDay) return;
    let ignore = false;
    setCashSummary(null);
    getPeriodModal(d.start, periodEndMs)
      .then((val) => {
        if (!ignore) {
          setModalAwal(val);
        }
      })
      .catch(() => {
        if (!ignore) setModalAwal(0);
      });
    return () => { ignore = true; };
  }, [isSingleDay, d.start, periodEndMs, refreshKey, version]);

  async function handleSaveModal() {
    if (savingModal || !isSingleDay) return;
    const val = num(modalInput);
    setSavingModal(true);
    try {
      const s = await saveDailyCashOpening(targetDay, val, modalNote.trim() || undefined);
      setCashSummary(s);
      setModalAwal(s.opening_cash);
      setEditModal(false);
      setModalNote('');
      setVersion((v) => v + 1);
      toast(`Modal kas (${fmtDay(new Date(targetDay + 'T00:00:00'), { day: 'numeric', month: 'short' })}) diperbarui: ${rp(val)}`);
    } catch (e) {
      toast(`Gagal menyimpan modal: ${(e as Error).message}`, true);
    } finally {
      setSavingModal(false);
    }
  }

  const incTunai = tx.filter((t) => t.pay === 'Tunai').reduce((a, t) => a + (unitFilter === 'all' ? t.total : calcPortion(t)[unitFilter]), 0);
  const outTunai = ex.filter((x) => (x.pay ?? 'Tunai') === 'Tunai').reduce((a, x) => a + x.amt, 0);

  const cleanNetCash = isSingleDay
    ? (unitFilter === 'all'
        ? (cashSummary ? cashSummary.expected_cash : modalAwal + incTunai - outTunai)
        : (unitFilter === 'salon'
            ? modalAwal + incTunai - outTunai
            : inc - out))
    : inc - out + (unitFilter !== 'gbee' ? modalAwal : 0);

  const lines = tx.flatMap((t) => t.lines.filter((l) => {
    const u = l.unit ?? (l.cat === 'produk' ? 'gbee' : 'salon');
    return unitFilter === 'all' || u === unitFilter;
  }));
  const byCat = cats.map((c) => ({ name: c.name, v: lines.filter((l) => l.cat === c.id).reduce((a, l) => a + l.price * l.qty, 0) })).sort((a, b) => b.v - a.v);
  const uncat = lines.filter((l) => !cats.some((c) => c.id === l.cat)).reduce((a, l) => a + l.price * l.qty, 0);
  if (uncat) byCat.push({ name: 'Tanpa kategori', v: uncat });
  const bySvc = [...lines.reduce((m, l) => {
    const k = l.name.trim().toLowerCase();
    const cur = m.get(k) ?? { name: l.name.trim(), qty: 0, v: 0 };
    cur.qty += l.qty; cur.v += l.price * l.qty;
    return m.set(k, cur);
  }, new Map<string, { name: string; qty: number; v: number }>()).values()].sort((a, b) => b.v - a.v || b.qty - a.qty);
  const smax = Math.max(1, ...bySvc.map((x) => x.v));
  const cmax = Math.max(1, ...byCat.map((c) => c.v)), ctot = byCat.reduce((a, c) => a + c.v, 0) || 1;
  // kategori bawaan + kategori lain yang muncul di data (mis. hasil impor)
  const expCats = expenseCats(ex.map((x) => x.cat));
  const byExp = expCats.map((c) => ({ name: c, v: ex.filter((x) => x.cat === c).reduce((a, x) => a + x.amt, 0) })).filter((c) => c.v).sort((a, b) => b.v - a.v);
  const emax = Math.max(1, ...byExp.map((c) => c.v));
  const pays = (['Tunai', 'QRIS', 'Transfer'] as const).map((p) => ({
    p,
    v: tx.filter((t) => t.pay === p).reduce((a, t) => a + (unitFilter === 'all' ? t.total : calcPortion(t)[unitFilter]), 0),
  }));
  const expSorted = ex.slice().sort((a, b) => b.at - a.at);
  const seg: [Range, string][] = [['today', 'Hari ini'], ['yesterday', 'Kemarin'], ['7', '7 hari'], ['30', '30 hari'], ['month', 'Bulan ini'], ['lastmonth', 'Bulan lalu'], ['custom', 'Pilih tanggal']];
  const hoverNone = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;

  return (
    <section className="view" aria-label="Keuangan">
      <div className="v-head">
        <div><h1>Keuangan</h1>
          <p className="meta">{fmtDay(d.start, { day: 'numeric', month: 'short' })} – {fmtDay(d.last, { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="seg seg-sm">
            <button type="button" aria-pressed={unitFilter === 'all'} onClick={() => setUnitFilter('all')}>Semua Unit</button>
            <button type="button" aria-pressed={unitFilter === 'salon'} onClick={() => setUnitFilter('salon')}>Salon</button>
            <button type="button" aria-pressed={unitFilter === 'gbee'} onClick={() => setUnitFilter('gbee')}>Gbee</button>
          </div>
          <div className="seg seg-scroll">
            {seg.map(([r, label]) => <button key={r} aria-pressed={range === r} onClick={() => { if (r === 'custom' && !from) { const [a, b] = defaultRange(); setFrom(a); setTo(b); } setRange(r); }}>{label}</button>)}
          </div>
        </div>
      </div>
      {range === 'custom' && <div className="pad" style={{ paddingBottom: 0 }}><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /></div>}
      <div className="pad">
        <div className="kpis">
          <div className="kpi hero">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span>Total Hasil Kas Bersih</span>
              {modalAwal > 0 && unitFilter !== 'gbee' && (
                <span style={{ fontSize: 11.5, opacity: 0.85 }}>Sesuai Buku Kas</span>
              )}
            </div>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>
              {rp(cleanNetCash)}
            </b>
            <small>
              {isSingleDay ? (
                <>Laba usaha {rp(inc - out)} · Sisa kas laci {rp(cleanNetCash)}</>
              ) : (
                modalAwal > 0 && unitFilter !== 'gbee' ? (
                  <>Laba usaha {rp(inc - out)} · Modal/suntikan (+M) +{rp(modalAwal)}</>
                ) : (
                  <>{inc ? `Margin ${Math.round(((inc - out) / inc) * 100)}%` : ''}</>
                )
              )}
            </small>
          </div>
          <div className="kpi">
            <span><i className="sw" style={{ background: 'var(--c-in)' }} />Pemasukan</span>
            <b>{rp(inc)}</b>
            <small className={tone(inc, pin, true)}>
              {unitFilter === 'all' ? `Salon: ${rpk(incSalon)} · Gbee: ${rpk(incGbee)}` : delta(inc, pin)}
            </small>
          </div>
          <div className="kpi">
            <span><i className="sw" style={{ background: 'var(--c-out)' }} />Pengeluaran</span>
            <b>{rp(out)}</b>
            <small className={tone(out, pout, false)}>{delta(out, pout)}</small>
          </div>
          {unitFilter !== 'gbee' && (
            <div className="kpi">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Modal Kas (M)</span>
                {isSingleDay && !editModal && (
                  <button
                    type="button"
                    className="linkbtn"
                    style={{ fontSize: 12, padding: '2px 6px', fontWeight: 600, color: 'var(--green, #1F8A5B)' }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setModalInput(String(modalAwal));
                      setModalNote('');
                      setEditModal(true);
                    }}
                    title="Ubah modal kas hari ini"
                  >
                    ✎ Ubah
                  </button>
                )}
              </div>
              {editModal && isSingleDay ? (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <label className="money" style={{ flex: 1, minWidth: 0, margin: 0 }}>
                      <span style={{ fontSize: 12 }}>Rp</span>
                      <input
                        className="input"
                        inputMode="numeric"
                        autoFocus
                        style={{ height: 32, fontSize: 13, padding: '2px 6px', fontWeight: 700, textAlign: 'right' }}
                        value={money(num(modalInput))}
                        onChange={(e) => setModalInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveModal();
                          }
                          if (e.key === 'Escape') setEditModal(false);
                        }}
                      />
                    </label>
                  </div>
                  <input
                    className="input"
                    placeholder="Keterangan / alasan (opsional)…"
                    style={{ height: 26, fontSize: 11.5, padding: '2px 6px' }}
                    value={modalNote}
                    onChange={(e) => setModalNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveModal();
                      }
                      if (e.key === 'Escape') setEditModal(false);
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-green btn-sm"
                      style={{ flex: 1, padding: '4px 8px', height: 28, fontSize: 11 }}
                      onClick={handleSaveModal}
                      disabled={savingModal}
                    >
                      {savingModal ? 'Menyimpan…' : 'Simpan'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-line btn-sm"
                      style={{ padding: '4px 8px', height: 28, fontSize: 11 }}
                      onClick={() => setEditModal(false)}
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{rp(modalAwal)}</b>
                  <small>{isSingleDay ? 'Sisa kas kemarin / kas awal' : 'Suntikan modal di periode ini'}</small>
                </>
              )}
            </div>
          )}
          <div className="kpi">
            <span>Transaksi</span>
            <b>{tx.length}</b>
            <small>{tx.length ? `Rata-rata ${rp(inc / tx.length)}` : ''}</small>
          </div>
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
            <div className="panel-head"><div><h2>Layanan terlaris</h2><p className="ph-sub">Urut pendapatan · 10 teratas</p></div></div>
            <div className="hbar">
              {bySvc.slice(0, 10).map((x) => (
                <div className="hbar-row" key={x.name} title={`${x.name}: ${x.qty}× · ${rp(x.v)}`}>
                  <span>{x.name}</span><div className="track"><div className="fill" style={{ transform: `scaleX(${Math.max(0.01, x.v / smax)})` }} /></div>
                  <b>{rpk(x.v)}<span className="pct">{x.qty}×</span></b>
                </div>
              ))}
              {!bySvc.length && <p className="ph-sub">Belum ada transaksi di rentang ini.</p>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div><h2>Pengeluaran</h2><p className="ph-sub">{ex.length} catatan · {rp(out)}</p></div>
              <button className="btn btn-green btn-sm" type="button" onClick={() => openExp(null)}>+ Catat pengeluaran</button>
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
                {expSorted.slice(0, 5).map((x) => (
                  <li key={x.id} className="clickable" role="button" tabIndex={0} aria-label={`Ubah ${x.note || x.cat}`}
                    onClick={() => openExp(x)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openExp(x); } }}>
                    <span className="n">{x.note || x.cat}</span><span className="a">{rp(x.amt)}</span>
                    <span className="m">{x.cat} · {fmtDay(x.at, { day: 'numeric', month: 'short' })}</span></li>
                ))}
                <li><button className="linkbtn" type="button" onClick={onOpenPengeluaran}>
                  {expSorted.length > 5 ? `Lihat semua pengeluaran (${expSorted.length})` : 'Buka halaman Pengeluaran'}</button></li>
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

      <ExpenseSheet open={expOpen} editing={editing} knownCats={exps.map((x) => x.cat)} onClose={() => setExpOpen(false)}
        onSaved={(msg) => { setVersion((v) => v + 1); toast(msg); }} />
    </section>
  );
}

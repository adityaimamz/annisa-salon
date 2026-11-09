import { useEffect, useMemo, useState } from 'react';
import { loadExpenses } from './api';
import ExpenseSheet, { expenseCats } from './ExpenseSheet';
import { dayKey, fmtDay, rp, startOfDay } from './format';
import type { Expense } from './types';
import { Select, useToast } from './ui';

type Preset = '7' | '30' | 'month' | 'lastmonth' | 'all' | 'custom';
type Sort = 'new' | 'old' | 'big' | 'small';
const PAGE = 25;
const PRESETS: [Preset, string][] = [['7', '7 hari'], ['30', '30 hari'], ['month', 'Bulan ini'], ['lastmonth', 'Bulan lalu'], ['all', 'Semua'], ['custom', 'Pilih tanggal']];

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export default function PengeluaranView({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const [all, setAll] = useState<Expense[] | null>(null);
  const [version, setVersion] = useState(0);
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [minAmt, setMinAmt] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  useEffect(() => {
    loadExpenses(0).then(setAll).catch((e) => toast(`Gagal memuat pengeluaran: ${e.message}`, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, version]);

  const today = startOfDay(new Date());
  const [start, end] = useMemo(() => {
    const t = new Date(today), e = new Date(today); e.setDate(e.getDate() + 1);
    if (preset === '7') t.setDate(t.getDate() - 6);
    else if (preset === '30') t.setDate(t.getDate() - 29);
    else if (preset === 'month') t.setDate(1);
    else if (preset === 'lastmonth') {
      e.setTime(new Date(today.getFullYear(), today.getMonth(), 1).getTime());
      t.setTime(new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime());
    } else if (preset === 'all') { t.setTime(0); e.setFullYear(e.getFullYear() + 100); }
    else {
      const f = from ? new Date(`${from}T00:00:00`).getTime() : 0;
      const u = to ? new Date(`${to}T00:00:00`).getTime() + 864e5 : Infinity;
      return [f, u];
    }
    return [t.getTime(), e.getTime()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, from, to]);

  const cats = useMemo(() => expenseCats((all ?? []).map((x) => x.cat)), [all]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const min = Number(minAmt.replace(/\D/g, '')) || 0;
    const out = (all ?? []).filter((x) =>
      x.at >= start && x.at < end && (!cat || x.cat === cat) && x.amt >= min &&
      (!needle || `${x.note} ${x.cat}`.toLowerCase().includes(needle)));
    const by: Record<Sort, (a: Expense, b: Expense) => number> = {
      new: (a, b) => b.at - a.at, old: (a, b) => a.at - b.at, big: (a, b) => b.amt - a.amt, small: (a, b) => a.amt - b.amt,
    };
    return out.sort(by[sort]);
  }, [all, start, end, cat, q, minAmt, sort]);

  useEffect(() => setPage(0), [preset, from, to, q, cat, minAmt, sort]);

  const total = rows.reduce((a, x) => a + x.amt, 0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const perCat = cats.map((c) => ({ c, v: rows.filter((x) => x.cat === c).reduce((a, x) => a + x.amt, 0) })).filter((x) => x.v).sort((a, b) => b.v - a.v);
  const filtered = !!(q.trim() || cat || minAmt);

  function exportCsv() {
    const lines = [['Tanggal', 'Kategori', 'Keterangan', 'Nominal'].map(csvCell).join(',')];
    rows.slice().sort((a, b) => a.at - b.at).forEach((x) => lines.push([dayKey(x.at), x.cat, x.note, x.amt].map(csvCell).join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pengeluaran-${dayKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const openSheet = (x: Expense | null) => { setEditing(x); setOpen(true); };

  return (
    <section className="view" aria-label="Pengeluaran">
      <div className="v-head">
        <div><h1>Pengeluaran</h1><p className="meta">{rows.length} catatan · {rp(total)}{filtered ? ' (hasil filter)' : ''}</p></div>
        <button className="btn btn-line btn-sm" type="button" onClick={exportCsv} disabled={!rows.length}>Unduh CSV</button>
        <button className="btn btn-green btn-sm" type="button" onClick={() => openSheet(null)}>+ Catat pengeluaran</button>
      </div>
      <div className="pad">
        <div className="seg" role="group" aria-label="Rentang" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {PRESETS.map(([p, label]) => <button key={p} aria-pressed={preset === p} onClick={() => setPreset(p)}>{label}</button>)}
        </div>
        {preset === 'custom' && (
          <div className="field row2" style={{ marginBottom: 12 }}>
            <div><label htmlFor="pgFrom">Dari</label><input className="input" id="pgFrom" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label htmlFor="pgTo">Sampai</label><input className="input" id="pgTo" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
        )}
        <div className="flt">
          <input className="input flt-q" type="search" placeholder="Cari keterangan atau kategori" aria-label="Cari" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="input" ariaLabel="Kategori" value={cat} onChange={setCat} placeholder="Semua kategori"
            options={[{ value: '', label: 'Semua kategori' }, ...cats.map((c) => ({ value: c, label: c }))]} />
          <Select className="input" ariaLabel="Urutan" value={sort} onChange={(v) => setSort(v as Sort)}
            options={[{ value: 'new', label: 'Terbaru' }, { value: 'old', label: 'Terlama' }, { value: 'big', label: 'Nominal terbesar' }, { value: 'small', label: 'Nominal terkecil' }]} />
          <input className="input" inputMode="numeric" placeholder="Minimal Rp" aria-label="Nominal minimal" value={minAmt}
            onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); setMinAmt(n ? n.toLocaleString('id-ID') : ''); }} />
          {filtered && <button className="linkbtn" type="button" onClick={() => { setQ(''); setCat(''); setMinAmt(''); }}>Reset</button>}
        </div>

        {perCat.length > 1 && (
          <div className="cat-sum" role="group" aria-label="Ringkasan per kategori">
            {perCat.map(({ c, v }) => (
              <button key={c} type="button" className="cat-pill" aria-pressed={cat === c} onClick={() => setCat(cat === c ? '' : c)}>
                {c} <b>{rp(v)}</b></button>
            ))}
          </div>
        )}

        <table className="tx-table">
          <thead><tr><th>Tanggal</th><th>Kategori</th><th>Keterangan</th><th className="num">Nominal</th></tr></thead>
          <tbody>
            {all === null ? (
              <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 40 }}>Memuat…</td></tr>
            ) : shown.length ? shown.map((x) => (
              <tr key={x.id} className="tx-row" tabIndex={0} onClick={() => openSheet(x)}
                onKeyDown={(e) => { if (e.key === 'Enter') openSheet(x); }}>
                <td className="c-time">{fmtDay(x.at, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td><span className="pill">{x.cat}</span></td>
                <td>{x.note || <span className="muted">-</span>}</td>
                <td className="c-total num"><b>{rp(x.amt)}</b></td>
              </tr>
            )) : (
              <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                {filtered ? 'Tidak ada pengeluaran yang cocok.' : 'Belum ada pengeluaran di rentang ini.'}</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr><td colSpan={3}><b>Total {filtered ? '(hasil filter)' : ''}</b></td><td className="num"><b>{rp(total)}</b></td></tr></tfoot>
          )}
        </table>

        {pages > 1 && (
          <div className="sheet-actions two" style={{ marginTop: 16, alignItems: 'center' }}>
            <button className="btn btn-line btn-sm" type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Sebelumnya</button>
            <button className="btn btn-line btn-sm" type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Berikutnya →</button>
            <p className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 13 }}>Halaman {page + 1} dari {pages}</p>
          </div>
        )}
      </div>

      <ExpenseSheet open={open} editing={editing} knownCats={(all ?? []).map((x) => x.cat)} onClose={() => setOpen(false)}
        onSaved={(msg) => { setVersion((v) => v + 1); toast(msg); }} />
    </section>
  );
}

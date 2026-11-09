import { useEffect, useMemo, useState } from 'react';
import { deleteTransaction, loadTransactions, updateTransaction } from './api';
import DateRange, { defaultRange } from './DateRange';
import { dayKey, fmtDay, fmtTime, money, num, rp, startOfDay } from './format';
import type { Item, PayMethod, Therapist, Tx } from './types';
import { CloseBtn, ReceiptSheet, Select, Sheet, useConfirm, useToast } from './ui';

type Sort = 'new' | 'old' | 'big' | 'small';
const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
type Range = 'today' | 'yesterday' | '7' | '30' | 'month' | 'lastmonth' | 'custom';

export default function TransaksiView({ refreshKey, therapists, items }: { refreshKey: number; therapists: Therapist[]; items: Item[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [range, setRange] = useState<Range>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [pay, setPay] = useState('');
  const [staffF, setStaffF] = useState('');
  const [minAmt, setMinAmt] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [all, setAll] = useState<Tx[] | null>(null);
  const [sel, setSel] = useState<Tx | null>(null);
  const [editing, setEditing] = useState<Tx | null>(null);

  async function remove(t: Tx) {
    if (!(await confirm({
      title: `Hapus transaksi ${t.no}?`,
      message: `${t.cust || 'Pelanggan'} · ${rp(t.total)}. Transaksi hilang permanen dari riwayat dan laporan keuangan, dan tidak bisa dipulihkan.`,
      confirmLabel: 'Hapus', danger: true,
    }))) return;
    try {
      await deleteTransaction(t.id);
      setAll((cur) => (cur ?? []).filter((x) => x.id !== t.id));
      setSel(null);
      toast(`Transaksi ${t.no} dihapus`);
    } catch (e) { toast(`Gagal menghapus: ${(e as Error).message}`, true); }
  }
  const today = startOfDay(new Date());

  useEffect(() => {
    // cukup untuk semua rentang: 30 hari terakhir dan awal bulan lalu, mana yang lebih lama
    const since = new Date(today); since.setDate(since.getDate() - 29);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    let since0 = Math.min(since.getTime(), lastMonth.getTime());
    if (range === 'custom' && from) since0 = Math.min(since0, new Date(`${from}T00:00:00`).getTime());
    loadTransactions(since0).then(setAll).catch((e) => toast(`Gagal memuat transaksi: ${e.message}`, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, range === 'custom' ? from : '']);

  const list = useMemo(() => {
    const start = new Date(today), end = new Date(today);
    end.setDate(end.getDate() + 1);
    if (range === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
    if (range === '7') start.setDate(start.getDate() - 6);
    if (range === '30') start.setDate(start.getDate() - 29);
    if (range === 'month') start.setDate(1);
    if (range === 'lastmonth') {
      end.setTime(new Date(today.getFullYear(), today.getMonth(), 1).getTime());
      start.setTime(new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime());
    }
    if (range === 'custom') {
      start.setTime(from ? new Date(`${from}T00:00:00`).getTime() : 0);
      end.setTime(to ? new Date(`${to}T00:00:00`).getTime() + 864e5 : end.getTime());
    }
    const needle = q.trim().toLowerCase();
    const min = Number(minAmt.replace(/\D/g, '')) || 0;
    const by: Record<Sort, (a: Tx, b: Tx) => number> = {
      new: (a, b) => b.at - a.at, old: (a, b) => a.at - b.at, big: (a, b) => b.total - a.total, small: (a, b) => a.total - b.total,
    };
    return (all ?? []).filter((t) =>
      t.at >= start.getTime() && t.at < end.getTime() && t.total >= min &&
      (!pay || t.pay === pay) && (!staffF || t.lines.some((l) => l.terapis === staffF)) &&
      (!needle || `${t.no} ${t.cust} ${t.wa} ${t.lines.map((l) => l.name).join(' ')}`.toLowerCase().includes(needle)),
    ).sort(by[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, range, from, to, q, pay, staffF, minAmt, sort]);

  // karyawan = terapis (yang mengerjakan layanan sekaligus dicatat sebagai kasir). Daftar dari menu Terapis,
  // ditambah terapis nonaktif yang masih tercatat di transaksi lama.
  const staffOpts = [...new Set([...therapists.map((t) => t.name), ...(all ?? []).flatMap((t) => t.lines.map((l) => l.terapis))]
    .filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'id'));
  const filtered = !!(q.trim() || pay || staffF || minAmt);
  const dateSorted = sort === 'new' || sort === 'old';

  function exportCsv() {
    const rows = [['Tanggal', 'Jam', 'No. struk', 'Pelanggan', 'Layanan', 'Bayar', 'Kasir', 'Diskon', 'Total'].map(csvCell).join(',')];
    list.slice().sort((a, b) => a.at - b.at).forEach((t) => rows.push([
      dayKey(t.at), fmtTime(t.at), t.no, t.cust, t.lines.map((l) => l.name + (l.qty > 1 ? ' x' + l.qty : '')).join('; '), t.pay, t.kasir, t.disc, t.total,
    ].map(csvCell).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + rows.join(String.fromCharCode(13, 10))], { type: 'text/csv;charset=utf-8' }));
    a.download = `transaksi-${dayKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const sum = list.reduce((a, t) => a + t.total, 0);
  const multi = range !== 'today' && range !== 'yesterday';
  const short = { day: 'numeric', month: 'short' } as const;
  let meta: string;
  if (range === 'lastmonth') {
    meta = fmtDay(new Date(today.getFullYear(), today.getMonth() - 1, 1), { month: 'long', year: 'numeric' });
  } else if (range === 'custom') {
    meta = from && to ? `${fmtDay(new Date(`${from}T00:00:00`), short)} – ${fmtDay(new Date(`${to}T00:00:00`), short)}` : 'Pilih tanggal';
  } else if (multi) {
    const from = range === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1)
      : new Date(today.getTime() - (range === '7' ? 6 : 29) * 864e5);
    meta = `${fmtDay(from, short)} – ${fmtDay(today, short)}`;
  } else {
    meta = fmtDay(range === 'today' ? today : today.getTime() - 864e5);
  }
  const seg: [Range, string][] = [
    ['today', 'Hari ini'], ['yesterday', 'Kemarin'], ['7', '7 hari'], ['30', '30 hari'], ['month', 'Bulan ini'], ['lastmonth', 'Bulan lalu'], ['custom', 'Pilih tanggal'],
  ];

  let last = '';
  return (
    <section className="view" aria-label="Transaksi">
      <div className="v-head">
        <div><h1>Transaksi</h1><p className="meta">{meta}</p></div>
        <div className="seg">
          {seg.map(([r, label]) => (
            <button key={r} aria-pressed={range === r} onClick={() => { if (r === 'custom' && !from) { const [a, b] = defaultRange(); setFrom(a); setTo(b); } setRange(r); }}>{label}</button>
          ))}
        </div>
      </div>
      {range === 'custom' && <div className="pad" style={{ paddingBottom: 0 }}><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /></div>}
      <div className="pad">
        <div className="flt">
          <input className="input flt-q" type="search" placeholder="Cari nama, layanan, atau no. struk" aria-label="Cari" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select className="input" ariaLabel="Metode bayar" value={pay} onChange={setPay} placeholder="Semua metode"
            options={[{ value: '', label: 'Semua metode' }, ...['Tunai', 'QRIS', 'Transfer'].map((m) => ({ value: m, label: m }))]} />
          <Select className="input" ariaLabel="Karyawan" value={staffF} onChange={setStaffF} placeholder="Semua karyawan"
            options={[{ value: '', label: 'Semua karyawan' }, ...staffOpts.map((k) => ({ value: k, label: k }))]} />
          <input className="input" inputMode="numeric" placeholder="Minimal Rp" aria-label="Nominal minimal" value={minAmt}
            onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); setMinAmt(n ? n.toLocaleString('id-ID') : ''); }} />
          <Select className="input" ariaLabel="Urutan" value={sort} onChange={(v) => setSort(v as Sort)}
            options={[{ value: 'new', label: 'Terbaru' }, { value: 'old', label: 'Terlama' }, { value: 'big', label: 'Total terbesar' }, { value: 'small', label: 'Total terkecil' }]} />
          {filtered && <button className="linkbtn" type="button" onClick={() => { setQ(''); setPay(''); setStaffF(''); setMinAmt(''); }}>Reset</button>}
          <button className="btn btn-line btn-sm" type="button" onClick={exportCsv} disabled={!list.length}>Unduh CSV</button>
        </div>
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
              const head = multi && dateSorted && k !== last;
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
              <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 40 }}>{filtered ? 'Tidak ada transaksi yang cocok.' : 'Belum ada transaksi.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <ReceiptSheet tx={sel} fresh={false} onClose={() => setSel(null)}
        onEdit={(t) => { setSel(null); setEditing(t); }} onDelete={remove} />
      <EditSheet tx={editing} therapists={therapists} items={items} onClose={() => setEditing(null)}
        onSaved={(t) => { setAll((cur) => (cur ?? []).map((x) => (x.id === t.id ? t : x))); setSel(t); toast('Transaksi diperbarui'); }} />
    </section>
  );
}

interface EditLine { key: number; catalogId: string | null; cat: string | null; name: string; price: string; qty: number; terapis: string }
const PAYS: PayMethod[] = ['Tunai', 'QRIS', 'Transfer'];
let lineKey = 0;

function EditSheet({ tx, therapists, items, onClose, onSaved }: {
  tx: Tx | null; therapists: Therapist[]; items: Item[]; onClose: () => void; onSaved: (t: Tx) => void;
}) {
  const [cust, setCust] = useState('');
  const [wa, setWa] = useState('');
  const [pay, setPay] = useState<PayMethod>('Tunai');
  const [disc, setDisc] = useState('');
  const [lines, setLines] = useState<EditLine[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tx) return;
    setCust(tx.cust); setWa(tx.wa); setErr(''); setPay(tx.pay);
    setDisc(tx.disc ? String(tx.disc) : '');
    setLines(tx.lines.map((l) => ({
      key: ++lineKey, catalogId: l.id, cat: l.cat, name: l.name, price: String(l.price), qty: l.qty,
      terapis: l.terapisId != null ? String(l.terapisId) : '',
    })));
  }, [tx]);

  // Terapis nonaktif yang masih tercatat di transaksi ini tetap muncul sebagai pilihan.
  const therapistOpts = (cur: string) => {
    const opts = therapists.map((t) => ({ value: String(t.id), label: t.name }));
    if (cur && !opts.some((o) => o.value === cur)) {
      const old = tx?.lines.find((l) => String(l.terapisId) === cur);
      opts.push({ value: cur, label: old?.terapis ?? `Terapis #${cur}` });
    }
    return [{ value: '', label: 'Tanpa terapis' }, ...opts];
  };

  const patch = (key: number, p: Partial<EditLine>) => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...p } : l)));
  // mengetik nama yang sama dengan item katalog mengisi harga dan kategorinya
  function setName(l: EditLine, name: string) {
    const hit = items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase());
    if (hit) patch(l.key, { name, catalogId: hit.id, cat: hit.cat, price: hit.price != null ? String(hit.price) : l.price });
    else patch(l.key, { name, catalogId: null });
  }

  const priceOf = (l: EditLine) => num(l.price);
  const sub = lines.reduce((a, l) => a + priceOf(l) * l.qty, 0);
  const discount = Math.min(num(disc), sub);
  const total = sub - discount;
  const valid = lines.length > 0 && lines.every((l) => l.name.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tx || busy) return;
    if (!valid) return setErr('Setiap layanan harus punya nama.');
    setBusy(true); setErr('');
    try {
      const updated = await updateTransaction(tx.id, {
        customer: cust.trim(), wa: wa.trim(), discount, pay,
        lines: lines.map((l) => ({
          catalogId: l.catalogId, cat: l.cat, name: l.name.trim(), price: priceOf(l), qty: l.qty,
          terapisId: l.terapis ? Number(l.terapis) : null,
        })),
      });
      onSaved(updated);
      onClose();
    } catch (ex) { setErr((ex as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={!!tx} onClose={onClose} labelledBy="editTxTitle">
      {tx && (
        <form className="sheet-in" onSubmit={submit} noValidate>
          <CloseBtn onClick={onClose} />
          <h3 id="editTxTitle">Edit transaksi</h3>
          <p className="role-note" style={{ marginTop: 16 }}>
            {tx.no} · Ubah layanan, harga, jumlah, terapis, diskon, atau metode bayar. Total dihitung ulang saat disimpan.
          </p>
          <div className="field row2">
            <div><label htmlFor="etCust">Nama pelanggan</label>
              <input className="input" id="etCust" value={cust} onChange={(e) => setCust(e.target.value)} /></div>
            <div><label htmlFor="etWa">No. WA <span className="opt">(opsional)</span></label>
              <input className="input" id="etWa" inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)} /></div>
          </div>

          <div className="field">
            <span className="label">Metode bayar</span>
            <div className="chips">
              {PAYS.map((m) => (
                <label className="chip" key={m}><input type="radio" name="etPay" value={m} checked={pay === m} onChange={() => setPay(m)} /><span>{m}</span></label>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">Layanan</span>
            <datalist id="etItems">{items.map((i) => <option key={i.id} value={i.name} />)}</datalist>
            {lines.map((l, i) => (
              <div className="et-line" key={l.key}>
                <div className="et-line-head">
                  <input className="input" list="etItems" aria-label={`Nama layanan ${i + 1}`} placeholder="Nama layanan" value={l.name}
                    onChange={(e) => setName(l, e.target.value)} />
                  <button className="btn btn-line btn-sm btn-danger" type="button" aria-label={`Hapus ${l.name || 'layanan'}`}
                    disabled={lines.length === 1} onClick={() => setLines((c) => c.filter((x) => x.key !== l.key))}>Hapus</button>
                </div>
                <div className="row2">
                  <input className="input" inputMode="numeric" aria-label={`Harga ${l.name || 'layanan'}`} placeholder="Harga" value={l.price ? 'Rp' + money(num(l.price)) : ''}
                    onChange={(e) => patch(l.key, { price: String(num(e.target.value)) })} />
                  <div className="mini-step" role="group" aria-label={`Jumlah ${l.name || 'layanan'}`}>
                    <button type="button" aria-label="Kurangi" disabled={l.qty <= 1} onClick={() => patch(l.key, { qty: l.qty - 1 })}>−</button>
                    <span className="qty">{l.qty}</span>
                    <button type="button" aria-label="Tambah" onClick={() => patch(l.key, { qty: l.qty + 1 })}>+</button>
                  </div>
                </div>
                {l.cat !== 'produk' && (
                  <Select className="input" ariaLabel={`Terapis ${l.name || 'layanan'}`} value={l.terapis} placeholder="Tanpa terapis"
                    onChange={(v) => patch(l.key, { terapis: v })} options={therapistOpts(l.terapis)} />
                )}
              </div>
            ))}
            <button className="btn btn-line btn-sm" type="button"
              onClick={() => setLines((c) => [...c, { key: ++lineKey, catalogId: null, cat: null, name: '', price: '', qty: 1, terapis: '' }])}>+ Tambah layanan</button>
          </div>

          <div className="field row2">
            <div><label htmlFor="etDisc">Diskon <span className="opt">(Rp)</span></label>
              <input className="input" id="etDisc" inputMode="numeric" placeholder="Rp0" value={disc ? 'Rp' + money(num(disc)) : ''}
                onChange={(e) => setDisc(String(num(e.target.value)))} /></div>
            <div className="et-total"><span>Total</span><b>{rp(total)}</b>{discount > 0 && <small>Subtotal {rp(sub)}</small>}</div>
          </div>

          {err && <p className="field-err" role="alert">{err}</p>}
          <div className="sheet-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-green" type="submit" disabled={busy || !valid}>{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button>
          </div>
        </form>
      )}
    </Sheet>
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

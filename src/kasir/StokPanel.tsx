import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addStockEntries, deleteStockEntry, loadItemCosts, loadStockEntries, loadStockLevels, loadStockMonthly, setResellerPrice,
} from './api';
import { dayKey, fmtDay, money, num, rp } from './format';
import MoneyInput from './MoneyInput';
import type { Item, ItemCost, StockEntry, StockKind, StockMonthRow } from './types';
import { CloseBtn, Icon, Sheet, useConfirm, useToast } from './ui';

const KIND_LABEL: Record<StockKind, string> = { awal: 'Stok awal', masuk: 'Stok masuk', koreksi: 'Koreksi' };
const SRC_KEY = 'stok:sumber';
const lastSource = () => { try { return localStorage.getItem(SRC_KEY) ?? ''; } catch { return ''; } };
const rememberSource = (s: string) => { try { localStorage.setItem(SRC_KEY, s); } catch { /* abaikan */ } };
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Isi tab Stok di Katalog: stok saat ini, stok masuk, dan rekap bulanan. Khusus owner. */
export default function StokPanel({ items }: Readonly<{ items: Item[] }>) {
  const toast = useToast();
  const [levels, setLevels] = useState<Record<string, number> | null>(null);
  const [costs, setCosts] = useState<Record<string, ItemCost>>({});
  const [view, setView] = useState<'now' | 'month'>('now');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<'masuk' | 'awal' | null>(null);
  const [hist, setHist] = useState<Item | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([loadStockLevels(), loadItemCosts()]);
      setLevels(l); setCosts(c);
    } catch (e) { toast(`Gagal memuat stok: ${(e as Error).message}`, true); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const needle = q.trim().toLowerCase();
  const rows = items.filter((i) => !needle || `${i.name} ${i.k ?? ''}`.toLowerCase().includes(needle));
  const trackedCount = levels ? Object.keys(levels).length : 0;

  async function saveCost(it: Item, v: number) {
    try {
      await setResellerPrice(it.id, v);
      setCosts((c) => ({ ...c, [it.id]: { price: v, source: c[it.id]?.source ?? '' } }));
      toast(`Harga beli ${it.name} jadi ${rp(v)}`);
    } catch (e) { toast(`Gagal menyimpan: ${(e as Error).message}`, true); }
  }

  return (
    <>
      <div className="stk-tools">
        <div className="seg" role="group" aria-label="Tampilan stok">
          <button type="button" aria-pressed={view === 'now'} onClick={() => setView('now')}>Stok saat ini</button>
          <button type="button" aria-pressed={view === 'month'} onClick={() => setView('month')}>Rekap bulanan</button>
        </div>
        {view === 'now' && (
          <div className="stk-actions">
            {trackedCount < items.length && (
              <button className={`btn btn-sm ${trackedCount ? 'btn-line' : 'btn-green'}`} type="button" onClick={() => setForm('awal')}>Isi stok awal</button>
            )}
            <button className={`btn btn-sm ${trackedCount ? 'btn-green' : 'btn-line'}`} type="button" onClick={() => setForm('masuk')}>+ Stok masuk</button>
          </div>
        )}
      </div>

      {view === 'now' ? (
        <>
          <label className="search" style={{ display: 'block', marginBottom: 16 }}>
            {Icon.search()}
            <input className="input" type="search" placeholder="Cari produk…" autoComplete="off" aria-label="Cari produk" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {levels && !trackedCount && (
            <p className="stk-hint"><b>Belum ada stok tercatat.</b> Tekan <b>Isi stok awal</b>, lalu ketik jumlah stok yang ada sekarang. Produk yang kosong dilewati.</p>
          )}
          {rows.length ? (
            <div className="pr-card">
              {rows.map((it) => {
                const sisa = levels?.[it.id];
                const tracked = sisa !== undefined;
                return (
                  <div className="stk-row" key={it.id}>
                    <div className="stk-name"><b>{it.name}</b>{it.k && <span className="k">{it.k}</span>}</div>
                    <button type="button" className={`stk-sisa${tracked && sisa < 0 ? ' neg' : ''}${tracked ? '' : ' none'}`}
                      aria-label={`Riwayat stok ${it.name}`} onClick={() => setHist(it)}>
                      {tracked ? <><b>{sisa}</b><small>sisa</small></> : <small>Belum dicatat</small>}
                    </button>
                    <div className="stk-jual"><small>Harga jual</small><b>{rp(it.price ?? 0)}</b></div>
                    <div className="stk-cost"><small>Harga beli (modal)</small>
                      <MoneyInput value={costs[it.id]?.price ?? 0} label={`harga beli ${it.name}`} onCommit={(v) => saveCost(it, v)} /></div>
                  </div>
                );
              })}
            </div>
          ) : <p className="empty-cart">Tidak ada produk yang cocok.</p>}
        </>
      ) : <Monthly byId={byId} />}

      <StockForm mode={form} items={items} costs={costs} levels={levels ?? {}}
        onClose={() => setForm(null)}
        onSaved={(msg) => { toast(msg); void load(); }} />
      <HistorySheet item={hist} sisa={hist ? levels?.[hist.id] : undefined}
        onClose={() => setHist(null)} onChanged={() => void load()} />
    </>
  );
}

/* ---------- form stok awal / stok masuk ---------- */
function StockForm({ mode, items, costs, levels, onClose, onSaved }: Readonly<{
  mode: 'masuk' | 'awal' | null; items: Item[]; costs: Record<string, ItemCost>; levels: Record<string, number>;
  onClose: () => void; onSaved: (msg: string) => void;
}>) {
  const toast = useToast();
  const isAwal = mode === 'awal';
  const [date, setDate] = useState(dayKey(new Date()));
  const [source, setSource] = useState('');
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [costIn, setCostIn] = useState<Record<string, string>>({});
  const [expense, setExpense] = useState(true);
  const [pay, setPay] = useState<'Tunai' | 'Transfer'>('Tunai');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const today = dayKey(new Date());

  useEffect(() => {
    if (!mode) return;
    setDate(dayKey(new Date())); setSource(mode === 'masuk' ? lastSource() : '');
    setQtys({}); setCostIn({}); setExpense(true); setPay('Tunai'); setQ('');
  }, [mode]);

  const costOf = (id: string) => (costIn[id] === undefined ? (costs[id]?.price ?? 0) : num(costIn[id]));
  const filled = items.filter((i) => num(qtys[i.id] ?? '') > 0);
  const total = isAwal ? 0 : filled.reduce((a, i) => a + num(qtys[i.id]) * costOf(i.id), 0);
  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => !needle || `${i.name} ${i.k ?? ''}`.toLowerCase().includes(needle));
  const sources = [...new Set(Object.values(costs).map((c) => c.source).filter(Boolean))];

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!mode || busy) return;
    if (!filled.length) { toast('Isi jumlah minimal satu produk dulu', true); return; }
    const [Y, M, D] = date.split('-').map(Number);
    const at = date === today ? undefined : new Date(Y, M - 1, D, isAwal ? 0 : 12).getTime();
    setBusy(true);
    try {
      await addStockEntries({
        kind: mode,
        items: filled.map((i) => ({ itemId: i.id, qty: num(qtys[i.id]), unitCost: isAwal ? undefined : (costOf(i.id) || undefined) })),
        source: source.trim() || undefined, at,
        expense: !isAwal && expense && total > 0, pay,
      });
      if (!isAwal) rememberSource(source.trim());
      onClose();
      onSaved(isAwal ? `Stok awal ${filled.length} produk tersimpan` : `Stok masuk ${filled.length} produk tersimpan`);
    } catch (err) {
      toast(`Gagal menyimpan: ${(err as Error).message}`, true);
    } finally { setBusy(false); }
  }

  return (
    <Sheet open={!!mode} onClose={onClose} labelledBy="stkTitle" className="sheet-stok">
      <form className="sheet-in" onSubmit={submit} noValidate>
        <CloseBtn onClick={onClose} />
        <h3 id="stkTitle">{isAwal ? 'Isi stok awal' : 'Stok masuk'}</h3>
        <p className="sub2">{isAwal
          ? 'Ketik jumlah stok yang ada sekarang. Produk yang tidak diisi dilewati.'
          : 'Ketik jumlah di produk yang masuk. Harga beli (modal) terisi otomatis dan boleh diubah.'}</p>

        <div className={`field row2`} style={{ marginTop: 16 }}>
          <div><label htmlFor="stkDate">{isAwal ? 'Stok dihitung tanggal' : 'Tanggal masuk'}</label>
            <input className="input" id="stkDate" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value || today)} /></div>
          {!isAwal && (
            <div><label htmlFor="stkSrc">Beli dari <span className="opt">(opsional)</span></label>
              <input className="input" id="stkSrc" list="stkSrcList" placeholder="Nama sumber" value={source} onChange={(e) => setSource(e.target.value)} />
              <datalist id="stkSrcList">{sources.map((s) => <option key={s} value={s} />)}</datalist></div>
          )}
        </div>

        <label className="search" style={{ display: 'block', marginBottom: 10 }}>
          {Icon.search()}
          <input className="input" type="search" placeholder="Cari produk…" autoComplete="off" aria-label="Cari produk" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className={`stk-form-head${isAwal ? ' awal' : ''}`}><span>Produk</span><span>Jumlah</span>{!isAwal && <span>Harga beli (modal)</span>}</div>
        <div className="stk-rows">
          {shown.map((it) => {
            const has = levels[it.id] !== undefined;
            const locked = isAwal && has;
            return (
              <div className={`stk-frow${isAwal ? ' awal' : ''}${locked ? ' locked' : ''}`} key={it.id}>
                <div className="stk-name"><b>{it.name}</b>{it.k && <span className="k">{it.k}</span>}
                  {locked && <small className="stk-note">sudah ada stok ({levels[it.id]})</small>}
                  {!isAwal && has && <small className="stk-note">sisa {levels[it.id]}</small>}</div>
                <input className="input stk-qty" inputMode="numeric" placeholder="0" aria-label={`Jumlah ${it.name}`} disabled={locked}
                  value={qtys[it.id] ?? ''} onFocus={(e) => e.target.select()}
                  onChange={(e) => setQtys((c) => ({ ...c, [it.id]: e.target.value.replace(/\D/g, '') }))} />
                {!isAwal && (
                  <label className="money"><span>Rp</span>
                    <input className="input" inputMode="numeric" placeholder="0" aria-label={`Harga beli ${it.name}`}
                      value={costIn[it.id] === undefined ? money(costs[it.id]?.price ?? 0) : money(num(costIn[it.id]))}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setCostIn((c) => ({ ...c, [it.id]: e.target.value }))} /></label>
                )}
              </div>
            );
          })}
        </div>

        {!isAwal && total > 0 && (
          <div className="stk-total">
            <div className="row"><span>Total belanja</span><b>{rp(total)}</b></div>
            <label className="stk-check">
              <input type="checkbox" checked={expense} onChange={(e) => setExpense(e.target.checked)} />
              <span>Catat juga sebagai pengeluaran <small>(Stok produk · Gbee)</small></span>
            </label>
            {expense && (
              <div className="seg seg-sm" role="radiogroup" aria-label="Sumber dana">
                <button type="button" aria-pressed={pay === 'Tunai'} onClick={() => setPay('Tunai')}>Tunai kasir</button>
                <button type="button" aria-pressed={pay === 'Transfer'} onClick={() => setPay('Transfer')}>Transfer bank</button>
              </div>
            )}
          </div>
        )}

        <div className="sheet-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-green" type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : filled.length ? `Simpan ${filled.length} produk` : 'Simpan'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/* ---------- riwayat + koreksi satu produk ---------- */
function HistorySheet({ item, sisa, onClose, onChanged }: Readonly<{
  item: Item | null; sisa: number | undefined; onClose: () => void; onChanged: () => void;
}>) {
  const toast = useToast();
  const confirm = useConfirm();
  const [entries, setEntries] = useState<StockEntry[] | null>(null);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const id = item?.id;

  const reload = useCallback(async () => {
    if (!id) return;
    try { setEntries(await loadStockEntries(id)); }
    catch (e) { toast(`Gagal memuat riwayat: ${(e as Error).message}`, true); }
  }, [id, toast]);
  useEffect(() => { setEntries(null); setQty(''); setNote(''); void reload(); }, [reload]);

  async function koreksi(e: React.SyntheticEvent) {
    e.preventDefault();
    const n = Math.trunc(Number(qty));
    if (!item || busy) return;
    if (!n) { toast('Isi jumlah koreksi, misal +5 atau -2', true); return; }
    setBusy(true);
    try {
      await addStockEntries({ kind: 'koreksi', items: [{ itemId: item.id, qty: n }], note: note.trim() || undefined });
      setQty(''); setNote(''); await reload(); onChanged(); toast('Koreksi tersimpan');
    } catch (err) { toast(`Gagal menyimpan: ${(err as Error).message}`, true); }
    finally { setBusy(false); }
  }

  async function remove(en: StockEntry) {
    if (!(await confirm({
      title: 'Hapus catatan ini?',
      message: `${KIND_LABEL[en.kind]} ${signed(en.qty)}${en.unitCost && en.kind === 'masuk' ? ' — pengeluaran terkait ikut disesuaikan' : ''}.`,
      confirmLabel: 'Hapus', danger: true,
    }))) return;
    try { await deleteStockEntry(en.id); await reload(); onChanged(); toast('Catatan dihapus'); }
    catch (err) { toast(`Gagal menghapus: ${(err as Error).message}`, true); }
  }

  return (
    <Sheet open={!!item} onClose={onClose} labelledBy="histTitle" className="sheet-stok">
      <div className="sheet-in">
        <CloseBtn onClick={onClose} />
        <h3 id="histTitle">{item?.name}</h3>
        <p className="sub2">{item?.k ? `${item.k} · ` : ''}{sisa === undefined ? 'Belum ada stok tercatat' : `Sisa ${sisa}`}</p>

        <form className="stk-koreksi" onSubmit={koreksi} noValidate>
          <span className="label">Koreksi stok <small>(salah hitung, rusak, dll)</small></span>
          <div className="stk-koreksi-row">
            <input className="input" type="number" inputMode="numeric" step="1" placeholder="+5 atau -2" aria-label="Jumlah koreksi" value={qty} onChange={(e) => setQty(e.target.value)} />
            <input className="input" placeholder="Catatan (opsional)" aria-label="Catatan koreksi" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn-line btn-sm" type="submit" disabled={busy}>Simpan</button>
          </div>
        </form>

        <h4 className="stk-h4">Riwayat catatan</h4>
        {entries === null ? <p className="stk-empty">Memuat…</p> : entries.length ? (
          <ul className="stk-hist">
            {entries.map((en) => (
              <li key={en.id}>
                <div>
                  <b>{KIND_LABEL[en.kind]}</b>
                  <span className="m">{fmtDay(en.at, { day: 'numeric', month: 'short', year: 'numeric' })}
                    {en.source && ` · ${en.source}`}{en.unitCost ? ` · @${rp(en.unitCost)}` : ''}{en.note && ` · ${en.note}`}</span>
                </div>
                <span className={`q${en.qty < 0 ? ' neg' : ''}`}>{signed(en.qty)}</span>
                <button className="icon-btn" type="button" aria-label="Hapus catatan" onClick={() => remove(en)}>{Icon.close()}</button>
              </li>
            ))}
          </ul>
        ) : <p className="stk-empty">Belum ada catatan.</p>}
        <p className="stk-foot">Sisa = semua catatan di atas − penjualan di Kasir sejak catatan pertama.</p>
      </div>
    </Sheet>
  );
}

/* ---------- rekap bulanan ---------- */
function Monthly({ byId }: Readonly<{ byId: Map<string, Item> }>) {
  const toast = useToast();
  const [month, setMonth] = useState(() => dayKey(new Date()).slice(0, 7));
  const [rows, setRows] = useState<StockMonthRow[] | null>(null);

  useEffect(() => {
    let ignore = false;
    setRows(null);
    loadStockMonthly(`${month}-01`)
      .then((r) => { if (!ignore) setRows(r); })
      .catch((e) => { if (!ignore) toast(`Gagal memuat rekap: ${e.message}`, true); });
    return () => { ignore = true; };
  }, [month, toast]);

  const list = (rows ?? []).filter((r) => byId.has(r.itemId));
  const hasKoreksi = list.some((r) => r.koreksi !== 0);
  const sum = (f: (r: StockMonthRow) => number) => list.reduce((a, r) => a + f(r), 0);
  const label = new Date(`${month}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  return (
    <>
      <div className="stk-month">
        <label htmlFor="stkMonth">Bulan</label>
        <input className="input" id="stkMonth" type="month" value={month} max={dayKey(new Date()).slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      {rows === null ? <p className="empty-cart">Memuat…</p> : list.length ? (
        <div className="stk-table-wrap">
          <table className="stk-table">
            <caption className="sr-only">Rekap stok {label}</caption>
            <thead><tr><th>Produk</th><th>Awal</th><th>Masuk</th>{hasKoreksi && <th>Koreksi</th>}<th>Keluar</th><th>Sisa</th></tr></thead>
            <tbody>
              {list.map((r) => {
                const it = byId.get(r.itemId)!;
                return (
                  <tr key={r.itemId}>
                    <td>{it.name}{it.k && <span className="k"> {it.k}</span>}</td>
                    <td>{r.awal}</td><td>{r.masuk || '–'}</td>{hasKoreksi && <td>{r.koreksi ? signed(r.koreksi) : '–'}</td>}
                    <td>{r.keluar || '–'}</td><td className={r.sisa < 0 ? 'neg' : ''}><b>{r.sisa}</b></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td>Total</td><td>{sum((r) => r.awal)}</td><td>{sum((r) => r.masuk)}</td>{hasKoreksi && <td>{signed(sum((r) => r.koreksi))}</td>}<td>{sum((r) => r.keluar)}</td><td>{sum((r) => r.sisa)}</td></tr></tfoot>
          </table>
        </div>
      ) : <p className="empty-cart"><b>Belum ada data stok</b>untuk {label}.</p>}
    </>
  );
}

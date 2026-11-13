import { useEffect, useMemo, useState } from 'react';
import {
  deleteTransaction, getDailyCashSummary, getModalBulanLalu, getPeriodModal,
  loadTransactions, saveDailyCashOpening, setModalBulanLalu, updateTransaction,
} from './api';
import CapitalSheet from './CapitalSheet';
import DateRange, { defaultRange } from './DateRange';
import { dayKey, fmtDay, fmtTime, money, num, rp, startOfDay } from './format';
import type { DailyCashSummary, Item, PayMethod, Therapist, Tx } from './types';
import { CloseBtn, ReceiptSheet, Select, Sheet, useConfirm, useToast } from './ui';

type Sort = 'new' | 'old' | 'big' | 'small';
const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
type Range = 'today' | 'yesterday' | '7' | '30' | 'month' | 'lastmonth' | 'custom';

export function calcPortion(t: Tx) {
  const subSalon = t.lines
    .filter((l) => (l.unit ?? (l.cat === 'produk' ? 'gbee' : 'salon')) === 'salon')
    .reduce((a, l) => a + l.price * l.qty, 0);
  const subGbee = t.sub - subSalon;
  const discSalon = t.sub ? Math.round((t.disc * subSalon) / t.sub) : 0;
  const salon = Math.max(0, subSalon - discSalon);
  const gbee = Math.max(0, subGbee - (t.disc - discSalon));
  return { salon, gbee };
}

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
  const [unitF, setUnitF] = useState<'all' | 'salon' | 'gbee'>('all');
  const [fltOpen, setFltOpen] = useState(false);
  const [modal, setModal] = useState<number>(0);
  const [cashSummary, setCashSummary] = useState<DailyCashSummary | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [modalInput, setModalInput] = useState('');
  const [modalNote, setModalNote] = useState('');
  const [savingModal, setSavingModal] = useState(false);
  const [capitalOpen, setCapitalOpen] = useState(false);
  const [modalRefreshKey, setModalRefreshKey] = useState(0);

  const today = useMemo(() => startOfDay(new Date()), []);

  const isSingleDay = range === 'today' || range === 'yesterday' || (range === 'custom' && from && (!to || from === to));
  const activeDay = useMemo(() => {
    if (range === 'yesterday') {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return dayKey(d);
    }
    if (range === 'custom' && from) return from;
    return dayKey(today);
  }, [range, from, today]);

  // Tutup mode edit jika tanggal aktif berganti
  useEffect(() => {
    setEditModal(false);
  }, [activeDay]);

  // Ambil summary kas laci untuk tampilan single-day
  useEffect(() => {
    if (!isSingleDay) return;
    let ignore = false;
    getDailyCashSummary(activeDay)
      .then((s) => {
        if (!ignore) {
          setCashSummary(s);
          setModal(s.opening_cash);
        }
      })
      .catch((e) => console.error(e));
    return () => { ignore = true; };
  }, [isSingleDay, activeDay, refreshKey, modalRefreshKey]);

  const { rangeStartMs, rangeEndMs } = useMemo(() => {
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
    return { rangeStartMs: start.getTime(), rangeEndMs: end.getTime() };
  }, [range, from, to, today]);

  // Ambil total suntikan modal untuk tampilan rentang multi-hari
  useEffect(() => {
    if (isSingleDay) return;
    let ignore = false;
    setCashSummary(null);
    getPeriodModal(rangeStartMs, rangeEndMs)
      .then((val) => {
        if (!ignore) {
          setModal(val);
        }
      })
      .catch((e) => console.error(e));
    return () => { ignore = true; };
  }, [isSingleDay, rangeStartMs, rangeEndMs, refreshKey, modalRefreshKey]);

  async function handleSaveModal() {
    if (savingModal || !isSingleDay) return;
    const val = num(modalInput);
    setSavingModal(true);
    try {
      const s = await saveDailyCashOpening(activeDay, val, modalNote.trim() || undefined);
      setCashSummary(s);
      setModal(s.opening_cash);
      setEditModal(false);
      setModalNote('');
      setModalRefreshKey((k) => k + 1);
      toast(`Modal kas (${fmtDay(new Date(activeDay + 'T00:00:00'), { day: 'numeric', month: 'short' })}) diperbarui: ${rp(val)}`);
    } catch (e) {
      toast(`Gagal menyimpan modal: ${(e as Error).message}`, true);
    } finally {
      setSavingModal(false);
    }
  }

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
    return (all ?? []).filter((t) => {
      const p = calcPortion(t);
      if (unitF === 'salon' && p.salon <= 0) return false;
      if (unitF === 'gbee' && p.gbee <= 0) return false;
      return t.at >= start.getTime() && t.at < end.getTime() && t.total >= min &&
        (!pay || t.pay === pay) && (!staffF || t.lines.some((l) => l.terapis === staffF)) &&
        (!needle || `${t.no} ${t.cust} ${t.wa} ${t.lines.map((l) => l.name).join(' ')}`.toLowerCase().includes(needle));
    }).sort(by[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, range, from, to, q, pay, staffF, minAmt, sort, unitF]);

  // karyawan = terapis (yang mengerjakan layanan sekaligus dicatat sebagai kasir). Daftar dari menu Terapis,
  // ditambah terapis nonaktif yang masih tercatat di transaksi lama.
  const staffOpts = [...new Set([...therapists.map((t) => t.name), ...(all ?? []).flatMap((t) => t.lines.map((l) => l.terapis))]
    .filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'id'));
  const filtered = !!(q.trim() || pay || staffF || minAmt);
  const fltCount = [pay, staffF, minAmt, unitF !== 'all'].filter(Boolean).length;
  const dateSorted = sort === 'new' || sort === 'old';

  function exportCsv() {
    const rows = [['Tanggal', 'Jam', 'No. struk', 'Pelanggan', 'Layanan', 'Bayar', 'Kasir', 'Porsi Salon', 'Porsi Gbee', 'Diskon', 'Total'].map(csvCell).join(',')];
    list.slice().sort((a, b) => a.at - b.at).forEach((t) => {
      const p = calcPortion(t);
      rows.push([
        dayKey(t.at), fmtTime(t.at), t.no, t.cust, t.lines.map((l) => l.name + (l.qty > 1 ? ' x' + l.qty : '')).join('; '),
        t.pay, t.kasir, p.salon, p.gbee, t.disc, t.total,
      ].map(csvCell).join(','));
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + rows.join(String.fromCharCode(13, 10))], { type: 'text/csv;charset=utf-8' }));
    a.download = `transaksi-${dayKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const sum = list.reduce((a, t) => a + t.total, 0);
  const sumSalon = list.reduce((a, t) => a + calcPortion(t).salon, 0);
  const sumGbee = list.reduce((a, t) => a + calcPortion(t).gbee, 0);
  const sumTunai = list
    .filter((t) => t.pay === 'Tunai')
    .reduce((a, t) => a + (unitF === 'all' ? t.total : calcPortion(t)[unitF]), 0);
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
        <div className="seg seg-scroll" role="group" aria-label="Rentang waktu">
          {seg.map(([r, label]) => (
            <button key={r} aria-pressed={range === r} onClick={(e) => { e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); if (r === 'custom' && !from) { const [a, b] = defaultRange(); setFrom(a); setTo(b); } setRange(r); }}>{label}</button>
          ))}
        </div>
      </div>
      {range === 'custom' && <div className="pad" style={{ paddingBottom: 0 }}><DateRange from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} /></div>}
      <div className="pad">
        <div className="flt" data-open={fltOpen || undefined}>
          <input className="input flt-q" type="search" placeholder="Cari nama, layanan, atau no. struk" aria-label="Cari" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-line flt-toggle" type="button" aria-expanded={fltOpen} onClick={() => setFltOpen((v) => !v)}>
            Filter{fltCount > 0 && <span className="flt-n">{fltCount}</span>}
          </button>
          <div className="flt-more">
            <Select className="input" ariaLabel="Metode bayar" value={pay} onChange={setPay} placeholder="Semua metode"
              options={[{ value: '', label: 'Semua metode' }, ...['Tunai', 'QRIS', 'Transfer'].map((m) => ({ value: m, label: m }))]} />
            <Select className="input" ariaLabel="Karyawan" value={staffF} onChange={setStaffF} placeholder="Semua karyawan"
              options={[{ value: '', label: 'Semua karyawan' }, ...staffOpts.map((k) => ({ value: k, label: k }))]} />
            <input className="input" inputMode="numeric" placeholder="Minimal Rp" aria-label="Nominal minimal" value={minAmt}
              onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')); setMinAmt(n ? n.toLocaleString('id-ID') : ''); }} />
            <Select className="input" ariaLabel="Unit bisnis" value={unitF} onChange={(v) => setUnitF(v as 'all' | 'salon' | 'gbee')}
              options={[{ value: 'all', label: 'Semua unit' }, { value: 'salon', label: 'Khusus Salon' }, { value: 'gbee', label: 'Khusus Gbee' }]} />
            <Select className="input" ariaLabel="Urutan" value={sort} onChange={(v) => setSort(v as Sort)}
              options={[{ value: 'new', label: 'Terbaru' }, { value: 'old', label: 'Terlama' }, { value: 'big', label: 'Total terbesar' }, { value: 'small', label: 'Total terkecil' }]} />
            {filtered && <button className="linkbtn" type="button" onClick={() => { setQ(''); setPay(''); setStaffF(''); setMinAmt(''); setUnitF('all'); }}>Reset</button>}
            <button className="btn btn-line btn-sm" type="button" onClick={exportCsv} disabled={!list.length}>Unduh CSV</button>
          </div>
        </div>
        <div className="sumrow">
          <div className="sum-hero">
            <span>Total Pemasukan</span>
            <b>{rp(sum)}</b>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>Omzet transaksi</span>
          </div>
          <div><span>💇 Porsi Salon</span><b style={{ color: 'var(--ink)' }}>{rp(sumSalon)}</b></div>
          <div><span>✨ Porsi Gbee</span><b style={{ color: '#E65100' }}>{rp(sumGbee)}</b></div>
          <div>
            <span>Transaksi</span>
            <b>{list.length}</b>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
              {list.length ? `Rata-rata ${rp(sum / list.length)}` : 'Rata-rata Rp0'}
            </span>
          </div>
          <div>
            <span>💰 Total Kas Masuk</span>
            <b style={{ color: 'var(--green, #1F8A5B)', fontVariantNumeric: 'tabular-nums' }}>
              {rp((isSingleDay ? sumTunai : sum) + (unitF !== 'gbee' ? modal : 0))}
            </b>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
              {isSingleDay
                ? (cashSummary ? `Sisa kas laci: ${rp(cashSummary.expected_cash)}` : 'Pemasukan tunai + Modal')
                : 'Pemasukan + Modal (M)'}
            </span>
          </div>
          <div
            className="sum-modal sum-wide"
            style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>💵 Modal Kas (M)</span>
              {isSingleDay ? (
                !editModal && (
                  <button
                    type="button"
                    className="linkbtn"
                    style={{ fontSize: 12, padding: '2px 6px', fontWeight: 600, color: 'var(--green, #1F8A5B)' }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setModalInput(String(modal));
                      setModalNote('');
                      setEditModal(true);
                    }}
                    title="Ubah modal awal hari ini"
                  >
                    ✎ Ubah
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className="linkbtn"
                  style={{ fontSize: 11.5, padding: '0 2px', fontWeight: 600 }}
                  onClick={() => setCapitalOpen(true)}
                  title="Kelola & tambah suntikan modal"
                >
                  + Kelola
                </button>
              )}
            </div>

            {editModal ? (
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
              <div>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{rp(modal)}</b>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
                  {isSingleDay ? 'Sisa kas kemarin / kas awal' : 'Suntikan modal di periode ini'}
                </span>
              </div>
            )}

            <div
              style={{
                fontSize: 11.5,
                color: 'var(--green, #1F8A5B)',
                marginTop: 4,
                borderTop: '1px dashed var(--line)',
                paddingTop: 3,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => setCapitalOpen(true)}
            >
              + Suntikan modal &amp; rincian →
            </div>
          </div>
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
      <CapitalSheet open={capitalOpen} onClose={() => setCapitalOpen(false)}
        onSaved={() => setModalRefreshKey((k) => k + 1)} />
    </section>
  );
}

const FREE = '__free';
const CUR = '__cur';
interface EditLine { free?: boolean; key: number; catalogId: string | null; cat: string | null; name: string; price: string; qty: number; terapis: string }
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
  // pilihan layanan: katalog aktif + nama lama di transaksi ini (bila tidak ada di katalog) + "tulis sendiri"
  const itemOpts = (l: EditLine) => {
    const opts = items.filter((i) => !i.off || i.id === l.catalogId)
      .map((i) => ({ value: i.id, label: i.service ? i.name : `${i.name} (produk)` }));
    const inCatalog = !!l.catalogId && items.some((i) => i.id === l.catalogId);
    if (!inCatalog && l.name.trim()) opts.unshift({ value: CUR, label: l.name });
    opts.push({ value: FREE, label: 'Tulis nama sendiri…' });
    return opts;
  };
  function pickItem(l: EditLine, v: string) {
    if (v === FREE) return patch(l.key, { free: true });
    if (v === CUR) return;
    const hit = items.find((i) => i.id === v);
    if (hit) patch(l.key, { catalogId: hit.id, cat: hit.cat, name: hit.name, price: hit.price != null ? String(hit.price) : l.price, free: false });
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
            {lines.map((l, i) => (
              <div className="et-line" key={l.key}>
                <div className="et-line-head">
                  {l.free ? (
                    <input className="input" aria-label={`Nama layanan ${i + 1}`} placeholder="Nama layanan" value={l.name} autoFocus
                      onChange={(e) => patch(l.key, { name: e.target.value, catalogId: null })} />
                  ) : (
                    <Select className="input" searchable ariaLabel={`Layanan ${i + 1}`} placeholder="Pilih layanan"
                      value={l.catalogId && items.some((x) => x.id === l.catalogId) ? l.catalogId : l.name.trim() ? CUR : ''}
                      onChange={(v) => pickItem(l, v)} options={itemOpts(l)} />
                  )}
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

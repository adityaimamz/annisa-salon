import { useEffect, useMemo, useState } from 'react';
import { deleteTransaction, loadTransactions, updateTransaction } from './api';
import { dayKey, fmtDay, fmtTime, rp, startOfDay } from './format';
import type { Therapist, Tx } from './types';
import { CloseBtn, ReceiptSheet, Select, Sheet, useConfirm, useToast } from './ui';

type Range = 'today' | 'yesterday' | '7';

export default function TransaksiView({ refreshKey, therapists }: { refreshKey: number; therapists: Therapist[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [range, setRange] = useState<Range>('today');
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
      <ReceiptSheet tx={sel} fresh={false} onClose={() => setSel(null)}
        onEdit={(t) => { setSel(null); setEditing(t); }} onDelete={remove} />
      <EditSheet tx={editing} therapists={therapists} onClose={() => setEditing(null)}
        onSaved={(t) => { setAll((cur) => (cur ?? []).map((x) => (x.id === t.id ? t : x))); setSel(t); toast('Transaksi diperbarui'); }} />
    </section>
  );
}

function EditSheet({ tx, therapists, onClose, onSaved }: {
  tx: Tx | null; therapists: Therapist[]; onClose: () => void; onSaved: (t: Tx) => void;
}) {
  const [cust, setCust] = useState('');
  const [wa, setWa] = useState('');
  const [terapis, setTerapis] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tx) return;
    setCust(tx.cust); setWa(tx.wa); setErr('');
    setTerapis(tx.lines.map((l) => (l.terapisId != null ? String(l.terapisId) : '')));
  }, [tx]);

  // Terapis yang sudah dinonaktifkan tetap muncul bila masih tercatat di baris ini.
  const optionsFor = (cur: Tx['lines'][number]) => {
    const opts = therapists.map((t) => ({ value: String(t.id), label: t.name }));
    if (cur.terapisId != null && cur.terapis && !opts.some((o) => o.value === String(cur.terapisId))) {
      opts.push({ value: String(cur.terapisId), label: cur.terapis });
    }
    return opts;
  };
  const nameOf = (id: string, cur: Tx['lines'][number]) =>
    optionsFor(cur).find((o) => o.value === id)?.label ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tx || busy) return;
    const rows = tx.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.rowId != null);
    setBusy(true); setErr('');
    try {
      await updateTransaction(tx.id, {
        customer: cust.trim(), wa: wa.trim(),
        lines: rows.map(({ l, i }) => ({ rowId: l.rowId!, terapisId: terapis[i] ? Number(terapis[i]) : null })),
      });
      onSaved({
        ...tx, cust: cust.trim(), wa: wa.trim(),
        lines: tx.lines.map((l, i) => ({ ...l, terapisId: terapis[i] ? Number(terapis[i]) : null, terapis: terapis[i] ? nameOf(terapis[i], l) : null })),
      });
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
            {tx.no} · Hanya terapis dan data pelanggan yang bisa diubah. Untuk mengoreksi layanan atau nominal, hapus transaksi lalu catat ulang.
          </p>
          <div className="field">
            <label htmlFor="etCust">Nama pelanggan</label>
            <input className="input" id="etCust" value={cust} onChange={(e) => setCust(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="etWa">No. WA <span className="opt">(opsional)</span></label>
            <input className="input" id="etWa" inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)} />
          </div>
          {tx.lines.map((l, i) => (l.rowId != null && (l.cat !== 'produk' || l.terapisId != null)) && (
            <div className="field" key={l.rowId}>
              <label htmlFor={`etTp${i}`}>{l.name}{l.qty > 1 ? ` ×${l.qty}` : ''} <span className="opt">(terapis)</span></label>
              <Select id={`etTp${i}`} className="input" value={terapis[i] ?? ''} placeholder="Pilih terapis"
                onChange={(v) => setTerapis((c) => c.map((x, idx) => (idx === i ? v : x)))} options={optionsFor(l)} />
            </div>
          ))}
          {err && <p className="field-err" role="alert">{err}</p>}
          <div className="sheet-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-green" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button>
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

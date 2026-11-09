import { useEffect, useState } from 'react';
import { addExpense, deleteExpense, updateExpense } from './api';
import { dayKey, money, num } from './format';
import { EXP_CATS, type Expense } from './types';
import { CloseBtn, Sheet, useConfirm, useToast } from './ui';

/** Kategori bawaan + kategori lain yang sudah dipakai di data (mis. hasil impor). */
export const expenseCats = (used: string[]) => [...EXP_CATS, ...new Set(used.filter((c) => c && !EXP_CATS.includes(c)))];

/** Form catat / ubah / hapus pengeluaran. Dipakai di Keuangan dan halaman Pengeluaran. */
export default function ExpenseSheet({ open, editing, knownCats, onClose, onSaved }: {
  open: boolean; editing: Expense | null; knownCats: string[]; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [cat, setCat] = useState(EXP_CATS[0]);
  const [newCat, setNewCat] = useState('');
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNewCat('');
    if (editing) { setDate(dayKey(editing.at)); setAmt(String(editing.amt)); setNote(editing.note); setCat(editing.cat); }
    else { setDate(dayKey(new Date())); setAmt(''); setNote(''); setCat(EXP_CATS[0]); }
  }, [open, editing]);

  const cats = expenseCats([...knownCats, ...(editing ? [editing.cat] : [])]);
  const catFinal = newCat.trim() || cat;
  const ok = !!num(amt) && !!note.trim() && !!catFinal;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const a = num(amt);
    if (!ok || busy) return;
    const [Y, M, D] = date.split('-').map(Number);
    // tanggal tidak diubah -> pertahankan jam aslinya
    const at = editing && date === dayKey(editing.at) ? editing.at : new Date(Y, M - 1, D, 12).getTime();
    setBusy(true);
    try {
      const body = { cat: catFinal, amt: a, note: note.trim(), at };
      if (editing) await updateExpense(editing.id, body); else await addExpense(body);
      onClose(); onSaved(editing ? 'Pengeluaran diperbarui' : 'Pengeluaran tersimpan');
    } catch (err) {
      toast(`Gagal menyimpan: ${(err as Error).message}`, true);
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!editing || busy) return;
    if (!(await confirm({
      title: 'Hapus pengeluaran ini?', message: `${editing.note || editing.cat} · Rp${money(editing.amt)} akan dihapus permanen.`,
      confirmLabel: 'Hapus', danger: true,
    }))) return;
    setBusy(true);
    try { await deleteExpense(editing.id); onClose(); onSaved('Pengeluaran dihapus'); }
    catch (err) { toast(`Gagal menghapus: ${(err as Error).message}`, true); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="expTitle">
      <form className="sheet-in" onSubmit={submit} noValidate>
        <CloseBtn onClick={onClose} />
        <h3 id="expTitle">{editing ? 'Ubah pengeluaran' : 'Catat pengeluaran'}</h3>
        <div className="field" style={{ marginTop: 20 }}>
          <span className="label">Kategori</span>
          <div className="chips">
            {cats.map((c) => (
              <label className="chip" key={c}>
                <input type="radio" name="ecat" value={c} checked={!newCat.trim() && cat === c} onChange={() => { setCat(c); setNewCat(''); }} />
                <span>{c}</span>
              </label>
            ))}
          </div>
          <input className="input" style={{ marginTop: 10 }} placeholder="Atau tulis kategori baru" aria-label="Kategori baru"
            value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={40} />
        </div>
        <div className="field row2">
          <div><label htmlFor="expAmt">Nominal</label>
            <input className="input" id="expAmt" inputMode="numeric" placeholder="Rp0" value={amt ? 'Rp' + money(num(amt)) : ''} onChange={(e) => setAmt(e.target.value)} autoFocus /></div>
          <div><label htmlFor="expDate">Tanggal</label>
            <input className="input" id="expDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="expNote">Keterangan <span className="opt">(wajib)</span></label>
          <input className="input" id="expNote" placeholder="Misal: beli cat rambut 6 tube" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="sheet-actions two" style={editing ? undefined : { gridTemplateColumns: '1fr' }}>
          <button className="btn btn-line btn-danger" type="button" hidden={!editing} onClick={remove} disabled={busy}>Hapus</button>
          <button className="btn btn-green" type="submit" disabled={!ok || busy}>
            {busy ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan pengeluaran'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

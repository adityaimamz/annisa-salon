import { useCallback, useEffect, useState } from 'react';
import { createStaff, deleteStaff, listStaff, resetStaffPassword, setStaffActive } from './api';
import TerapisPanel from './TerapisPanel';
import type { StaffMember, Therapist } from './types';
import { CloseBtn, Sheet, useConfirm, useToast } from './ui';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genPassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => ALPHABET[b % ALPHABET.length]).join('');

export default function KaryawanView({ onTherapists }: { onTherapists: (active: Therapist[]) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'akun' | 'terapis'>('akun');
  const [addingT, setAddingT] = useState(false);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<StaffMember | null>(null);

  const reload = useCallback(
    () => listStaff().then(setStaff).catch((e) => toast(`Gagal memuat karyawan: ${e.message}`, true)),
    [toast],
  );
  useEffect(() => { reload(); }, [reload]);

  async function toggle(m: StaffMember, active: boolean) {
    if (!active && !(await confirm({
      title: `Nonaktifkan ${m.name}?`, message: 'Akun ini tidak bisa masuk sampai diaktifkan lagi.',
      confirmLabel: 'Nonaktifkan', danger: true,
    }))) return;
    try {
      await setStaffActive(m.id, active);
      toast(active ? `${m.name} diaktifkan lagi` : `${m.name} dinonaktifkan, tidak bisa masuk`);
      await reload();
    } catch (e) { toast(`Gagal: ${(e as Error).message}`, true); }
  }

  async function remove(m: StaffMember) {
    if (!(await confirm({
      title: `Hapus ${m.name}?`,
      message: 'Akun dihapus permanen dan tidak bisa dipulihkan. Riwayat transaksi tetap tersimpan, nama kasirnya tampil “-”.',
      confirmLabel: 'Hapus', danger: true,
    }))) return;
    try {
      await deleteStaff(m.id);
      toast(`${m.name} dihapus`);
      await reload();
    } catch (e) { toast(`Gagal menghapus: ${(e as Error).message}`, true); }
  }

  const employees = (staff ?? []).filter((m) => m.role === 'kasir');

  return (
    <section className="view" aria-label="Karyawan">
      <div className="v-head">
        <div><h1>Karyawan</h1>
          <p className="meta">{tab === 'akun'
            ? 'Karyawan hanya bisa memakai Kasir dan melihat daftar Harga.'
            : 'Terapis yang bisa dipilih untuk setiap layanan di Kasir.'}</p></div>
        <div className="seg" role="group" aria-label="Bagian">
          <button type="button" aria-pressed={tab === 'akun'} onClick={() => setTab('akun')}>Akun</button>
          <button type="button" aria-pressed={tab === 'terapis'} onClick={() => setTab('terapis')}>Terapis</button>
        </div>
        <button className="btn btn-green btn-sm" type="button" onClick={() => (tab === 'akun' ? setAdding(true) : setAddingT(true))}>
          {tab === 'akun' ? '+ Tambah karyawan' : '+ Tambah terapis'}
        </button>
      </div>
      {tab === 'terapis' && <TerapisPanel adding={addingT} onAddClose={() => setAddingT(false)} onChanged={onTherapists} />}
      <div className="pad" hidden={tab !== 'akun'}>
        {staff === null ? <p className="empty-cart">Memuat…</p> : (
          <div className="pr-card">
            {(staff ?? []).map((m) => (
              <div className={`pr-item st-row${m.active ? '' : ' off'}`} key={m.id}>
                <span className="st-av" aria-hidden="true">{m.name.trim().charAt(0).toUpperCase()}</span>
                <div className="st-info">
                  <b>{m.name}</b>
                  <small>{m.email}</small>
                </div>
                <span className={`tagx ${m.role === 'owner' ? '' : m.active ? 'on' : 'off'}`}>
                  {m.role === 'owner' ? 'Pemilik' : m.active ? 'Aktif' : 'Nonaktif'}
                </span>
                {m.role === 'kasir' ? (
                  <div className="st-act">
                    <button className="btn btn-line btn-sm" type="button" onClick={() => toggle(m, !m.active)}>{m.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    <button className="btn btn-line btn-sm" type="button" onClick={() => setResetting(m)}>Atur ulang sandi</button>
                    <button className="btn btn-line btn-sm btn-danger" type="button" onClick={() => remove(m)}>Hapus</button>
                  </div>
                ) : <span />}
              </div>
            ))}
          </div>
        )}
        {staff !== null && !employees.length && (
          <p className="empty-cart"><b>Belum ada karyawan</b>Tekan “Tambah karyawan” untuk membuat akun pertama.</p>
        )}
      </div>

      <AddSheet open={adding} onClose={() => setAdding(false)} onDone={async (name) => { toast(`Akun ${name} dibuat`); await reload(); }} />
      <ResetSheet target={resetting} onClose={() => setResetting(null)} onDone={(name) => toast(`Kata sandi ${name} diganti`)} />
    </section>
  );
}

function PasswordField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>Kata sandi <span className="opt">(minimal 8 karakter)</span></label>
      <div className="pw-row">
        <input className="input" id={id} value={value} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
        <button className="btn btn-line btn-sm" type="button" onClick={() => onChange(genPassword())}>Buatkan</button>
      </div>
    </div>
  );
}

function AddSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (name: string) => Promise<void> }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setName(''); setEmail(''); setPw(genPassword()); setErr(''); }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const n = name.trim(), em = email.trim();
    if (!n) return setErr('Nama wajib diisi.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return setErr('Email tidak valid.');
    if (pw.length < 8) return setErr('Kata sandi minimal 8 karakter.');
    setBusy(true); setErr('');
    try { await createStaff(n, em, pw); onClose(); await onDone(n); }
    catch (ex) { setErr((ex as Error).message); toast(`Gagal membuat akun: ${(ex as Error).message}`, true); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="addStaffTitle">
      <form className="sheet-in" onSubmit={submit} noValidate>
        <CloseBtn onClick={onClose} />
        <h3 id="addStaffTitle">Tambah karyawan</h3>
        <p className="role-note" style={{ marginTop: 16 }}>
          Catat kata sandi ini dan berikan ke karyawan. Setelah disimpan kata sandi tidak bisa dilihat lagi, hanya bisa diganti.
        </p>
        <div className="field">
          <label htmlFor="stName">Nama</label>
          <input className="input" id="stName" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="stEmail">Email <span className="opt">(dipakai untuk masuk)</span></label>
          <input className="input" id="stEmail" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <PasswordField id="stPw" value={pw} onChange={setPw} />
        {err && <p className="field-err" role="alert">{err}</p>}
        <div className="sheet-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-green" type="submit" disabled={busy}>{busy ? 'Membuat…' : 'Buat akun'}</button>
        </div>
      </form>
    </Sheet>
  );
}

function ResetSheet({ target, onClose, onDone }: { target: StaffMember | null; onClose: () => void; onDone: (name: string) => void }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (target) { setPw(genPassword()); setErr(''); } }, [target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || busy) return;
    if (pw.length < 8) return setErr('Kata sandi minimal 8 karakter.');
    setBusy(true); setErr('');
    try { await resetStaffPassword(target.id, pw); onClose(); onDone(target.name); }
    catch (ex) { setErr((ex as Error).message); toast(`Gagal: ${(ex as Error).message}`, true); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={!!target} onClose={onClose} labelledBy="resetStaffTitle">
      {target && (
        <form className="sheet-in" onSubmit={submit} noValidate>
          <CloseBtn onClick={onClose} />
          <h3 id="resetStaffTitle">Atur ulang kata sandi</h3>
          <p className="role-note" style={{ marginTop: 16 }}>
            {target.name} · {target.email}. Berikan kata sandi baru ke karyawan setelah disimpan.
          </p>
          <PasswordField id="rsPw" value={pw} onChange={setPw} />
          {err && <p className="field-err" role="alert">{err}</p>}
          <div className="sheet-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-green" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan kata sandi'}</button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

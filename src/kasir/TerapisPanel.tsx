import { useCallback, useEffect, useState } from 'react';
import {
  addTherapist, deleteTherapist, listTherapistsAll, renameTherapist, setTherapistActive,
} from './api';
import type { Therapist } from './types';
import { CloseBtn, Sheet, useConfirm, useToast } from './ui';

type Row = Therapist & { active: boolean };

interface Props {
  adding: boolean;
  onAddClose: () => void;
  /** dipanggil setelah daftar berubah, supaya pilihan terapis di Kasir ikut diperbarui */
  onChanged: (active: Therapist[]) => void;
}

export default function TerapisPanel({ adding, onAddClose, onChanged }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await listTherapistsAll();
      setRows(r);
      onChanged(r.filter((x) => x.active).map(({ id, name }) => ({ id, name })));
    } catch (e) { toast(`Gagal memuat terapis: ${(e as Error).message}`, true); }
  }, [toast, onChanged]);
  useEffect(() => { reload(); }, [reload]);

  async function toggle(t: Row, active: boolean) {
    try {
      await setTherapistActive(t.id, active);
      toast(active ? `${t.name} diaktifkan lagi` : `${t.name} dinonaktifkan, tidak muncul di Kasir`);
      await reload();
    } catch (e) { toast(`Gagal: ${(e as Error).message}`, true); }
  }

  async function remove(t: Row) {
    if (!(await confirm({
      title: `Hapus ${t.name}?`,
      message: 'Terapis yang sudah pernah tercatat di transaksi tidak bisa dihapus; nonaktifkan saja.',
      confirmLabel: 'Hapus', danger: true,
    }))) return;
    try {
      await deleteTherapist(t.id);
      toast(`${t.name} dihapus`);
      await reload();
    } catch (e) { toast((e as Error).message, true); }
  }

  return (
    <div className="pad">
      {rows === null ? <p className="empty-cart">Memuat…</p> : rows.length ? (
        <div className="pr-card">
          {rows.map((t) => (
            <div className={`pr-item st-row${t.active ? '' : ' off'}`} key={t.id}>
              <span className="st-av" aria-hidden="true">{t.name.trim().charAt(0).toUpperCase()}</span>
              <div className="st-info"><b>{t.name}</b></div>
              <span className={`tagx ${t.active ? 'on' : 'off'}`}>{t.active ? 'Aktif' : 'Nonaktif'}</span>
              <div className="st-act">
                <button className="btn btn-line btn-sm" type="button" onClick={() => setEditing(t)}>Ubah nama</button>
                <button className="btn btn-line btn-sm" type="button" onClick={() => toggle(t, !t.active)}>{t.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                <button className="btn btn-line btn-sm btn-danger" type="button" onClick={() => remove(t)}>Hapus</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-cart"><b>Belum ada terapis</b>Tekan “Tambah terapis” agar bisa dipilih di Kasir.</p>
      )}

      <NameSheet
        open={adding || !!editing}
        target={editing}
        onClose={() => { setEditing(null); onAddClose(); }}
        onDone={async (msg) => { toast(msg); await reload(); }}
      />
    </div>
  );
}

function NameSheet({ open, target, onClose, onDone }: {
  open: boolean; target: Row | null; onClose: () => void; onDone: (msg: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setName(target?.name ?? ''); setErr(''); } }, [open, target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const n = name.trim();
    if (!n) return setErr('Nama wajib diisi.');
    setBusy(true); setErr('');
    try {
      if (target) await renameTherapist(target.id, n); else await addTherapist(n);
      onClose();
      await onDone(target ? `Nama diubah menjadi ${n}` : `${n} ditambahkan`);
    } catch (ex) { setErr((ex as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="terapisTitle">
      <form className="sheet-in" onSubmit={submit} noValidate>
        <CloseBtn onClick={onClose} />
        <h3 id="terapisTitle">{target ? 'Ubah nama terapis' : 'Tambah terapis'}</h3>
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="tpName">Nama</label>
          <input className="input" id="tpName" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        {err && <p className="field-err" role="alert">{err}</p>}
        <div className="sheet-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-green" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Sheet>
  );
}

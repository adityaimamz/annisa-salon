import { useCallback, useEffect, useRef, useState } from 'react';
import { deletePhoto, loadGallery, removePhotoFiles, savePhoto, uploadPhoto } from './api';
import { kb, processPhoto, type Processed } from './image';
import type { Photo } from './types';
import { CloseBtn, Icon, Sheet, useConfirm, useToast } from './ui';

export default function GaleriView() {
  const toast = useToast();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Photo | 'new' | null>(null);

  const reload = useCallback(async () => {
    try { setPhotos(await loadGallery()); setError(''); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const allCats = [...new Set((photos ?? []).flatMap((p) => p.cats))];

  async function toggle(p: Photo, on: boolean) {
    try {
      await savePhoto({ ...p, off: !on });
      setPhotos((cur) => cur!.map((x) => (x.id === p.id ? { ...x, off: !on } : x)));
      toast(on ? `${p.title} tampil di website` : `${p.title} disembunyikan dari website`);
    } catch (e) { toast(`Gagal menyimpan: ${(e as Error).message}`, true); }
  }

  async function move(i: number, dir: -1 | 1) {
    const list = photos!;
    const a = list[i], b = list[i + dir];
    if (!b) return;
    // tukar nilai sort; kalau kebetulan sama, pakai posisi supaya tetap bergeser
    const sa = a.sort === b.sort ? i + dir : b.sort;
    const sb = a.sort === b.sort ? i : a.sort;
    try {
      await Promise.all([savePhoto({ ...a, sort: sa }), savePhoto({ ...b, sort: sb })]);
      setPhotos((cur) => {
        const next = cur!.map((x) => (x.id === a.id ? { ...x, sort: sa } : x.id === b.id ? { ...x, sort: sb } : x));
        return next.sort((x, y) => x.sort - y.sort);
      });
    } catch (e) { toast(`Gagal memindah: ${(e as Error).message}`, true); }
  }

  return (
    <section className="view" aria-label="Galeri">
      <div className="v-head">
        <div><h1>Galeri</h1>
          <p className="meta">Foto di bagian “Hasil” website. Foto dikompres ke WebP otomatis sebelum diunggah.</p></div>
        <button className="btn btn-green btn-sm" type="button" onClick={() => setEditing('new')}>+ Tambah foto</button>
      </div>
      <div className="pad">
        {error ? <p className="empty-cart"><b>Gagal memuat galeri</b>{error}</p>
          : !photos ? <p className="empty-cart">Memuat…</p>
          : !photos.length ? <p className="empty-cart"><b>Belum ada foto</b>Ketuk “Tambah foto” untuk mulai.</p>
          : (
            <div className="gl-grid">
              {photos.map((p, i) => (
                <div className={`gl-card${p.off ? ' off' : ''}`} key={p.id}>
                  <button type="button" className="gl-img" aria-label={`Ubah ${p.title}`} onClick={() => setEditing(p)}>
                    <img src={p.thumb} alt={p.alt || p.title} loading="lazy" />
                    {p.off && <span className="tagx off">Disembunyikan</span>}
                  </button>
                  <div className="gl-meta">
                    <b>{p.title}</b>
                    <span>{[p.sub, p.cats.join(', ')].filter(Boolean).join(' · ') || '—'}</span>
                  </div>
                  <div className="gl-bar">
                    <label className="switch" title={p.off ? 'Tampilkan di website' : 'Sembunyikan dari website'}>
                      <input type="checkbox" checked={!p.off} aria-label={`${p.title} tampil di website`} onChange={(e) => toggle(p, e.target.checked)} />
                      <span />
                    </label>
                    <span className="gl-move">
                      <button className="icon-btn" type="button" aria-label="Geser ke awal" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button className="icon-btn" type="button" aria-label="Geser ke belakang" disabled={i === photos.length - 1} onClick={() => move(i, 1)}>↓</button>
                      <button className="icon-btn" type="button" aria-label={`Ubah ${p.title}`} onClick={() => setEditing(p)}>{Icon.edit()}</button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      <PhotoEditor
        target={editing}
        allCats={allCats}
        nextSort={Math.max(0, ...(photos ?? []).map((p) => p.sort)) + 1}
        onClose={() => setEditing(null)}
        onDone={async (msg) => { toast(msg); await reload(); }}
      />
    </section>
  );
}

interface EditorProps {
  target: Photo | 'new' | null;
  allCats: string[];
  nextSort: number;
  onClose: () => void;
  onDone: (msg: string) => Promise<void>;
}

function PhotoEditor({ target, allCats, nextSort, onClose, onDone }: EditorProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const p = target && target !== 'new' ? target : null;
  const [title, setTitle] = useState('');
  const [sub, setSub] = useState('');
  const [alt, setAlt] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [newCat, setNewCat] = useState('');
  const [proc, setProc] = useState<Processed | null>(null);
  const [preview, setPreview] = useState('');
  const [reading, setReading] = useState(false);
  const [errs, setErrs] = useState({ title: false, file: false });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!target) return;
    setTitle(p?.title ?? ''); setSub(p?.sub ?? ''); setAlt(p?.alt ?? ''); setCats(p?.cats ?? []);
    setNewCat(''); setProc(null); setPreview(p?.thumb ?? ''); setErrs({ title: false, file: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);

  async function pick(f?: File) {
    if (!f) return;
    setReading(true);
    try {
      const r = await processPhoto(f);
      setProc(r); setPreview(URL.createObjectURL(r.thumb)); setErrs((e) => ({ ...e, file: false }));
    } catch (e) { toast((e as Error).message, true); }
    finally { setReading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const options = [...new Set([...allCats, ...cats])];
  const toggleCat = (c: string, on: boolean) => setCats((cur) => (on ? [...cur, c] : cur.filter((x) => x !== c)));
  const addCat = () => {
    const c = newCat.trim();
    if (c && !cats.some((x) => x.toLowerCase() === c.toLowerCase())) {
      setCats((cur) => [...cur, options.find((o) => o.toLowerCase() === c.toLowerCase()) ?? c]);
    }
    setNewCat('');
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    const bad = { title: !t, file: !p && !proc };
    setErrs(bad);
    if (bad.title || bad.file) return;
    setBusy(true);
    try {
      let image = p?.image ?? '', thumb = p?.thumb ?? '', w = p?.w ?? null, h = p?.h ?? null;
      if (proc) { ({ image, thumb } = await uploadPhoto(proc.full, proc.thumb)); w = proc.width; h = proc.height; }
      const extra = newCat.trim();
      const finalCats = extra && !cats.includes(extra) ? [...cats, extra] : cats;
      const next: Photo = {
        id: p?.id ?? crypto.randomUUID(), title: t, sub: sub.trim(), alt: alt.trim(), cats: finalCats,
        image, thumb, w, h, sort: p?.sort ?? nextSort, off: p?.off ?? false,
      };
      try { await savePhoto(next); }
      catch (err) { if (proc) await removePhotoFiles([image, thumb]); throw err; }
      if (proc && p) await removePhotoFiles([p.image, p.thumb]); // foto lama diganti
      onClose();
      await onDone(p ? `${t} diperbarui` : `${t} ditambahkan`);
    } catch (err) { toast(`Gagal menyimpan: ${(err as Error).message}`, true); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!p || !(await confirm({
      title: `Hapus foto “${p.title}”?`, message: 'Foto dihapus dari website dan tidak bisa dikembalikan.',
      confirmLabel: 'Hapus', danger: true,
    }))) return;
    setBusy(true);
    try { await deletePhoto(p); onClose(); await onDone(`${p.title} dihapus`); }
    catch (err) { toast(`Gagal menghapus: ${(err as Error).message}`, true); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={!!target} onClose={onClose} labelledBy="photoTitle">
      <form className="sheet-in" onSubmit={submit} noValidate>
        <CloseBtn onClick={onClose} />
        <h3 id="photoTitle">{p ? 'Ubah foto' : 'Tambah foto'}</h3>

        <div className="field" style={{ marginTop: 20 }}>
          <span className="label">Foto</span>
          <div className="gl-pick">
            <div className="gl-prev">{preview ? <img src={preview} alt="Pratinjau foto" /> : <span>Belum ada foto</span>}</div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
              <button className="btn btn-line btn-sm" type="button" disabled={reading || busy} onClick={() => fileRef.current?.click()}>
                {reading ? 'Memproses…' : preview ? 'Ganti foto' : 'Pilih foto'}
              </button>
              {proc && (
                <p className="gl-note">{kb(proc.original)} → <b>{kb(proc.full.size)}</b> WebP ({proc.width}×{proc.height}), thumbnail {kb(proc.thumb.size)}</p>
              )}
              {errs.file && <p className="field-err">Pilih foto dulu.</p>}
            </div>
          </div>
        </div>

        <div className="field">
          <label htmlFor="gTitle">Judul</label>
          <input className="input" id="gTitle" placeholder="Misal: Smoothing" value={title} onChange={(e) => setTitle(e.target.value)} />
          {errs.title && <p className="field-err">Judul wajib diisi.</p>}
        </div>
        <div className="field">
          <label htmlFor="gSub">Keterangan <span className="opt">(opsional)</span></label>
          <input className="input" id="gSub" placeholder="Misal: rambut panjang" value={sub} onChange={(e) => setSub(e.target.value)} />
        </div>

        <div className="field">
          <span className="label">Kategori <span className="opt">· jadi tab filter di website</span></span>
          <div className="chips">
            {options.map((c) => (
              <label className="chip" key={c}>
                <input type="checkbox" checked={cats.includes(c)} onChange={(e) => toggleCat(c, e.target.checked)} /><span>{c}</span>
              </label>
            ))}
          </div>
          <div className="gl-addcat">
            <input className="input" placeholder="Kategori baru…" aria-label="Kategori baru" value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } }} />
            <button className="btn btn-line btn-sm" type="button" onClick={addCat} disabled={!newCat.trim()}>Tambah</button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="gAlt">Teks alternatif <span className="opt">(opsional · untuk pembaca layar)</span></label>
          <input className="input" id="gAlt" placeholder="Deskripsikan isi foto" value={alt} onChange={(e) => setAlt(e.target.value)} />
        </div>

        <div className="sheet-actions two" style={p ? undefined : { gridTemplateColumns: '1fr' }}>
          <button className="btn btn-line btn-danger" type="button" hidden={!p} onClick={remove} disabled={busy}>Hapus</button>
          <button className="btn btn-green" type="submit" disabled={busy || reading}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Sheet>
  );
}

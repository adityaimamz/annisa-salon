import { useEffect, useState } from 'react';
import { money, num, rp, slugify } from './format';
import type { BusinessUnit, Category, Item, Variant } from './types';
import { CloseBtn, Icon, Select, Sheet, useConfirm, useToast } from './ui';

interface Props {
  cats: Category[];
  items: Item[];
  onSave: (it: Item) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  readOnly?: boolean; // mode karyawan: hanya melihat daftar harga
}

type Kind = 'layanan' | 'produk';
const isProduk = (it: { cat: string }) => it.cat === 'produk';

export default function HargaView({ cats, items, onSave, onDelete, readOnly = false }: Props) {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('layanan');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Item | 'new' | null>(null);

  const svcItems = items.filter((i) => !isProduk(i));
  const prodItems = items.filter(isProduk);
  const pool = kind === 'layanan' ? svcItems : prodItems;
  const poolCats = cats.filter((c) => (kind === 'produk') === (c.id === 'produk'));
  const activeCat = cat;
  const query = q.trim().toLowerCase();
  const match = (it: Item) =>
    (activeCat === 'all' || it.cat === activeCat) &&
    (!query || (it.name + ' ' + (it.k ?? '')).toLowerCase().includes(query));
  const groups = poolCats.map((c) => [c, pool.filter((it) => it.cat === c.id && match(it))] as const).filter(([, a]) => a.length);
  const switchKind = (k: Kind) => { setKind(k); setCat('all'); };

  async function run(p: Promise<void>, ok: string) {
    try { await p; toast(ok); } catch (e) { toast(`Gagal menyimpan: ${(e as Error).message}`, true); }
  }

  const setPrice = (it: Item, vi: number, v: number) => {
    const next: Item = vi < 0
      ? { ...it, price: v }
      : { ...it, variants: it.variants!.map((x, i): Variant => (i === vi ? [x[0], v] : x)) };
    return run(onSave(next), `Harga ${it.name}${vi >= 0 ? ' · ' + it.variants![vi][0] : ''} jadi ${rp(v)}`);
  };

  const setWebPrice = (it: Item, v: number) =>
    run(onSave({ ...it, webPrice: v }), `Harga website ${it.name} jadi ${rp(v)}`);

  return (
    <section className="view" aria-label="Harga">
      <div className="v-head">
        <div><h1>Harga</h1>
          <p className="meta">
            {readOnly
              ? 'Daftar harga Kasir. Perubahan harga hanya bisa dilakukan pemilik.'
              : kind === 'layanan'
              ? 'Harga layanan dipakai di Kasir dan tampil di daftar layanan website.'
              : 'Harga Kasir dan harga website produk diatur terpisah. Produk muncul di landing dan halaman Produk.'}
          </p></div>
        {!readOnly && (
          <button className="btn btn-green btn-sm" type="button" onClick={() => setEditing('new')}>
            {kind === 'layanan' ? '+ Tambah layanan' : '+ Tambah produk'}
          </button>
        )}
      </div>
      <div className="pad">
        <div className="kind-tabs" role="tablist" aria-label="Jenis item">
          <button role="tab" type="button" aria-selected={kind === 'layanan'} onClick={() => switchKind('layanan')}>
            Layanan<span className="n">{svcItems.length}</span>
          </button>
          <button role="tab" type="button" aria-selected={kind === 'produk'} onClick={() => switchKind('produk')}>
            Produk<span className="n">{prodItems.length}</span>
          </button>
        </div>
        <div className="pr-tools">
          <label className="search">
            {Icon.search()}
            <input className="input" type="search" placeholder={kind === 'layanan' ? 'Cari layanan…' : 'Cari produk…'} autoComplete="off"
              aria-label={kind === 'layanan' ? 'Cari layanan' : 'Cari produk'} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {poolCats.length > 1 && (
            <div className="tabs" role="group" aria-label="Kategori">
              <button className="tab" aria-pressed={activeCat === 'all'} onClick={() => setCat('all')}>Semua</button>
              {poolCats.map((c) => <button key={c.id} className="tab" aria-pressed={activeCat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>)}
            </div>
          )}
        </div>

        {groups.length ? groups.map(([c, arr]) => (
          <section className="pr-group" key={c.id}>
            <h2>{c.name} · {arr.length}</h2>
            <div className={`pr-card${readOnly ? ' ro' : ''}`}>
              {arr.map((it) => (
                <div className={`pr-item ${it.off ? 'off' : ''}`} key={it.id}>
                  <div className="pr-main">
                    <div className="pr-name">
                      <b>{it.name}</b>{it.k && <span className="k">{it.k}</span>}
                      <span className="tags">
                        {it.unit === 'gbee' && <span className="tagx gbee" style={{ background: '#fdf2f8', color: '#db2777', borderColor: '#fbcfe8' }}>✨ Gbee</span>}
                        {it.off && <span className="tagx off">Disembunyikan</span>}
                      </span>
                    </div>
                    {it.variants
                      ? <span className="pr-vlabel">{it.variants.length} pilihan · {it.vlabel ?? ''}</span>
                      : readOnly
                        ? <span className="pr-price">{rp(it.price ?? 0)}</span>
                        : <MoneyInput value={it.price ?? 0} label={it.name} onCommit={(v) => setPrice(it, -1, v)} />}
                    {!readOnly && (
                      <>
                        <label className="switch" title={it.off ? 'Tampilkan di Kasir dan website' : 'Sembunyikan dari Kasir dan website'}>
                          <input type="checkbox" checked={!it.off} aria-label={`${it.name} tampil di Kasir dan website`}
                            onChange={(e) => run(onSave({ ...it, off: !e.target.checked }), e.target.checked ? `${it.name} tampil lagi di Kasir dan website` : `${it.name} disembunyikan dari Kasir dan website`)} />
                          <span />
                        </label>
                        <button className="icon-btn" type="button" aria-label={`Ubah ${it.name}`} onClick={() => setEditing(it)}>{Icon.edit()}</button>
                      </>
                    )}
                  </div>
                  {!readOnly && it.cat === 'produk' && !it.variants && (
                    <div className="pr-vars">
                      <div className="pr-var">
                        <span>Harga di website <small style={{ color: 'var(--ink-3)' }}>· landing &amp; halaman Produk</small></span>
                        <MoneyInput value={it.webPrice ?? it.price ?? 0} label={`${it.name} di website`} onCommit={(v) => setWebPrice(it, v)} />
                        <span className="sp" /><span className="sp" />
                      </div>
                    </div>
                  )}
                  {it.variants && (
                    <div className="pr-vars">
                      {it.variants.map((v, i) => (
                        <div className="pr-var" key={v[0]}>
                          <span>{v[0]}</span>
                          {readOnly
                            ? <span className="pr-price">{rp(v[1])}</span>
                            : <MoneyInput value={v[1]} label={`${it.name} ${v[0]}`} onCommit={(n) => setPrice(it, i, n)} />}
                          <span className="sp" /><span className="sp" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )) : <p className="empty-cart">Tidak ada item yang cocok.</p>}
      </div>

      {!readOnly && <ItemEditor
        target={editing}
        kind={kind}
        cats={poolCats}
        defaultCat={activeCat !== 'all' ? activeCat : (poolCats[0]?.id ?? 'rambut')}
        nextSort={Math.max(0, ...items.map((i) => i.sort)) + 1}
        onClose={() => setEditing(null)}
        onSave={async (it, isNew) => { await onSave(it); toast(isNew ? `${it.name} ditambahkan` : `${it.name} diperbarui`); }}
        onDelete={async (it) => { await onDelete(it.id); toast(`${it.name} dihapus`); }}
      />}
    </section>
  );
}

function MoneyInput({ value, label, onCommit }: { value: number; label: string; onCommit: (v: number) => void }) {
  const [text, setText] = useState(money(value));
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(money(value)), [value]);
  const commit = () => {
    const v = num(text);
    if (!v) { setText(money(value)); return; }
    if (v === value) return;
    setSaved(true);
    onCommit(v);
    window.setTimeout(() => setSaved(false), 1200);
  };
  return (
    <label className="money"><span>Rp</span>
      <input className={`input${saved ? ' saved' : ''}`} inputMode="numeric" value={text} aria-label={`Harga ${label}`}
        onChange={(e) => { setText(money(num(e.target.value))); setSaved(false); }}
        onFocus={(e) => e.target.select()}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

interface EditorProps {
  target: Item | 'new' | null;
  kind: Kind;
  cats: Category[];
  defaultCat: string;
  nextSort: number;
  onClose: () => void;
  onSave: (it: Item, isNew: boolean) => Promise<void>;
  onDelete: (it: Item) => Promise<void>;
}

function ItemEditor({ target, kind, cats, defaultCat, nextSort, onClose, onSave, onDelete }: EditorProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const it = target && target !== 'new' ? target : null;
  const noun = kind === 'layanan' ? 'layanan' : 'produk';
  const [name, setName] = useState('');
  const [catId, setCatId] = useState('rambut');
  const [unit, setUnit] = useState<BusinessUnit>('salon');
  const [k, setK] = useState('');
  const [desc, setDesc] = useState('');
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [price, setPrice] = useState('');
  const [webPrice, setWebPrice] = useState('');
  const [vlabel, setVlabel] = useState('');
  const [vars, setVars] = useState<[string, string][]>([['', ''], ['', '']]);
  const [errs, setErrs] = useState({ name: false, price: false, vars: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    setName(it?.name ?? ''); setCatId(it?.cat ?? defaultCat); setK(it?.k ?? ''); setDesc(it?.desc ?? '');
    setUnit(it?.unit ?? (kind === 'produk' || it?.cat === 'produk' ? 'gbee' : 'salon'));
    setMode(it?.variants ? 'multi' : 'single'); setPrice(it?.price ? money(it.price) : '');
    setWebPrice(it?.webPrice ? money(it.webPrice) : '');
    setVlabel(it?.vlabel ?? '');
    setVars(it?.variants ? it.variants.map(([n, p]) => [n, money(p)]) : [['', ''], ['', '']]);
    setErrs({ name: false, price: false, vars: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const p = num(price);
    const vs = vars.map(([a, b]) => [a.trim(), num(b)] as Variant).filter(([a, b]) => a || b);
    const bad = {
      name: !n,
      price: mode === 'single' && !p,
      vars: mode === 'multi' && (!vs.length || vs.some(([a, b]) => !a || !b)),
    };
    setErrs(bad);
    if (bad.name || bad.price || bad.vars) return;
    const base = {
      id: it?.id ?? `${slugify(n)}-${Date.now().toString(36)}`,
      cat: catId, name: n, k: k.trim() || undefined, service: catId !== 'produk',
      unit,
      desc: catId !== 'produk' ? desc.trim() || undefined : it?.desc,
      off: it?.off ?? false, sort: it?.sort ?? nextSort,
    };
    const next: Item = mode === 'single'
      ? { ...base, price: p, webPrice: catId === 'produk' && num(webPrice) ? num(webPrice) : undefined }
      : { ...base, variants: vs, vlabel: vlabel.trim() || 'Pilihan', opts: it?.opts };
    setBusy(true);
    try { await onSave(next, !it); onClose(); }
    catch (err) { toast(`Gagal menyimpan: ${(err as Error).message}`, true); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!it || !(await confirm({
      title: `Hapus ${it.name}?`,
      message: 'Dihapus dari Kasir dan website. Riwayat transaksi lama tidak berubah.',
      confirmLabel: 'Hapus', danger: true,
    }))) return;
    setBusy(true);
    try { await onDelete(it); onClose(); }
    catch (err) { toast(`Gagal menghapus: ${(err as Error).message}`, true); }
    finally { setBusy(false); }
  }

  const setVar = (i: number, j: 0 | 1, v: string) =>
    setVars((c) => c.map((r, idx) => (idx === i ? (j === 0 ? [v, r[1]] : [r[0], money(num(v))]) : r)) as [string, string][]);

  return (
    <Sheet open={!!target} onClose={onClose} labelledBy="itemTitle">
      <form className="sheet-in" onSubmit={submit} noValidate>
        <CloseBtn onClick={onClose} />
        <h3 id="itemTitle">{it ? `Ubah ${noun}` : `Tambah ${noun}`}</h3>
        <div className="field" style={{ marginTop: 20 }}>
          <label htmlFor="fName">Nama</label>
          <input className="input" id="fName" placeholder={kind === 'layanan' ? 'Misal: Keratin treatment' : 'Misal: Day Cream Pink'} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {errs.name && <p className="field-err">Nama wajib diisi.</p>}
        </div>
        <div className={`field${cats.length > 1 ? ' row2' : ''}`}>
          {cats.length > 1 && (
            <div><label htmlFor="fCat">Kategori</label>
              <Select className="input" id="fCat" value={catId} onChange={setCatId}
                options={cats.map((c) => ({ value: c.id, label: c.name }))} /></div>
          )}
          <div><label htmlFor="fK">Keterangan <span className="opt">(opsional)</span></label>
            <input className="input" id="fK" placeholder={kind === 'layanan' ? 'Misal: by Gbee' : 'Misal: 60 ml'} value={k} onChange={(e) => setK(e.target.value)} /></div>
        </div>
        <div className="field">
          <span className="label">Unit Bisnis Arus Kas</span>
          <div className="chips">
            <label className="chip"><input type="radio" name="funit" checked={unit === 'salon'} onChange={() => setUnit('salon')} /><span>💇 Salon</span></label>
            <label className="chip"><input type="radio" name="funit" checked={unit === 'gbee'} onChange={() => setUnit('gbee')} /><span>✨ Gbee</span></label>
          </div>
        </div>
        {kind === 'layanan' && (
          <div className="field">
            <label htmlFor="fDesc">Deskripsi di website <span className="opt">(opsional)</span></label>
            <textarea className="input" id="fDesc" rows={2} placeholder="Kalimat singkat di bawah nama layanan" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        )}
        <div className="field">
          <span className="label">Harga{kind === 'layanan' && <span className="opt"> · dipakai di Kasir dan tampil di website</span>}</span>
          <div className="chips">
            <label className="chip"><input type="radio" name="fmode" checked={mode === 'single'} onChange={() => setMode('single')} /><span>Satu harga</span></label>
            <label className="chip"><input type="radio" name="fmode" checked={mode === 'multi'} onChange={() => setMode('multi')} /><span>Beberapa pilihan</span></label>
          </div>
        </div>
        {mode === 'single' ? (
          <div className="field">
            <label className="money"><span>Rp</span>
              <input className="input" inputMode="numeric" placeholder="0" aria-label="Harga" value={price} onChange={(e) => setPrice(money(num(e.target.value)))} /></label>
            {errs.price && <p className="field-err">Isi harga.</p>}
          </div>
        ) : null}
        {mode === 'single' && catId === 'produk' ? (
          <div className="field">
            <label htmlFor="fWeb">Harga di website <span className="opt">(kosong = ikut harga kasir)</span></label>
            <label className="money"><span>Rp</span>
              <input className="input" id="fWeb" inputMode="numeric" placeholder="0" value={webPrice} onChange={(e) => setWebPrice(money(num(e.target.value)))} /></label>
          </div>
        ) : null}
        {mode === 'single' ? null : (
          <div className="field">
            <label htmlFor="fVlabel">Nama pilihan</label>
            <input className="input" id="fVlabel" placeholder="Misal: Panjang rambut" style={{ marginBottom: 10 }} value={vlabel} onChange={(e) => setVlabel(e.target.value)} />
            <div className="var-edit">
              {vars.map((r, i) => (
                <div className="var-edit-row" key={i}>
                  <input className="input" placeholder="Nama pilihan" aria-label="Nama pilihan" value={r[0]} onChange={(e) => setVar(i, 0, e.target.value)} />
                  <label className="money"><span>Rp</span>
                    <input className="input" inputMode="numeric" placeholder="0" aria-label="Harga pilihan" value={r[1]} onChange={(e) => setVar(i, 1, e.target.value)} /></label>
                  <button className="icon-btn" type="button" aria-label="Hapus pilihan" onClick={() => vars.length > 1 && setVars((c) => c.filter((_, idx) => idx !== i))}>{Icon.close()}</button>
                </div>
              ))}
            </div>
            <button className="linkbtn add" type="button" onClick={() => setVars((c) => [...c, ['', '']])}>+ Tambah pilihan</button>
            {errs.vars && <p className="field-err">Isi nama dan harga setiap pilihan.</p>}
          </div>
        )}
        <div className="sheet-actions two" style={it ? undefined : { gridTemplateColumns: '1fr' }}>
          <button className="btn btn-line btn-danger" type="button" hidden={!it} onClick={remove} disabled={busy}>Hapus</button>
          <button className="btn btn-green" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </Sheet>
  );
}

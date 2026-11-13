import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode,
} from 'react';
import { fmtDay, fmtTime, rp } from './format';
import type { Tx } from './types';

/* ---------- toast ---------- */
type ToastFn = (msg: string, isError?: boolean) => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; err: boolean; on: boolean }>({ msg: '', err: false, on: false });
  const timer = useRef<number>(0);
  const toast = useCallback<ToastFn>((msg, err = false) => {
    setT({ msg, err, on: true });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setT((x) => ({ ...x, on: false })), err ? 4200 : 2200);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className={`toast${t.on ? ' on' : ''}${t.err ? ' err' : ''}`} role="status">{t.msg}</div>
    </ToastCtx.Provider>
  );
}

/* ---------- ikon ---------- */
const svg = (d: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{d}</svg>
);
export const Icon = {
  kasir: (s = 18) => svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 14h3" /></>, s),
  transaksi: (s = 18) => svg(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></>, s),
  keuangan: (s = 18) => svg(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />, s),
  pengeluaran: (s = 18) => svg(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></>, s),
  harga: (s = 18) => svg(<><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="7.5" cy="8.5" r="1.5" /></>, s),
  galeri: (s = 18) => svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5-8 9" /></>, s),
  karyawan: (s = 18) => svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2.2.7 3.5 2.6 3.5 5.6" /></>, s),
  pengaturan: (s = 18) => svg(<><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>, s),
  back: (s = 18) => svg(<path d="M19 12H5M11 6l-6 6 6 6" />, s),
  search: () => svg(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>),
  close: () => svg(<path d="M6 6l12 12M18 6L6 18" />, 16),
  edit: () => svg(<path d="M4 20h4L19 9l-4-4L4 16v4z" />, 16),
};

/* ---------- dialog ---------- */
export function Sheet({
  open, onClose, labelledBy, children, className = '',
}: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  // simpan isi terakhir supaya animasi keluar tidak menampilkan kartu kosong
  const last = useRef<ReactNode>(null);
  const [closing, setClosing] = useState(false);
  if (open) last.current = children;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      setClosing(false);
      if (!d.open) d.showModal();
      return;
    }
    if (!d.open) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { d.close(); return; }
    setClosing(true);
    const t = window.setTimeout(() => { d.close(); setClosing(false); }, 150);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sheet ${className}`.trim()}
      data-closing={closing || undefined}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {(open || closing) && last.current}
    </dialog>
  );
}

/* ---------- konfirmasi (pengganti window.confirm) ---------- */
interface ConfirmOpts { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean }
type ConfirmFn = (o: ConfirmOpts) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn>(() => Promise.resolve(false));
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const ask = useCallback<ConfirmFn>((o) => new Promise<boolean>((res) => {
    resolver.current?.(false);
    resolver.current = res;
    setOpts(o);
  }), []);
  const done = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Sheet open={!!opts} onClose={() => done(false)} labelledBy="confirmTitle">
        {opts && (
          <div className="sheet-in confirm" role="alertdialog" aria-describedby="confirmMsg">
            <h3 id="confirmTitle">{opts.title}</h3>
            <p id="confirmMsg" className="confirm-msg">{opts.message}</p>
            <div className="sheet-actions eq">
              <button className="btn btn-line" type="button" onClick={() => done(false)}>Batal</button>
              <button className={`btn ${opts.danger ? 'btn-red' : 'btn-green'}`} type="button" onClick={() => done(true)}>
                {opts.confirmLabel ?? 'Ya'}
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </ConfirmCtx.Provider>
  );
}

/* ---------- dropdown ---------- */
export interface SelectOption { value: string; label: string }
interface SelectPos { left: number; width: number; top?: number; bottom?: number; maxH: number; up: boolean }

export function Select({
  value, onChange, options, placeholder = 'Pilih', id, className = '', ariaLabel, searchable = false,
}: {
  value: string; onChange: (v: string) => void; options: SelectOption[]; placeholder?: string;
  id?: string; className?: string; ariaLabel?: string; searchable?: boolean;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const ul = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<SelectPos>({ left: 0, width: 0, maxH: 280, up: false });
  const sel = options.findIndex((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const view = searchable && q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const shown = open || closing;

  const place = () => {
    const r = btn.current!.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 14;
    const above = r.top - 14;
    const need = Math.min(options.length * 40 + 10, 280);
    const up = below < need && above > below;
    const width = Math.max(r.width, 180);
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width, up,
      top: up ? undefined : r.bottom + 6,
      bottom: up ? window.innerHeight - r.top + 6 : undefined,
      maxH: Math.max(120, Math.min(280, up ? above : below)),
    });
  };

  const openList = () => {
    place();
    setQuery('');
    setActive(sel >= 0 ? sel : 0);
    setClosing(false);
    setOpen(true);
  };
  const closeList = useCallback(() => {
    setOpen(false);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setClosing(true);
  }, []);

  // animasi keluar: biarkan 100ms, lalu lepas dari top layer
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => setClosing(false), 100);
    return () => window.clearTimeout(t);
  }, [closing]);

  // popover (top layer) supaya tidak terpotong dialog/keranjang
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    if (shown && !el.matches(':popover-open')) el.showPopover();
    return () => { if (el.matches(':popover-open')) el.hidePopover(); };
  }, [shown]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !list.current?.contains(t)) closeList();
    };
    const scroll = (e: Event) => { if (!list.current?.contains(e.target as Node)) closeList(); };
    document.addEventListener('pointerdown', away);
    window.addEventListener('resize', closeList);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('resize', closeList);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open, closeList]);

  useEffect(() => {
    if (open) (ul.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  // kolom cari langsung aktif saat daftar terbuka
  useEffect(() => { if (open && searchable) search.current?.focus({ preventScroll: true }); }, [open, searchable]);

  const pick = (i: number) => {
    const o = view[i];
    if (o) onChange(o.value);
    closeList();
    btn.current?.focus();
  };

  function onKey(e: React.KeyboardEvent) {
    const n = view.length;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeList(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (n) setActive((a) => (a + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) setActive((a) => (a - 1 + n) % n); }
    else if (!searchable && e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (!searchable && e.key === 'End') { e.preventDefault(); setActive(n - 1); }
    else if (e.key === 'Enter' || (!searchable && e.key === ' ')) { e.preventDefault(); pick(active); }
    else if (e.key === 'Tab') closeList();
  }

  return (
    <>
      <button
        ref={btn} id={id} type="button" role="combobox"
        className={`select ${className}`}
        aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${uid}-list`}
        aria-activedescendant={open ? `${uid}-${active}` : undefined}
        onClick={() => (open ? closeList() : openList())} onKeyDown={onKey}
      >
        <span className={`sel-val${sel < 0 ? ' ph' : ''}`}>{sel >= 0 ? options[sel].label : placeholder}</span>
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M1 1.5l5 5 5-5" /></svg>
      </button>
      {shown && (
        <div
          ref={list} popover="manual"
          className={`sel-list${pos.up ? ' up' : ''}${searchable ? ' has-search' : ''}`} data-closing={!open || undefined}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
        >
          {searchable && (
            <input
              ref={search} type="search" className="sel-search" placeholder="Cari…" aria-label="Cari pilihan" autoComplete="off"
              value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey}
            />
          )}
          <ul ref={ul} id={`${uid}-list`} role="listbox" className="sel-ul">
            {view.map((o, i) => (
              <li
                key={o.value} id={`${uid}-${i}`} role="option" className="sel-opt"
                aria-selected={o.value === value} data-active={i === active || undefined}
                onPointerMove={() => setActive(i)} onClick={() => pick(i)}
              >
                <span>{o.label}</span>
                {o.value === value && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
              </li>
            ))}
            {!view.length && <li className="sel-empty" role="presentation">Tidak ditemukan</li>}
          </ul>
        </div>
      )}
    </>
  );
}

export const CloseBtn = ({ onClick }: { onClick: () => void }) => (
  <button className="x" type="button" onClick={onClick} aria-label="Tutup">{Icon.close()}</button>
);

/* ---------- struk ---------- */
function receiptText(t: Tx) {
  return [
    '*An-Nisa Muslimah Salon*',
    `${t.no} · ${fmtDay(t.at, { day: 'numeric', month: 'short', year: 'numeric' })} ${fmtTime(t.at)}`,
    '',
    ...t.lines.map((l) => `${l.qty}x ${l.name} = ${rp(l.price * l.qty)}`),
    '',
    t.disc ? `Diskon: -${rp(t.disc)}` : null,
    `*Total: ${rp(t.total)}* (${t.pay})`,
    '',
    'Terima kasih, sampai jumpa lagi 🌿',
  ].filter((x) => x !== null).join('\n');
}

export function ReceiptSheet({ tx, fresh, onClose, onEdit, onDelete }: {
  tx: Tx | null; fresh: boolean; onClose: () => void; onEdit?: (t: Tx) => void; onDelete?: (t: Tx) => void;
}) {
  const t = tx;
  const wa = (t?.wa ?? '').replace(/\D/g, '').replace(/^0/, '62');
  const href = t ? `https://wa.me/${wa}?text=${encodeURIComponent(receiptText(t))}` : '#';
  return (
    <Sheet open={!!t} onClose={onClose} labelledBy="okTitle">
      {t && (
        <div className="sheet-in">
          <CloseBtn onClick={onClose} />
          {fresh && (
            <div className="ok-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path className="tick" pathLength={1} d="M5 12l5 5 9-10" /></svg>
            </div>
          )}
          <h3 id="okTitle">{fresh ? 'Pembayaran berhasil' : 'Detail transaksi'}</h3>
          {t.no.startsWith('OFFLINE-') && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink-2)' }}>
              Tersimpan di perangkat. Nomor struk resmi dibuat setelah terkirim saat online.
            </p>
          )}
          <div className="receipt">
            <div className="c"><b>AN-NISA MUSLIMAH SALON</b><br />Jl. Teuku Umar No.58, Tegal<br />0857-2895-8582</div>
            <hr />
            <div className="r"><span>{t.no}</span><span>{fmtDay(t.at, { day: '2-digit', month: '2-digit', year: 'numeric' })} {fmtTime(t.at)}</span></div>
            <div className="r"><span>Pelanggan</span><span>{t.cust || '-'}</span></div>
            <div className="r"><span>Kasir</span><span>{t.kasir}</span></div>
            <hr />
            {t.lines.map((l, i) => (
              <div key={i}>
                <div>{l.name}{l.terapis && <span style={{ color: 'var(--ink-3)' }}> ({l.terapis})</span>}</div>
                <div className="r">
                  <span>&nbsp;&nbsp;{l.qty} × {rp(l.price).replace('Rp', '')}</span>
                  <span>{rp(l.price * l.qty).replace('Rp', '')}</span>
                </div>
              </div>
            ))}
            <hr />
            <div className="r"><span>Subtotal</span><span>{rp(t.sub)}</span></div>
            {t.disc > 0 && <div className="r"><span>Diskon</span><span>-{rp(t.disc)}</span></div>}
            <div className="r big"><span>TOTAL</span><span>{rp(t.total)}</span></div>
            <div className="r"><span>{t.pay}</span><span>{t.cash ? rp(t.cash) : ''}</span></div>
            {t.cash > 0 && <div className="r"><span>Kembali</span><span>{rp(t.cash - t.total)}</span></div>}
            <hr />
            <div className="c">Terima kasih, sampai jumpa lagi 🌿</div>
          </div>
          <div className="sheet-actions">
            <a className="btn btn-line" href={href} target="_blank" rel="noopener">Kirim struk ke WhatsApp</a>
            {fresh && <button className="btn btn-green" type="button" onClick={onClose}>Transaksi baru</button>}
            {!fresh && onEdit && <button className="btn btn-line" type="button" onClick={() => onEdit(t)}>Edit terapis &amp; pelanggan</button>}
            {!fresh && onDelete && <button className="btn btn-line btn-danger" type="button" onClick={() => onDelete(t)}>Hapus transaksi</button>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

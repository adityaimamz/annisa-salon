import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
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
  harga: (s = 18) => svg(<><path d="M3 12V4h8l10 10-8 8L3 12z" /><circle cx="7.5" cy="8.5" r="1.5" /></>, s),
  back: (s = 18) => svg(<path d="M19 12H5M11 6l-6 6 6 6" />, s),
  search: () => svg(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>),
  close: () => svg(<path d="M6 6l12 12M18 6L6 18" />, 16),
  edit: () => svg(<path d="M4 20h4L19 9l-4-4L4 16v4z" />, 16),
};

/* ---------- dialog ---------- */
export function Sheet({
  open, onClose, labelledBy, children,
}: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {open && children}
    </dialog>
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

export function ReceiptSheet({ tx, fresh, onClose }: { tx: Tx | null; fresh: boolean; onClose: () => void }) {
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
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12l5 5 9-10" /></svg>
            </div>
          )}
          <h3 id="okTitle">{fresh ? 'Pembayaran berhasil' : 'Detail transaksi'}</h3>
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
          </div>
        </div>
      )}
    </Sheet>
  );
}

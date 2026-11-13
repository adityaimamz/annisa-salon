import { useCallback, useEffect, useMemo, useState } from 'react';
import { createTransaction, loadMembers } from './api';
import { MemberPicker, MemberTags } from './MemberKit';
import { MEMBER_GOAL, fmtDate, memberStat } from './member';
import { enqueue, isNetworkError } from './offline';
import { money, num, rp, rpk } from './format';
import type { CartLine, Category, Item, Member, PayMethod, Profile, Therapist, Tx } from './types';
import { CloseBtn, Icon, ReceiptSheet, Select, Sheet, useToast } from './ui';

const eff = (l: CartLine) => (l.free ? 0 : l.price);

const priceLabel = (it: Item) => {
  if (it.price) return rp(it.price);
  const ps = (it.variants ?? []).map((v) => v[1]);
  if (!ps.length) return '–';
  const lo = Math.min(...ps), hi = Math.max(...ps);
  return lo === hi ? rp(lo) : rp(lo) + '+';
};

interface Props {
  cats: Category[];
  items: Item[];
  therapists: Therapist[];
  profile: Profile;
  onPaid: () => void;
  onQueued: () => void;
}

export default function KasirView({ cats, items, therapists, profile, onPaid, onQueued }: Props) {
  const toast = useToast();
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cust, setCust] = useState('');
  const [wa, setWa] = useState('');
  const [disc, setDisc] = useState('');
  const [discMode, setDiscMode] = useState<'rp' | 'pct'>('rp');
  const [cashIn, setCashIn] = useState('');
  const [pay, setPay] = useState<PayMethod>('Tunai');
  const [variantItem, setVariantItem] = useState<Item | null>(null);
  const [opt, setOpt] = useState('');
  const [receipt, setReceipt] = useState<Tx | null>(null);
  const [paying, setPaying] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const refreshMembers = useCallback(async () => {
    try { const m = await loadMembers(); setMembers(m); return m; } catch { return null; }
  }, []);
  useEffect(() => { void refreshMembers(); }, [refreshMembers]);
  const member = members.find((m) => m.id === memberId) ?? null;
  const mstat = member ? memberStat(member) : null;

  const q = query.trim().toLowerCase();
  const list = useMemo(
    () => items.filter((it) => !it.off && (cat === 'all' || it.cat === cat) &&
      (!q || (it.name + ' ' + (it.k ?? '')).toLowerCase().includes(q))),
    [items, cat, q],
  );
  const qtyOf = (id: string) => cart.filter((l) => l.id === id).reduce((a, l) => a + l.qty, 0);
  const groups: [Category | null, Item[]][] =
    cat === 'all' && !q ? cats.map((c) => [c, list.filter((i) => i.cat === c.id)]) : [[null, list]];

  const sub = cart.reduce((a, l) => a + eff(l) * l.qty, 0);
  const discount = discMode === 'pct'
    ? Math.round((sub * Math.min(num(disc), 100)) / 100)
    : Math.min(num(disc), sub);
  const total = sub - discount;
  const subSalon = cart.filter((l) => (l.unit ?? (l.cat === 'produk' ? 'gbee' : 'salon')) === 'salon').reduce((a, l) => a + eff(l) * l.qty, 0);
  const subGbee = sub - subSalon;
  const discSalon = sub ? Math.round((discount * subSalon) / sub) : 0;
  const totSalon = Math.max(0, subSalon - discSalon);
  const totGbee = Math.max(0, subGbee - (discount - discSalon));
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const cash = num(cashIn);
  const change = cash - total;
  const missingTherapist = cart.some((l) => l.service && !l.terapis);
  const ok = cart.length > 0 && !missingTherapist && (pay !== 'Tunai' || cash >= total);
  let hint = '';
  if (cart.length) {
    if (missingTherapist) hint = 'Pilih terapis untuk setiap layanan.';
    else if (pay === 'Tunai' && cash < total) hint = cash ? 'Uang diterima kurang dari total.' : '';
  }
  const quick = [...new Set([total, Math.ceil(total / 50000) * 50000, Math.ceil(total / 100000) * 100000,
    Math.ceil(total / 100000) * 100000 + 100000].filter((v) => v > 0))].slice(0, 4);

  function addLine(it: Item, name: string, price: number) {
    const key = it.id + '|' + name;
    const unit = it.unit ?? (it.cat === 'produk' ? 'gbee' : 'salon');
    setCart((c) => {
      const ex = c.find((l) => l.key === key);
      if (ex && !it.service) return c.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key, id: it.id, cat: it.cat, name, price, qty: 1, unit, terapis: '', service: it.service }];
    });
    toast(`${name} ditambahkan`);
  }

  function pickItem(it: Item) {
    if (it.variants?.length) {
      setOpt(it.opts?.[0] ?? '');
      setVariantItem(it);
    } else if (it.price) {
      addLine(it, it.name + (it.cat === 'produk' && it.k ? ' ' + it.k : ''), it.price);
    }
  }

  function pickVariant(it: Item, v: string, p: number) {
    const base = opt ? `Facial ${opt}` : it.name;
    addLine(it, `${base} · ${v}`, p);
    setVariantItem(null);
  }

  const step = (i: number, d: number) =>
    setCart((c) => c.flatMap((l, idx) => (idx !== i ? [l] : l.qty + d < 1 ? [] : [{ ...l, qty: l.qty + d, free: l.free && l.qty + d === 1 }])));

  const hasService = cart.some((l) => l.service);
  const hasFree = cart.some((l) => l.free);
  const toggleFree = (i: number) =>
    setCart((c) => c.map((l, idx) => ({ ...l, free: idx === i ? !l.free : false })));

  function pickMember(m: Member) {
    if (memberStat(m).expired) { toast(`Member ${m.name} sudah kedaluwarsa. Daftarkan sebagai member baru.`, true); return; }
    setMemberId(m.id); setPickerOpen(false);
    setCust(m.name); if (m.wa) setWa(m.wa);
    setMembers((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
    void refreshMembers();
  }
  function clearMember() {
    setMemberId(null);
    setCart((c) => c.map((l) => ({ ...l, free: false })));
  }

  async function doPay() {
    if (!ok || paying) return;
    setPaying(true);
    const clientId = crypto.randomUUID();
    const createdAt = Date.now();
    const memberFree = hasFree && !!member;
    const payLines = cart.map((l) => (l.free && member ? { ...l, price: 0, name: `${l.name} (Gratis member)` } : l));
    const input = {
      customer: cust.trim(), wa: wa.trim(), discount, pay, cash: pay === 'Tunai' ? cash : 0,
      lines: payLines, cashierName: profile.name, clientId, createdAt,
      memberId: member?.id, memberFree,
    };
    const lines = payLines.map((l) => ({
      id: l.id, cat: l.cat, name: l.name, price: l.price, qty: l.qty,
      terapis: therapists.find((t) => String(t.id) === l.terapis)?.name ?? null,
    }));
    const reset = () => {
      setCart([]); setCust(''); setWa(''); setMemberId(null); setDisc(''); setDiscMode('rp'); setCashIn(''); setPay('Tunai');
      setCartOpen(false);
    };
    try {
      let tx: Tx;
      try {
        tx = await createTransaction(input);
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        // Tanpa koneksi: simpan di perangkat, dikirim otomatis saat online lagi.
        await enqueue({ ...input, userId: profile.id });
        tx = {
          id: -1, no: 'OFFLINE-' + clientId.slice(0, 6).toUpperCase(), at: createdAt, cust: input.customer, wa: input.wa,
          sub, disc: discount, total, pay, cash: input.cash, kasir: profile.name, lines: [],
        };
        toast('Tidak ada koneksi. Transaksi disimpan di perangkat dan dikirim otomatis saat online.');
        onQueued();
      }
      tx.lines = lines;
      const paidMember = member;
      reset();
      setReceipt(tx);
      onPaid();
      if (paidMember && tx.id !== -1 && (hasService || memberFree)) {
        void refreshMembers().then((list) => {
          const m = list?.find((x) => x.id === paidMember.id);
          if (m) toast(memberFree ? `Treatment gratis ${m.name} tercatat` : `Cap ${m.name}: ${memberStat(m).cycle}/${MEMBER_GOAL}`);
        });
      }
    } catch (e) {
      toast(`Gagal menyimpan transaksi: ${(e as Error).message}`, true);
    } finally {
      setPaying(false);
    }
  }

  return (
    <section className="view" style={{ overflow: 'hidden' }} aria-label="Kasir">
      <div className="pos">
        <div className="catalog">
          <div className="cat-tools">
            <label className="search">
              {Icon.search()}
              <input className="input" type="search" placeholder="Cari layanan atau produk…" autoComplete="off"
                aria-label="Cari layanan atau produk" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <div className="tabs" role="group" aria-label="Kategori">
              <button className="tab" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>Semua</button>
              {cats.map((c) => (
                <button key={c.id} className="tab" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>
              ))}
            </div>
          </div>
          <div className="items" key={cat}>
            {list.length ? groups.map(([c, arr]) => (
              <Group key={c?.id ?? 'all'} label={c?.name}>
                {arr.map((it) => {
                  const n = qtyOf(it.id);
                  return (
                    <button key={it.id} className="item" type="button" onClick={() => pickItem(it)}>
                      <span>
                        <span className="n">{it.name}</span>
                        {it.k && <span className="k" style={{ display: 'block' }}>{it.k}</span>}
                      </span>
                      <span className="p">{priceLabel(it)}</span>
                      {n > 0 && <span className="badge" key={n}>{n}</span>}
                    </button>
                  );
                })}
              </Group>
            )) : (
              <p className="empty-cart" style={{ gridColumn: '1/-1' }}>
                {q ? <>Tidak ada yang cocok dengan “{query}”.</> : 'Belum ada item. Tambahkan di menu Harga.'}
              </p>
            )}
          </div>
        </div>

        <aside className={`cart${cartOpen ? ' open' : ''}`} aria-label="Pesanan">
          <div className="cart-head">
            <h2>Pesanan <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{count ? `· ${count} item` : ''}</span></h2>
            <button className="x" type="button" aria-label="Tutup pesanan" onClick={() => setCartOpen(false)}>{Icon.close()}</button>
          </div>
          <div className="cart-body">
            <div className="cust">
              <input className="input" placeholder="Nama pelanggan" aria-label="Nama pelanggan" value={cust} onChange={(e) => setCust(e.target.value)} />
              <input className="input" placeholder="No. WA (opsional)" inputMode="tel" aria-label="Nomor WhatsApp pelanggan" value={wa} onChange={(e) => setWa(e.target.value)} />
            </div>
            {member && mstat ? (
              <div className="mem-chip">
                <div>
                  <b>{member.name}</b> <MemberTags m={member} />
                  <small>Cap {mstat.cycle}/{MEMBER_GOAL} · berlaku s.d. {fmtDate(member.expiresOn)}</small>
                  {hasFree ? <small className="mem-note">Treatment gratis dipakai, cap tidak bertambah.</small>
                    : hasService ? <small className="mem-note">+1 cap setelah dibayar.</small> : null}
                </div>
                <button className="icon-btn" type="button" aria-label="Lepas member" onClick={clearMember}>{Icon.close()}</button>
              </div>
            ) : (
              <button className="linkbtn mem-add" type="button" onClick={() => setPickerOpen(true)}>+ Member</button>
            )}
            {cart.length ? cart.map((l, i) => (
              <div className="line" key={l.key + i}>
                <div className="line-top">
                  <span className="n">{l.name}</span><span className="amt">{l.free ? 'Gratis' : rp(l.price * l.qty)}</span>
                  <span className="v">{l.free ? 'Gratis member' : rp(l.price) + (l.qty > 1 ? ' × ' + l.qty : '')}</span>
                </div>
                <div className="line-bot">
                  {l.service ? (
                    <Select className={`terapis ${l.terapis ? '' : 'empty'}`} ariaLabel={`Terapis untuk ${l.name}`} value={l.terapis}
                      placeholder="Pilih terapis"
                      onChange={(v) => setCart((c) => c.map((x, idx) => (idx === i ? { ...x, terapis: v } : x)))}
                      options={therapists.map((t) => ({ value: String(t.id), label: t.name }))} />
                  ) : <span className="v">Produk</span>}
                  {l.service && mstat && mstat.available > 0 && l.qty === 1 && (
                    <button type="button" className="free-btn" aria-pressed={!!l.free} onClick={() => toggleFree(i)}>
                      {l.free ? '✓ Gratis' : 'Pakai gratis'}
                    </button>
                  )}
                  <span className="mini-step">
                    <button type="button" aria-label="Kurangi" onClick={() => step(i, -1)}>−</button>
                    <span className="qty" key={l.qty}>{l.qty}</span>
                    <button type="button" aria-label="Tambah" onClick={() => step(i, 1)}>+</button>
                  </span>
                </div>
              </div>
            )) : (
              <div className="empty-cart"><b>Belum ada pesanan</b>Ketuk layanan atau produk di sebelah kiri.</div>
            )}
          </div>
          <div className="cart-foot">
            <div className="rowx"><span>Subtotal</span><b>{rp(sub)}</b></div>
            <div className="rowx"><label htmlFor="disc">Diskon</label>
              <span className="disc-ctl">
                <span className="seg seg-sm" role="group" aria-label="Jenis diskon">
                  <button type="button" aria-pressed={discMode === 'rp'} onClick={() => { setDiscMode('rp'); setDisc(''); }}>Rp</button>
                  <button type="button" aria-pressed={discMode === 'pct'} onClick={() => { setDiscMode('pct'); setDisc(''); }}>%</button>
                </span>
                <input className="input disc" id="disc" inputMode="numeric" placeholder="0" value={disc}
                  onChange={(e) => setDisc(discMode === 'pct' ? String(Math.min(num(e.target.value), 100) || '') : money(num(e.target.value)))} />
              </span></div>
            {discMode === 'pct' && discount > 0 && (
              <div className="rowx disc-note"><span>Potongan {num(disc)}%</span><b>-{rp(discount)}</b></div>
            )}
            <div className="rowx total"><span>Total</span><b>{rp(total)}</b></div>
            {subSalon > 0 && subGbee > 0 && (
              <div className="rowx" style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '-6px 0 2px' }}>
                <span>Porsi</span>
                <span>Salon: {rp(totSalon)} · Gbee: {rp(totGbee)}</span>
              </div>
            )}
            <div className="pay" role="radiogroup" aria-label="Metode bayar">
              {(['Tunai', 'QRIS', 'Transfer'] as PayMethod[]).map((m) => (
                <label key={m}><input type="radio" name="pay" value={m} checked={pay === m} onChange={() => setPay(m)} /><span>{m}</span></label>
              ))}
            </div>
            {pay === 'Tunai' && (
              <div className="cash">
                <div className="rowx"><label htmlFor="cashIn">Uang diterima</label>
                  <input className="input disc" id="cashIn" inputMode="numeric" placeholder="0" value={cashIn} onChange={(e) => setCashIn(money(num(e.target.value)))} /></div>
                <div className="quick">
                  {total > 0 && quick.map((v, i) => (
                    <button key={v} type="button" onClick={() => setCashIn(money(v))}>{i === 0 ? 'Uang pas' : rpk(v)}</button>
                  ))}
                </div>
                <div className="rowx"><span>Kembalian</span>
                  <b className={`change${cash > 0 && change < 0 ? ' neg' : ''}`}>{cash ? (change < 0 ? 'Kurang ' + rp(-change) : rp(change)) : '–'}</b></div>
              </div>
            )}
          </div>
          <div className="cart-act">
            <p className="hint">{hint}</p>
            <button className="btn btn-green" type="button" disabled={!ok || paying} onClick={doPay}>
              {paying ? 'Menyimpan…' : total ? `Bayar ${rp(total)}` : 'Bayar'}
            </button>
          </div>
        </aside>
      </div>

      {count > 0 && (
        <button className="cartbar2" type="button" onClick={() => setCartOpen(true)}>
          <span><span>{count} item</span> · <span className="t">{rp(total)}</span></span>
          <span className="go">Lihat pesanan</span>
        </button>
      )}

      <Sheet open={!!variantItem} onClose={() => setVariantItem(null)} labelledBy="varTitle">
        {variantItem && (
          <div className="sheet-in">
            <CloseBtn onClick={() => setVariantItem(null)} />
            <h3 id="varTitle">{variantItem.name}</h3>
            <p className="sub2">{variantItem.k ?? ''}</p>
            {variantItem.opts && (
              <>
                <p className="opt-label">Jenis</p>
                <div className="chips">
                  {variantItem.opts.map((o) => (
                    <label className="chip" key={o}>
                      <input type="radio" name="vopt" value={o} checked={opt === o} onChange={() => setOpt(o)} /><span>{o}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
            <p className="opt-label">{variantItem.vlabel || 'Pilih'}</p>
            <div className="var-list">
              {(variantItem.variants ?? []).map(([v, p]) => (
                <button key={v} className="var-btn" type="button" onClick={() => pickVariant(variantItem, v, p)}>
                  <span>{v}</span><b>{rp(p)}</b>
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>

      <MemberPicker open={pickerOpen} members={members} defaultName={cust} defaultWa={wa}
        onClose={() => setPickerOpen(false)} onPick={pickMember} />
      <ReceiptSheet tx={receipt} fresh onClose={() => setReceipt(null)} />
    </section>
  );
}

function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return <>{label && has && <p className="group-label">{label}</p>}{children}</>;
}

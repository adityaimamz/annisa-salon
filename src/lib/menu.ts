// Daftar layanan di landing, dibangun dari catalog_items (sumber yang sama dengan Kasir).
// HTML bawaan di index.astro tetap jadi cadangan kalau Supabase belum diisi atau fetch gagal.
import { supabase } from './supabase';

interface Row {
  id: string; category_id: string; name: string; note: string | null; price: number | null;
  variant_label: string | null; variants: [string, number][] | null; options: string[] | null;
  description: string | null; sort: number;
}
interface Cat { id: string; name: string; sort: number }

// Layanan dengan pilihan merek (Facial basic, Facial treatment, Totok wajah, ...) ditampilkan sebagai tabel,
// bukan baris menu. Dikenali dari label pilihan "Merek" di halaman Harga.
const BRAND_LABEL = 'Merek';
// Kategori dengan layanan lebih dari ini dipotong, sisanya muncul lewat tombol "Lihat semua".
const LIMIT = 10;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const rb = (n: number) => (n % 1000 === 0 ? `${n / 1000}rb` : 'Rp' + n.toLocaleString('id-ID'));
// Nama dari admin kadang huruf kecil semua ("cat rambut reguler"); tampilkan dengan huruf awal kapital.
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function priceHtml(r: Row) {
  if (r.variants?.length) {
    const ps = r.variants.map((v) => v[1]);
    const min = Math.min(...ps);
    const from = ps.some((p) => p !== min) ? '<small>dari</small> ' : '';
    return `<span class="m-price fixed">${from}${rb(min)}</span>`;
  }
  if (r.price) return `<span class="m-price fixed">${rb(r.price)}</span>`;
  return '<span class="m-price">Tanya harga →</span>';
}

function itemHtml(r: Row, extra: boolean) {
  const name = cap(r.name.trim());
  // catatan berawalan "by " (mis. "by Gbee") tampil redup di samping nama
  const by = r.note && /^by\s/i.test(r.note) ? ` <span class="by">${esc(r.note)}</span>` : '';
  // Harga per varian (mis. panjang rambut) langsung terlihat, tidak perlu ditanyakan
  const vars = r.variants && r.variants.length > 1
    ? `<span class="m-vars">${r.variants.map(([n, p]) => `<span>${esc(cap(n))} <b>${rb(p)}</b></span>`).join('')}</span>` : '';
  return `<li${extra ? ' class="extra"' : ''}><a class="menu-item" data-ask="${esc(name)}" href="#"><span class="m-name">${esc(name)}${by}</span>` +
    priceHtml(r) + (r.description ? `<span class="m-desc">${esc(r.description)}</span>` : '') + vars + '</a></li>';
}

function brandTableHtml(rows: Row[]) {
  const brands: string[] = [];
  rows.forEach((r) => r.variants!.forEach(([b]) => { if (!brands.includes(b)) brands.push(b); }));
  const head = rows.map((r) => `<th scope="col">${esc(r.options?.length ? r.options.join(' · ') : r.name)}</th>`).join('');
  const body = brands.map((b) => {
    const cells = rows.map((r) => {
      const v = r.variants!.find(([n]) => n === b);
      return `<td>${!v ? '–' : rb(v[1])}</td>`;
    }).join('');
    return `<tr><th scope="row">${esc(b)}</th>${cells}</tr>`;
  }).join('');
  const note = rows.some((r) => r.options?.length)
    ? `<p class="bt-note">${esc(rows.find((r) => r.options?.length)!.options!.join(', '))} harganya sama di tiap merek.</p>` : '';
  return '<div class="brand-table"><p class="bt-title">Facial &amp; totok wajah per merek</p><div class="bt-scroll">' +
    `<table><thead><tr><th scope="col">Merek</th>${head}</tr></thead><tbody>${body}</tbody></table></div>${note}</div>`;
}

/** Menu layanan: tab per kategori (dibuat otomatis dari data) + satu panel per kategori. */
export function menuHtml(cats: Cat[], rows: Row[]) {
  const groups = cats.map((c) => {
    const mine = rows.filter((r) => r.category_id === c.id).sort((a, b) => a.sort - b.sort);
    const brand = mine.filter((r) => r.variant_label === BRAND_LABEL && r.variants?.length);
    return { c, brand, list: mine.filter((r) => !brand.includes(r)) };
  }).filter((g) => g.list.length || g.brand.length);
  if (!groups.length) return '';

  const tabs = groups.map((g, i) =>
    `<button type="button" class="tab" data-cat="${esc(g.c.id)}" aria-pressed="${i === 0}">${esc(g.c.name)}` +
    `<span class="n">${g.list.length + g.brand.length}</span></button>`).join('');
  const panels = groups.map((g, i) => {
    const n = g.list.length;
    const ul = n ? `<ul class="menu-list">${g.list.map((r, j) => itemHtml(r, j >= LIMIT)).join('')}</ul>` : '';
    const more = n > LIMIT
      ? `<button type="button" class="link-arrow menu-more">Lihat semua ${n} layanan ${esc(g.c.name.toLowerCase())}</button>` : '';
    return `<div class="menu-panel" data-cat="${esc(g.c.id)}"${i === 0 ? '' : ' hidden'}>${ul}${more}` +
      (g.brand.length ? brandTableHtml(g.brand) : '') + '</div>';
  }).join('');
  return `<div class="tabs menu-tabs" aria-label="Kategori layanan">${tabs}</div>${panels}`;
}

/** Pilihan perawatan di form booking: semua layanan aktif, urut kategori lalu urutan item. */
export function chipsHtml(cats: Cat[], rows: Row[]) {
  const groups = cats.map((c) => ({ c, mine: rows.filter((r) => r.category_id === c.id).sort((a, b) => a.sort - b.sort) }))
    .filter((g) => g.mine.length);
  // Dikelompokkan per kategori; kelompok pertama terbuka, sisanya dilipat.
  return groups.map((g, i) =>
    `<details class="svc-group"${i === 0 ? ' open' : ''}><summary><span class="sg-name">${esc(g.c.name)}</span><span class="sg-count" hidden></span></summary>` +
    `<div class="chips">${g.mine.map((r) =>
      `<label class="chip"><input type="checkbox" value="${esc(r.name)}"><span>${esc(r.name)}</span></label>`).join('')}</div></details>`,
  ).join('');
}

/** Mengembalikan HTML menu dan chip booking dari database, atau null kalau tidak bisa dimuat (pakai cadangan statis). */
export async function loadMenu(): Promise<{ menu: string; chips: string } | null> {
  if (!supabase) return null;
  const [c, i] = await Promise.all([
    supabase.from('categories').select('id,name,sort').neq('id', 'produk').order('sort'),
    supabase.from('catalog_items')
      .select('id,category_id,name,note,price,variant_label,variants,options,description,sort')
      .eq('is_service', true).eq('active', true),
  ]);
  if (c.error || i.error || !i.data?.length) return null;
  const menu = menuHtml(c.data as Cat[], i.data as Row[]);
  return menu ? { menu, chips: chipsHtml(c.data as Cat[], i.data as Row[]) } : null;
}

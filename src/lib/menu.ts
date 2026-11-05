// Daftar layanan di landing, dibangun dari catalog_items (sumber yang sama dengan Kasir).
// HTML bawaan di index.astro tetap jadi cadangan kalau Supabase belum diisi atau fetch gagal.
import { supabase } from './supabase';

interface Row {
  id: string; category_id: string; name: string; note: string | null; price: number | null;
  variant_label: string | null; variants: [string, number][] | null; options: string[] | null;
  description: string | null; sort: number;
}
interface Cat { id: string; name: string; sort: number }

// Teks pengantar per kategori (copy marketing, bukan data harga).
const BLURB: Record<string, string> = {
  rambut: 'Dari rapikan ujung sampai ganti warna.',
  wajah: 'Pilih merek produk yang biasa kamu pakai.',
  badan: 'Di ruang spa terpisah.',
};
// Layanan dengan pilihan merek (Facial basic, Facial treatment, Totok wajah, ...) ditampilkan sebagai tabel,
// bukan baris menu. Dikenali dari label pilihan "Merek" di halaman Harga.
const BRAND_LABEL = 'Merek';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const rb = (n: number) => (n % 1000 === 0 ? `${n / 1000}rb` : 'Rp' + n.toLocaleString('id-ID'));

function priceCell(r: Row): { text: string; fixed: boolean } {
  if (r.variants?.length) return { text: 'mulai ' + rb(Math.min(...r.variants.map((v) => v[1]))), fixed: true };
  if (r.price) return { text: rb(r.price), fixed: true };
  return { text: 'Tanya harga →', fixed: false };
}

function itemHtml(r: Row) {
  const p = priceCell(r);
  // catatan berawalan "by " (mis. "by Gbee") tampil redup di samping nama
  const by = r.note && /^by\s/i.test(r.note) ? ` <span class="by">${esc(r.note)}</span>` : '';
  return `<li><a class="menu-item" data-ask="${esc(r.name)}" href="#"><span class="m-name">${esc(r.name)}${by}</span>` +
    `<span class="m-price${p.fixed ? ' fixed' : ''}">${esc(p.text)}</span>` +
    (r.description ? `<span class="m-desc">${esc(r.description)}</span>` : '') + '</a></li>';
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

export function menuHtml(cats: Cat[], rows: Row[]) {
  return cats.map((c) => {
    const mine = rows.filter((r) => r.category_id === c.id).sort((a, b) => a.sort - b.sort);
    const brand = mine.filter((r) => r.variant_label === BRAND_LABEL && r.variants?.length);
    const list = mine.filter((r) => !brand.includes(r));
    if (!list.length && !brand.length) return '';
    const blurb = BLURB[c.id] ? `<p>${esc(BLURB[c.id])}</p>` : '';
    const ul = list.length ? `<ul class="menu-list">${list.map(itemHtml).join('')}</ul>` : '';
    const inner = brand.length ? `<div>${ul}${brandTableHtml(brand)}</div>` : ul;
    return `<div class="menu-group"><div class="menu-cat"><h3>${esc(c.name)}</h3>${blurb}</div>${inner}</div>`;
  }).join('');
}

/** Mengembalikan HTML menu dari database, atau null kalau tidak bisa dimuat (pakai cadangan statis). */
export async function loadMenuHtml(): Promise<string | null> {
  if (!supabase) return null;
  const [c, i] = await Promise.all([
    supabase.from('categories').select('id,name,sort').neq('id', 'produk').order('sort'),
    supabase.from('catalog_items')
      .select('id,category_id,name,note,price,variant_label,variants,options,description,sort')
      .eq('is_service', true).eq('active', true),
  ]);
  if (c.error || i.error || !i.data?.length) return null;
  return menuHtml(c.data as Cat[], i.data as Row[]) || null;
}

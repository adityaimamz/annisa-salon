// Galeri "Hasil" di landing, dibangun dari gallery_photos (diatur owner di /kasir > Galeri).
// HTML bawaan di index.astro tetap jadi cadangan kalau Supabase belum diisi atau fetch gagal.
import { supabase } from './supabase';

interface Row {
  title: string; subtitle: string | null; alt: string | null; categories: string[];
  image_url: string; thumb_url: string; width: number | null; height: number | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const shotHtml = (r: Row) =>
  `<figure class="shot" data-reveal data-c="${esc(r.categories.join('|'))}"><button type="button">` +
  `<img loading="lazy" src="${esc(r.thumb_url)}" data-full="${esc(r.image_url)}" alt="${esc(r.alt || [r.title, r.subtitle].filter(Boolean).join(' '))}" ` +
  `width="520" height="${r.width && r.height ? Math.round((520 * r.height) / r.width) : 693}"></button>` +
  `<figcaption><b>${esc(r.title)}</b><span>${esc(r.subtitle ?? '')}</span></figcaption></figure>`;

export interface GalleryHtml { tabs: string; grid: string; count: number }

/** HTML tab + grid dari database; null kalau gagal dimuat (pakai cadangan statis). */
export async function loadGalleryHtml(): Promise<GalleryHtml | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('gallery_photos')
    .select('title,subtitle,alt,categories,image_url,thumb_url,width,height')
    .eq('active', true).order('sort').order('created_at');
  if (error || !data) return null;
  const rows = data as Row[];
  const cats = [...new Set(rows.flatMap((r) => r.categories))];
  const tabs = ['Semua', ...cats].map((c, i) =>
    `<button class="tab" data-f="${i ? esc(c) : 'all'}" aria-pressed="${i === 0}">${esc(c)}</button>`).join('');
  return { tabs, grid: rows.map(shotHtml).join(''), count: rows.length };
}

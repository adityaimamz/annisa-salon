// Kompres foto di browser ke WebP sebelum diunggah: versi penuh (lightbox) dan thumbnail (grid).
const FULL_EDGE = 1440; // sisi terpanjang, cukup tajam untuk lightbox di layar retina
const THUMB_EDGE = 720;
const FULL_TARGET = 260 * 1024; // turunkan kualitas bertahap sampai di bawah ini
const THUMB_TARGET = 70 * 1024;

export interface Processed {
  full: Blob; thumb: Blob; width: number; height: number; original: number;
}

function toWebp(c: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b && b.type === 'image/webp' ? res(b) : rej(new Error('Browser ini tidak bisa membuat WebP. Pakai Chrome atau Safari terbaru.'))), 'image/webp', q));
}

async function encode(src: ImageBitmap, edge: number, target: number) {
  const scale = Math.min(1, edge / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  let q = 0.86, blob = await toWebp(c, q);
  while (blob.size > target && q > 0.55) { q -= 0.06; blob = await toWebp(c, q); }
  return { blob, w, h };
}

export async function processPhoto(file: File): Promise<Processed> {
  if (!file.type.startsWith('image/')) throw new Error('Berkas harus berupa gambar.');
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('Gambar tidak bisa dibaca. Coba foto lain (JPG, PNG, atau WebP).'); }
  try {
    const full = await encode(bmp, FULL_EDGE, FULL_TARGET);
    const thumb = await encode(bmp, THUMB_EDGE, THUMB_TARGET);
    return { full: full.blob, thumb: thumb.blob, width: full.w, height: full.h, original: file.size };
  } finally { bmp.close(); }
}

export const kb = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

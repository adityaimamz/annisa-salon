// Service worker kasir. Hanya meng-cache file statis (shell aplikasi);
// semua data (Supabase) selalu lewat jaringan agar transaksi tidak pernah basi.
const VERSION = 'kasir-v1';
const SHELL = ['/kasir', '/manifest.webmanifest', '/icons/icon-192.png', '/assets/mark-light.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase, Google Fonts: biarkan browser

  // Halaman /kasir: jaringan dulu, cadangan dari cache saat offline.
  if (req.mode === 'navigate') {
    if (!url.pathname.startsWith('/kasir')) return;
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('/kasir', copy));
        return res;
      }).catch(() => caches.match('/kasir')),
    );
    return;
  }

  // Aset statis: cache dulu (/_astro/* bernama hash, aman), perbarui di belakang.
  if (url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        }).catch(() => hit);
        return hit || net;
      }),
    );
  }
});

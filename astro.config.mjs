import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Mode static (default). Untuk SSR di Vercel: tambahkan adapter @astrojs/vercel
// dan set output: 'server' (atau 'static' + prerender per halaman).
// URL situs dipakai untuk og:image/og:url/canonical (harus absolut agar tampil di WhatsApp & Facebook).
// Isi SITE_URL (mis. https://annisa-salon.com) jika memakai domain sendiri; di Vercel otomatis
// memakai domain produksi proyek.
const site = process.env.SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);

export default defineConfig({
  site,
  integrations: [react()],
});

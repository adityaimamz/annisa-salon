import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Mode static (default). Untuk SSR di Vercel: tambahkan adapter @astrojs/vercel
// dan set output: 'server' (atau 'static' + prerender per halaman).
export default defineConfig({
  integrations: [react()],
});

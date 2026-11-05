# An-Nisa Muslimah Salon

Astro (static) + React island untuk kasir + Supabase.

| Rute | Isi |
|---|---|
| `/` | Landing page |
| `/produk` | Katalog Gbee, harga dibaca langsung dari Supabase |
| `/kasir` | Kasir + Harga (hanya lihat) untuk karyawan; Transaksi, Keuangan, ubah Harga, dan Karyawan khusus owner. Perlu login |

## Menjalankan
```
npm install
cp .env.example .env     # isi PUBLIC_SUPABASE_URL & PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm run dev              # http://localhost:4321
```

## Database
Migrasi ada di `supabase/migrations/`, seed katalog di `supabase/seed.sql`.
```
npm run db:login && npm run db:link   # sekali saja
npm run db:dry                        # lihat migrasi yang akan jalan
npm run db:push                       # terapkan
```
Akun baru otomatis berperan `kasir` (= karyawan). Owner membuat akun karyawan dari menu **Karyawan** di `/kasir` (RPC `create_staff`, migrasi `0007`). Jadikan pemilik:
`update public.profiles set role = 'owner' where id = '<UUID user>';`

## Deploy (Vercel)
Framework Astro terdeteksi otomatis. Isi Environment Variables:
`PUBLIC_SUPABASE_URL` dan `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
Jangan pernah memakai secret key Supabase di variabel berawalan `PUBLIC_`.

## Struktur
- `src/pages` halaman Astro, `src/layouts`, `src/components` header/footer
- `src/kasir` aplikasi kasir (React): `App`, `KasirView`, `TransaksiView`, `KeuanganView`, `HargaView`, `api.ts`
- `public/assets` foto & logo, `_arsip/` versi lama (HTML statis, prototipe kasir)
- `_sumber/` file mentah (foto WhatsApp tidak di-commit)

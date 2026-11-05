# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Situs An-Nisa Muslimah Salon: Astro (output static) + satu React island untuk kasir + Supabase. UI dan teks dalam Bahasa Indonesia. Lihat [README.md](README.md) untuk setup, deploy Vercel, dan cara menjadikan akun sebagai `owner`.

## Perintah

- `npm run dev` — dev server di http://localhost:4321 (konfigurasi preview ada di `.claude/launch.json`)
- `npm run build` / `npm run preview`
- `npm run db:dry` → `npm run db:push` — lihat lalu terapkan migrasi `supabase/migrations/` ke project remote (`db:push:seed` juga menjalankan `seed.sql`)
- **Migrasi baru: langsung jalankan, jangan menunggu user.** Setelah menulis file di `supabase/migrations/`, jalankan `npm run db:dry` untuk memeriksa, lalu `npx supabase db push --remote --yes` (`npm run db:push` saja ditolak CLI di mode agen; `--yes` sah karena user sudah memberi izin tetap). Target-nya database production, jadi baca hasil dry-run dulu dan jangan lanjut kalau ada migrasi di luar yang baru kamu tulis. Laporkan hasilnya. Jika gagal (belum login/link, SQL error), hentikan dan laporkan, jangan mengubah migrasi yang sudah terapkan. Pakai `db:push:seed` hanya jika user memintanya.
- Tidak ada lint maupun test. Type-check: `npx tsc --noEmit` (`astro check` **tidak jalan** karena TypeScript 7).
- Butuh `.env` berisi `PUBLIC_SUPABASE_URL` dan `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (salin dari `.env.example`). Tanpa itu `supabase` bernilai `null` dan `/kasir` hanya menampilkan peringatan.

## Arsitektur

Tiga rute, satu database, tanpa backend sendiri — semua akses data lewat `supabase-js` dari browser, jadi **keamanan seluruhnya ada di RLS** (`supabase/migrations/0001_init.sql`: `is_owner()` / `is_staff()`). Jangan pernah memakai secret key di variabel berawalan `PUBLIC_`.

- `/` dan `/produk` — halaman Astro dengan CSS `src/styles/site.css` (token warna, `--ease-out`/`--ease-drawer`, tombol, `.tab`, `.input`, `.chip`). `/produk` membaca katalog Supabase lewat `<script>` di halamannya dan memakai `web_price ?? price`. Daftar "Layanan" di landing dibangun di browser oleh `src/lib/menu.ts` dari `catalog_items` (layanan aktif; harga apa adanya, "Tanya harga" hanya jika harga kosong; layanan berlabel pilihan "Merek" jadi tabel merek). HTML statis di `index.astro` hanya cadangan jika fetch gagal.
- `/kasir` — `src/pages/kasir.astro` memuat `src/kasir/App` dengan `client:only="react"` (tidak ada SSR). Mengimpor `site.css` **dan** `kasir.css`; `kasir.css` bergantung pada token di `site.css`, jadi jangan dipisah.

### Kasir (`src/kasir/`)
- `App.tsx`: `Auth` (session Supabase) → `Shell` (memuat profil, katalog, terapis sekali di awal, lalu navigasi antar view lewat state, bukan router). `KasirView` selalu ter-mount dan hanya di-`hidden` saat pindah tab, supaya isi keranjang tidak hilang; view lain di-mount ulang tiap dibuka. Peran `kasir` = karyawan: hanya Kasir + Harga (read-only, `HargaView readOnly`). Menu Transaksi, Keuangan, Karyawan, dan ubah Harga hanya untuk `role === 'owner'` (disaring di UI, ditegakkan RLS; `tx_read`/`txi_read` owner-only sejak migrasi `0007`, `create_transaction` jadi `security definer`). Akun karyawan dikelola lewat RPC `create_staff`/`reset_staff_password`/`delete_staff`/`list_staff` (owner-only, menulis ke `auth.users`); toggle nonaktif = `profiles.active` (migrasi `0007`/`0009`), hapus membuat `cashier_id`/`created_by` jadi null (`0008`).
- `api.ts` adalah satu-satunya tempat yang memanggil Supabase; baris DB dipetakan ke tipe di `types.ts` (`fromRow`/`toRow`, `txFromRow`). Transaksi dibuat lewat RPC `create_transaction` (nomor struk dan total dihitung di server). Pembacaan transaksi/pengeluaran dipaginasi 1000 baris.
- Katalog: layanan memakai satu harga (`price`, dipakai Kasir **dan** website); hanya produk punya `web_price` terpisah (migrasi `0004`). `description` (migrasi `0005`) = deskripsi layanan di website. Varian (`variants`, `opts`) disimpan sebagai JSON di `catalog_items`. `active` (switch di Harga) menyembunyikan item dari Kasir sekaligus website. Tidak ada konsep "harga contoh" (dihapus di migrasi `0006`; kolom `is_sample` sengaja dibiarkan tapi tidak dipakai kode).
- Galeri "Hasil" di landing: tabel `gallery_photos` + bucket Storage `gallery` (migrasi `0010`, WebP saja, maks 1 MB). Owner mengelolanya di `GaleriView` (menu Galeri); `image.ts` mengompres foto ke WebP di browser (penuh 1440px + thumbnail 720px) sebelum diunggah. Landing membangun grid dan tab filter dari `src/lib/galeri.ts` (kategori = teks bebas, tab dibuat otomatis); HTML statis di `index.astro` hanya cadangan. Foto bawaan masih berupa path `/assets/foto/...` di `public/`.
- `HargaView` dibagi tab Layanan | Produk (`kind`); kategori, tombol tambah, dan form editor mengikuti tab aktif.
- `ui.tsx`: toast (context), ikon, `Sheet` (pembungkus `<dialog>`; isi terakhir disimpan agar animasi keluar jalan), `ReceiptSheet`.
- `KeuanganView` + `DayChart` menggambar grafik SVG sendiri (tanpa library chart).

## Animasi

Semua gerak di `/kasir` memakai token `--ease-out` / `--ease-drawer` dari `site.css`, hanya `transform` + `opacity`, dan punya blok `prefers-reduced-motion` di akhir `kasir.css` (gerak diganti fade, bukan dimatikan). Untuk pekerjaan animasi gunakan skill `animate` (`.claude/skills/`); catatan: folder itu dan `.agents/` di-gitignore, jadi hanya ada di mesin lokal.

## Lain-lain

- `_arsip/` (HTML statis & prototipe kasir lama) dan `_sumber/` (foto mentah) bukan bagian build; abaikan kecuali diminta.
- Commit di repo ini berbahasa Indonesia.

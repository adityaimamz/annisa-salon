# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Situs An-Nisa Muslimah Salon: Astro (output static) + satu React island untuk kasir + Supabase. UI dan teks dalam Bahasa Indonesia. Lihat [README.md](README.md) untuk setup, deploy Vercel, dan cara menjadikan akun sebagai `owner`.

## Perintah

- `npm run dev` — dev server di http://localhost:4321 (konfigurasi preview ada di `.claude/launch.json`)
- `npm run build` / `npm run preview`
- `npm run db:dry` → `npm run db:push` — lihat lalu terapkan migrasi `supabase/migrations/` ke project remote (`db:push:seed` juga menjalankan `seed.sql`)
- **Migrasi baru: langsung jalankan, jangan menunggu user.** Setelah menulis file di `supabase/migrations/`, jalankan `npm run db:dry` untuk memeriksa, lalu `npx supabase db push --remote --yes` (`npm run db:push` saja ditolak CLI di mode agen; `--yes` sah karena user sudah memberi izin tetap). Target-nya database production, jadi baca hasil dry-run dulu dan jangan lanjut kalau ada migrasi di luar yang baru kamu tulis. Laporkan hasilnya. Jika gagal (belum login/link, error 403 "necessary privileges" = login CLI di sesi agen bermasalah, SQL error), hentikan dan laporkan (jangan cari jalan memutar; user bisa menjalankan `npm run db:push` sendiri), jangan mengubah migrasi yang sudah terapkan. Pakai `db:push:seed` hanya jika user memintanya.
- Tidak ada lint maupun test. Type-check: `npx tsc --noEmit` (`astro check` **tidak jalan** karena TypeScript 7).
- Butuh `.env` berisi `PUBLIC_SUPABASE_URL` dan `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (salin dari `.env.example`). Tanpa itu `supabase` bernilai `null` dan `/kasir` hanya menampilkan peringatan.

## Arsitektur

Tiga rute, satu database, tanpa backend sendiri — semua akses data lewat `supabase-js` dari browser, jadi **keamanan seluruhnya ada di RLS** (`supabase/migrations/0001_init.sql`: `is_owner()` / `is_staff()`). Jangan pernah memakai secret key di variabel berawalan `PUBLIC_`.

- `/` dan `/produk` — halaman Astro dengan CSS `src/styles/site.css` (token warna, `--ease-out`/`--ease-drawer`, tombol, `.tab`, `.input`, `.chip`). `/produk` membaca katalog Supabase lewat `<script>` di halamannya dan memakai `web_price ?? price`. Daftar "Layanan" di landing dibangun di browser oleh `src/lib/menu.ts` dari `catalog_items` (layanan aktif; harga apa adanya, "Tanya harga" hanya jika harga kosong; layanan berlabel pilihan "Merek" jadi tabel merek). HTML statis di `index.astro` hanya cadangan jika fetch gagal.
- `/kasir` — `src/pages/kasir.astro` memuat `src/kasir/App` dengan `client:only="react"` (tidak ada SSR). Mengimpor `site.css` **dan** `kasir.css`; `kasir.css` bergantung pada token di `site.css`, jadi jangan dipisah.

### Kasir (`src/kasir/`)
- `App.tsx`: `Auth` (session Supabase) → `Shell` (memuat profil, katalog, terapis sekali di awal, lalu navigasi antar view lewat state, bukan router). `KasirView` selalu ter-mount dan hanya di-`hidden` saat pindah tab, supaya isi keranjang tidak hilang; view lain di-mount ulang tiap dibuka. Peran `kasir` = karyawan: hanya Kasir + Katalog (read-only, `HargaView readOnly`, tanpa tab Stok). Menu bawah owner ada 6: Kasir, Transaksi, Keuangan (tab Ringkasan | Pengeluaran), Member, Katalog (tab Layanan | Produk | Stok), Pengaturan (tab Galeri | Karyawan); tab-tab itu dibungkus `TabbedView.tsx` (state tab di `Shell`). Jangan menambah menu level atas lagi: tab bawah di HP sudah penuh, taruh sebagai tab di menu yang relevan. Menu Transaksi, Keuangan, Member, Pengaturan, dan ubah Harga/Stok hanya untuk `role === 'owner'` (disaring di UI, ditegakkan RLS; `tx_read`/`txi_read` owner-only sejak migrasi `0007`, `create_transaction` jadi `security definer`). Akun karyawan dikelola lewat RPC `create_staff`/`reset_staff_password`/`delete_staff`/`list_staff` (owner-only, menulis ke `auth.users`; UI-nya di Pengaturan > Karyawan); toggle nonaktif = `profiles.active` (migrasi `0007`/`0009`), hapus membuat `cashier_id`/`created_by` jadi null (`0008`).
- `api.ts` adalah satu-satunya tempat yang memanggil Supabase; baris DB dipetakan ke tipe di `types.ts` (`fromRow`/`toRow`, `txFromRow`). Transaksi dibuat lewat RPC `create_transaction` (nomor struk dan total dihitung di server). Pembacaan transaksi/pengeluaran dipaginasi 1000 baris.
- Katalog: layanan memakai satu harga (`price`, dipakai Kasir **dan** website); hanya produk punya `web_price` terpisah (migrasi `0004`). `description` (migrasi `0005`) = deskripsi layanan di website. Varian (`variants`, `opts`) disimpan sebagai JSON di `catalog_items`. `active` (switch di Harga) menyembunyikan item dari Kasir sekaligus website. Tidak ada konsep "harga contoh" (dihapus di migrasi `0006`; kolom `is_sample` sengaja dibiarkan tapi tidak dipakai kode).
- Galeri "Hasil" di landing: tabel `gallery_photos` + bucket Storage `gallery` (migrasi `0010`, WebP saja, maks 1 MB). Owner mengelolanya di `GaleriView` (menu Galeri); `image.ts` mengompres foto ke WebP di browser (penuh 1440px + thumbnail 720px) sebelum diunggah. Landing membangun grid dan tab filter dari `src/lib/galeri.ts` (kategori = teks bebas, tab dibuat otomatis); HTML statis di `index.astro` hanya cadangan. Foto bawaan masih berupa path `/assets/foto/...` di `public/`.
- `HargaView` (menu **Katalog**) dibagi tab Layanan | Produk | Stok (`kind`); kategori, tombol tambah, dan form editor mengikuti tab aktif. `MoneyInput.tsx` = input nominal yang menyimpan saat blur.
- Unit bisnis: `business_unit` `salon` | `gbee` di `catalog_items`/`transaction_items` (produk = Gbee), dan `salon`/`gbee`/`operasional` di `expenses`. Transaksi, Keuangan, dan Buku Kas (`BukuKasSheet`, `daily_cash_books`, RPC `get_daily_cash_summary`) memisahkan porsi Salon vs Gbee; hanya pengeluaran Tunai (`pay`) yang mengurangi kas laci.
- **Stok Gbee** (migrasi `0023`): tab Stok (`StokPanel.tsx`) = stok awal, stok masuk (opsi sekaligus mencatat pengeluaran "Stok produk"), koreksi, riwayat, rekap bulanan. Tabel `stock_entries` (awal/masuk/koreksi) dan `item_costs` (harga reseller = modal + sumber) **owner-only dan sengaja terpisah dari `catalog_items`** karena `catalog_items` dibaca anon (halaman `/produk`) dan karyawan; jangan pernah menaruh harga modal di sana. Stok KELUAR tidak disimpan: sisa = jumlah catatan stok − penjualan di `transaction_items` sejak catatan stok pertama produk itu (RPC `get_stock_levels` untuk staff, `get_stock_monthly` owner), jadi edit/hapus transaksi dan antrean offline otomatis konsisten. Produk tanpa catatan stok = tidak dilacak. Stok minus tidak memblokir Kasir. Isi data awal lewat migrasi (`0024`) atau UI.
- **Member salon** (migrasi `0025`): tabel `members` (daftar gratis, berlaku 1 tahun, hangus lalu daftar baru = baris baru) dan `member_visits` (`stamp`/`free`). Cap dicatat otomatis di dalam RPC `create_transaction` (parameter `p_member_id`, `p_member_free`): satu kunjungan berbayar yang memuat layanan non-produk = 1 cap; 10 cap = 1 gratis (`floor(stamps/10) − free`); gratis = layanan harga Rp0 di keranjang (`CartLine.free`), tidak menambah cap. Hapus transaksi menghapus kunjungannya (cascade). UI: `MemberKit.tsx` (picker/daftar, dipakai Kasir), `MemberView.tsx` (menu Member, owner), `member.ts` (`memberStat`). Kartu member fisik lama tidak diinput; hanya member baru.
- `ui.tsx`: toast (context), ikon (`Icon.*`), `Sheet` (pembungkus `<dialog>`; isi terakhir disimpan agar animasi keluar jalan), `ReceiptSheet`.
- `KeuanganView` + `DayChart` menggambar grafik SVG sendiri (tanpa library chart).

## Animasi

Semua gerak di `/kasir` memakai token `--ease-out` / `--ease-drawer` dari `site.css`, hanya `transform` + `opacity`, dan punya blok `prefers-reduced-motion` di akhir `kasir.css` (gerak diganti fade, bukan dimatikan). Untuk pekerjaan animasi gunakan skill `animate` (`.claude/skills/`); catatan: folder itu dan `.agents/` di-gitignore, jadi hanya ada di mesin lokal.

## Lain-lain

- `_arsip/` (HTML statis & prototipe kasir lama) dan `_sumber/` (foto mentah) bukan bagian build; abaikan kecuali diminta.
- Commit di repo ini berbahasa Indonesia; kerja langsung di `main` (deploy Vercel otomatis dari `main`), jadi kode yang memanggil RPC/kolom baru baru boleh di-push setelah migrasinya terapkan.

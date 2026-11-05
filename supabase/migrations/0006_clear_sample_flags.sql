-- Konsep "harga contoh" dihapus: semua harga di katalog dianggap harga yang berlaku
-- (Kasir dan website memakai angka yang sama). Pemilik mengganti harga langsung di menu Harga.
-- Kolom is_sample dibiarkan ada supaya versi aplikasi lama yang masih menulisnya tidak error;
-- kode baru tidak membaca maupun menulisnya.
update public.catalog_items set is_sample = false where is_sample;

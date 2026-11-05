-- Harga produk untuk website (landing & /produk) dipisah dari harga kasir.
-- Kolom price tetap harga kasir; web_price dipakai halaman publik.
-- null = ikut harga kasir (cadangan), jadi baris lama tetap tampil normal.
alter table public.catalog_items
  add column web_price integer check (web_price >= 0);

-- Mulai dari harga yang sama supaya tampilan website tidak berubah saat migrasi.
update public.catalog_items set web_price = price where category_id = 'produk' and price is not null;

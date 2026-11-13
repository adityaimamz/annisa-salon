-- 0024_stok_awal_nov_2026.sql
-- Data awal stok Gbee (dari catatan Lutfi, stok awal bulan November 2026) dan harga reseller
-- (daftar harga Gbee Glow Beauty, update 01 Mei 2026, kolom RES). Sumber: Maya Glow.
--
-- Stok awal bertanggal 1 Nov 2026 00:00 WIB. Penjualan produk di aplikasi sejak tanggal itu
-- otomatis mengurangi sisa (dihitung dari transaction_items, tidak disalin).
--
-- Tidak dimasukkan (sengaja):
--  * Brotowali (2) dan Lipcream (16): belum ada di katalog Kasir -> tambah dulu lewat Katalog > Produk.
--  * Facial Wash Men (0): stok nol, akan tercatat saat restock pertama.
--  * Rice Jelly Face (14), Cucumber Jelly Face (3), C&R (5): diinput sendiri oleh Lutfi lewat aplikasi.

do $$
declare
  v_missing text;
begin
  select string_agg(v.id, ', ') into v_missing
  from (values
    ('g-day-cream-pink12-5-g'), ('g-night-cream-pink12-5-g'), ('g-facial-wash-pink60-ml'),
    ('g-day-cream-gold12-5-g'), ('g-day-gold-small5-g'), ('g-night-cream-gold12-5-g'), ('g-facial-wash-gold60-ml'),
    ('g-moist-rice-cream12-5-g'), ('g-rice-facial-wash60-ml'), ('g-rice-jelly-face15-ml'),
    ('g-oxy-beauty100-ml'), ('g-toner-watermelon100-ml'), ('g-toner-lemon-juice100-ml'), ('g-toner-lemon-juice60-ml'),
    ('g-cleansing-milk100-ml'), ('g-cleansing-milk60-ml'),
    ('g-bee-jelly-face15-ml'), ('g-cardamom-rose30-ml'), ('g-cucumber-jelly-face15-ml'),
    ('g-face-lotion-men50-g'), ('g-facial-wash-men60-ml'), ('g-green-mask30-g')
  ) as v(id)
  where not exists (select 1 from public.catalog_items ci where ci.id = v.id);

  if v_missing is not null then
    raise exception 'Produk tidak ditemukan di katalog: %', v_missing;
  end if;
end $$;

-- ---------- harga reseller (modal) ----------
insert into public.item_costs (item_id, reseller_price, source, updated_at)
select v.id, v.price, 'Maya Glow', now()
from (values
  ('g-day-cream-pink12-5-g', 65000),
  ('g-night-cream-pink12-5-g', 65000),
  ('g-facial-wash-pink60-ml', 40000),
  ('g-day-cream-gold12-5-g', 85000),
  ('g-day-gold-small5-g', 50000),
  ('g-night-cream-gold12-5-g', 75000),
  ('g-facial-wash-gold60-ml', 60000),
  ('g-moist-rice-cream12-5-g', 50000),
  ('g-rice-facial-wash60-ml', 35000),
  ('g-rice-jelly-face15-ml', 45000),
  ('g-oxy-beauty100-ml', 40000),
  ('g-toner-watermelon100-ml', 45000),
  ('g-toner-lemon-juice100-ml', 45000),
  ('g-toner-lemon-juice60-ml', 35000),
  ('g-cleansing-milk100-ml', 45000),
  ('g-cleansing-milk60-ml', 35000),
  ('g-bee-jelly-face15-ml', 65000),
  ('g-cardamom-rose30-ml', 70000),
  ('g-cucumber-jelly-face15-ml', 45000),
  ('g-face-lotion-men50-g', 60000),
  ('g-facial-wash-men60-ml', 35000),
  ('g-green-mask30-g', 65000)
) as v(id, price)
on conflict (item_id) do update set
  reseller_price = excluded.reseller_price,
  source = excluded.source,
  updated_at = now();

-- ---------- stok awal 1 Nov 2026 (dilewati jika produk sudah punya catatan stok) ----------
insert into public.stock_entries (item_id, kind, qty, source, note, at)
select v.id, 'awal', v.qty, null, 'Stok awal Nov 2026 (catatan Lutfi)', '2026-11-01 00:00:00+07'::timestamptz
from (values
  ('g-bee-jelly-face15-ml', 12),
  ('g-toner-lemon-juice60-ml', 21),
  ('g-facial-wash-pink60-ml', 12),
  ('g-night-cream-pink12-5-g', 22),
  ('g-day-cream-pink12-5-g', 3),
  ('g-facial-wash-gold60-ml', 45),
  ('g-night-cream-gold12-5-g', 33),
  ('g-day-cream-gold12-5-g', 5),
  ('g-day-gold-small5-g', 11),
  ('g-face-lotion-men50-g', 7),
  ('g-rice-facial-wash60-ml', 7),
  ('g-moist-rice-cream12-5-g', 9)
) as v(id, qty)
where not exists (select 1 from public.stock_entries se where se.item_id = v.id);

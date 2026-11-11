-- Migration 0019: Input transaksi produk Gbee dari buku catatan (6 Nov & 9 Nov 2026)
-- 1. 2026-11-06: Res. Lutfi - Moist Rice Cream (1 pcs @ Rp 50.000, Tunai)
-- 2. 2026-11-06: Cust - Moist Rice Cream (1 pcs @ Rp 55.000, Tunai)
-- 3. 2026-11-09: Idah - Rice Facial Wash (2 pcs @ Rp 40.000 = Rp 80.000), Day Gold Small (1 pcs @ Rp 55.000), Night Cream Gold (1 pcs @ Rp 85.000) -> Total Rp 220.000, Tunai

do $$
declare
  v_tx1_id bigint;
  v_tx2_id bigint;
  v_tx3_id bigint;
begin
  -- 1. Transaksi Res. Lutfi (6 Nov 2026)
  insert into public.transactions (customer, subtotal, discount, total, pay_method, cash_received, created_at)
  values ('Res. Lutfi', 50000, 0, 50000, 'Tunai', 50000, '2026-11-06 06:00:00+00')
  returning id into v_tx1_id;

  insert into public.transaction_items (transaction_id, catalog_item_id, category_id, name, price, qty, business_unit)
  values (v_tx1_id, 'g-moist-rice-cream12-5-g', 'produk', 'Moist Rice Cream', 50000, 1, 'gbee');

  -- 2. Transaksi Cust (6 Nov 2026)
  insert into public.transactions (customer, subtotal, discount, total, pay_method, cash_received, created_at)
  values ('Cust', 55000, 0, 55000, 'Tunai', 55000, '2026-11-06 06:30:00+00')
  returning id into v_tx2_id;

  insert into public.transaction_items (transaction_id, catalog_item_id, category_id, name, price, qty, business_unit)
  values (v_tx2_id, 'g-moist-rice-cream12-5-g', 'produk', 'Moist Rice Cream', 55000, 1, 'gbee');

  -- 3. Transaksi Idah (9 Nov 2026)
  insert into public.transactions (customer, subtotal, discount, total, pay_method, cash_received, created_at)
  values ('Idah', 220000, 0, 220000, 'Tunai', 220000, '2026-11-09 06:00:00+00')
  returning id into v_tx3_id;

  insert into public.transaction_items (transaction_id, catalog_item_id, category_id, name, price, qty, business_unit)
  values
    (v_tx3_id, 'g-rice-facial-wash60-ml', 'produk', 'Rice Facial Wash', 40000, 2, 'gbee'),
    (v_tx3_id, 'g-day-gold-small5-g', 'produk', 'Day Gold Small', 55000, 1, 'gbee'),
    (v_tx3_id, 'g-night-cream-gold12-5-g', 'produk', 'Night Cream Gold', 85000, 1, 'gbee');

end $$;


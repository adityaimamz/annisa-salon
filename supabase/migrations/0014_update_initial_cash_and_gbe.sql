-- 0014_update_initial_cash_and_gbe.sql
-- 1. Koreksi transaksi Facial GBE PDT menjadi unit bisnis 'gbee'
-- 2. Input saldo kas awal modal bulan November (M = Rp 148.000) ke tabel daily_cash_books

-- Koreksi Facial GBE PDT
update public.transaction_items
  set business_unit = 'gbee'
  where id = 47 or lower(name) like '%gbe%';

update public.catalog_items
  set business_unit = 'gbee'
  where id = 'facial-gbee' or category_id = 'produk' or lower(name) like '%gbe%';

-- Input data saldo awal buku kas harian sesuai catatan buku manual
insert into public.daily_cash_books (day, opening_cash, cash_withdrawn, closing_cash_actual, notes, is_closed, created_at, updated_at)
values
  ('2026-11-01', 148000, 0, 298000, 'Saldo modal awal bulan (M = Rp 148.000 dari Oktober sesuai buku fisik)', true, now(), now()),
  ('2026-11-02', 298000, 0, 328000, 'Sesuai catatan buku kas fisik (M = Rp 298.000)', true, now(), now())
on conflict (day) do update set
  opening_cash = excluded.opening_cash,
  closing_cash_actual = excluded.closing_cash_actual,
  is_closed = excluded.is_closed,
  notes = excluded.notes,
  updated_at = now();

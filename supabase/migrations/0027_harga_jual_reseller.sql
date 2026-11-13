-- Harga jual ke pelanggan reseller (mis. Night Cream Pink: normal 75rb, reseller 65rb).
-- BEDA dengan item_costs.reseller_price (harga BELI/modal dari pusat, owner-only).
-- Sengaja tabel terpisah dari catalog_items: catalog_items dibaca anon (halaman /produk),
-- sedangkan harga reseller hanya untuk karyawan di Kasir.

create table if not exists public.item_reseller_prices (
  item_id text primary key references public.catalog_items(id) on delete cascade,
  price integer not null check (price >= 0),
  updated_at timestamptz not null default now()
);

alter table public.item_reseller_prices enable row level security;
drop policy if exists item_reseller_prices_staff_read on public.item_reseller_prices;
drop policy if exists item_reseller_prices_owner_write on public.item_reseller_prices;
create policy item_reseller_prices_staff_read on public.item_reseller_prices for select using (public.is_staff());
create policy item_reseller_prices_owner_write on public.item_reseller_prices for all using (public.is_owner()) with check (public.is_owner());

-- Kolom tambahan untuk kasir & halaman produk, plus fungsi transaksi atomik.

-- seri produk (untuk pengelompokan di halaman /produk)
alter table public.catalog_items add column series text;

update public.catalog_items set series = 'Seri Pink'
  where category_id = 'produk' and name in ('Day Cream Pink','Night Cream Pink','Facial Wash Pink');
update public.catalog_items set series = 'Seri Gold'
  where category_id = 'produk' and name in ('Day Cream Gold','Day Gold Small','Night Cream Gold','Facial Wash Gold');
update public.catalog_items set series = 'Seri Rice'
  where category_id = 'produk' and name in ('Moist Rice Cream','Rice Facial Wash','Rice Jelly Face');
update public.catalog_items set series = 'Toner'
  where category_id = 'produk' and name in ('Oxy Beauty','Toner Watermelon','Toner Lemon Juice');
update public.catalog_items set series = 'Cleansing Milk'
  where category_id = 'produk' and name = 'Cleansing Milk';
update public.catalog_items set series = 'Jelly Face'
  where category_id = 'produk' and name in ('Bee Jelly Face','Cardamom & Rose','Cucumber Jelly Face');
update public.catalog_items set series = 'Untuk Pria'
  where category_id = 'produk' and name in ('Face Lotion Men','Facial Wash Men');
update public.catalog_items set series = 'Masker'
  where category_id = 'produk' and name = 'Green Mask';

-- data struk
alter table public.transactions
  add column customer_wa text,
  add column cash_received integer check (cash_received >= 0);

-- menghapus item katalog tidak boleh gagal karena riwayat transaksi
alter table public.transaction_items
  drop constraint transaction_items_catalog_item_id_fkey,
  add constraint transaction_items_catalog_item_id_fkey
    foreign key (catalog_item_id) references public.catalog_items(id) on delete set null;

-- satu panggilan = satu transaksi + semua itemnya (atomik).
-- security invoker: RLS tetap berlaku, hanya staf yang bisa memanggil.
create function public.create_transaction(
  p_customer text,
  p_customer_wa text,
  p_discount integer,
  p_pay text,
  p_cash integer,
  p_items jsonb
) returns public.transactions
language plpgsql security invoker set search_path = public as $$
declare
  v_sub integer;
  v_disc integer;
  v_tx public.transactions;
begin
  if not public.is_staff() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pesanan kosong';
  end if;

  select coalesce(sum((i->>'price')::integer * (i->>'qty')::integer), 0)
    into v_sub from jsonb_array_elements(p_items) i;
  v_disc := least(greatest(coalesce(p_discount, 0), 0), v_sub);

  insert into public.transactions
    (customer, customer_wa, subtotal, discount, total, pay_method, cash_received)
  values
    (nullif(trim(p_customer), ''), nullif(trim(p_customer_wa), ''),
     v_sub, v_disc, v_sub - v_disc, p_pay, nullif(p_cash, 0))
  returning * into v_tx;

  insert into public.transaction_items
    (transaction_id, catalog_item_id, category_id, name, price, qty, therapist_id)
  select v_tx.id,
         nullif(i->>'catalog_item_id', ''),
         nullif(i->>'category_id', ''),
         i->>'name',
         (i->>'price')::integer,
         (i->>'qty')::integer,
         nullif(i->>'therapist_id', '')::bigint
  from jsonb_array_elements(p_items) i;

  return v_tx;
end $$;

revoke execute on function public.create_transaction(text, text, integer, text, integer, jsonb) from public, anon;
grant execute on function public.create_transaction(text, text, integer, text, integer, jsonb) to authenticated;

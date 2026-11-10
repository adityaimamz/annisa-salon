-- Migration 0018: Koreksi perawatan/layanan berbahan Gbee (mis. Facial GBE PDT, Facial Glow Beauty)
-- agar masuk ke unit bisnis 'salon', sedangkan 'gbee' khusus untuk penjualan produk Gbee.

-- 1. Kembalikan semua layanan/perawatan di katalog ke unit bisnis 'salon'
update public.catalog_items
  set business_unit = 'salon'
  where is_service = true or category_id <> 'produk';

-- 2. Kembalikan item transaksi layanan/perawatan (seperti Facial GBE PDT, Facial Glow Beauty, Totok Gbee)
--    yang bukan kategori 'produk' ke unit bisnis 'salon'
update public.transaction_items
  set business_unit = 'salon'
  where coalesce(category_id, '') <> 'produk'
    and (
      id = 47
      or catalog_item_id = 'facial-gbee'
      or category_id in ('rambut', 'wajah', 'badan', 'kuku', 'anak')
      or therapist_id is not null
      or lower(name) like '%facial%'
      or lower(name) like '%totok%'
      or lower(name) like '%pdt%'
    );

-- 3. Perbarui fungsi create_transaction agar fallback hanya menjadikan kategori 'produk' sebagai 'gbee'
create or replace function public.create_transaction(
  p_customer text,
  p_customer_wa text,
  p_discount integer,
  p_pay text,
  p_cash integer,
  p_items jsonb,
  p_client_id uuid default null,
  p_created_at timestamptz default null
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_sub integer;
  v_disc integer;
  v_tx public.transactions;
  v_at timestamptz;
begin
  if not public.is_staff() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;

  if p_client_id is not null then
    select * into v_tx from public.transactions
      where client_id = p_client_id and cashier_id is not distinct from auth.uid();
    if found then return v_tx; end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pesanan kosong';
  end if;

  select coalesce(sum((i->>'price')::integer * (i->>'qty')::integer), 0)
    into v_sub from jsonb_array_elements(p_items) i;
  v_disc := least(greatest(coalesce(p_discount, 0), 0), v_sub);
  v_at := least(greatest(coalesce(p_created_at, now()), now() - interval '14 days'), now());

  insert into public.transactions
    (customer, customer_wa, subtotal, discount, total, pay_method, cash_received, client_id, created_at)
  values
    (nullif(trim(p_customer), ''), nullif(trim(p_customer_wa), ''),
     v_sub, v_disc, v_sub - v_disc, p_pay, nullif(p_cash, 0), p_client_id, v_at)
  returning * into v_tx;

  insert into public.transaction_items
    (transaction_id, catalog_item_id, category_id, name, price, qty, therapist_id, business_unit)
  select v_tx.id,
         nullif(i->>'catalog_item_id', ''),
         nullif(i->>'category_id', ''),
         i->>'name',
         (i->>'price')::integer,
         (i->>'qty')::integer,
         nullif(i->>'therapist_id', '')::bigint,
         coalesce(
           nullif(i->>'business_unit', ''),
           (select ci.business_unit from public.catalog_items ci where ci.id = nullif(i->>'catalog_item_id', '')),
           case when nullif(i->>'category_id', '') = 'produk' then 'gbee' else 'salon' end,
           'salon'
         )
  from jsonb_array_elements(p_items) i;

  return v_tx;
end $$;

-- 4. Perbarui fungsi update_transaction agar fallback hanya menjadikan kategori 'produk' sebagai 'gbee'
create or replace function public.update_transaction(
  p_id bigint,
  p_customer text,
  p_customer_wa text,
  p_discount integer,
  p_pay text,
  p_items jsonb
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_sub integer;
  v_disc integer;
  v_tx public.transactions;
begin
  if not public.is_owner() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;
  if p_pay not in ('Tunai', 'QRIS', 'Transfer') then
    raise exception 'Metode bayar tidak valid';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Transaksi harus punya minimal satu layanan';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) i
    where coalesce(trim(i->>'name'), '') = '' or (i->>'price')::integer < 0 or (i->>'qty')::integer < 1
  ) then
    raise exception 'Nama, harga, dan jumlah layanan tidak valid';
  end if;

  select * into v_tx from public.transactions where id = p_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;

  select coalesce(sum((i->>'price')::integer * (i->>'qty')::integer), 0)
    into v_sub from jsonb_array_elements(p_items) i;
  v_disc := least(greatest(coalesce(p_discount, 0), 0), v_sub);

  delete from public.transaction_items where transaction_id = p_id;
  insert into public.transaction_items
    (transaction_id, catalog_item_id, category_id, name, price, qty, therapist_id, business_unit)
  select p_id,
         nullif(i->>'catalog_item_id', ''),
         nullif(i->>'category_id', ''),
         trim(i->>'name'),
         (i->>'price')::integer,
         (i->>'qty')::integer,
         nullif(i->>'therapist_id', '')::bigint,
         coalesce(
           nullif(i->>'business_unit', ''),
           (select ci.business_unit from public.catalog_items ci where ci.id = nullif(i->>'catalog_item_id', '')),
           case when nullif(i->>'category_id', '') = 'produk' then 'gbee' else 'salon' end,
           'salon'
         )
  from jsonb_array_elements(p_items) i;

  update public.transactions set
    customer = nullif(trim(p_customer), ''),
    customer_wa = nullif(trim(p_customer_wa), ''),
    subtotal = v_sub,
    discount = v_disc,
    total = v_sub - v_disc,
    pay_method = p_pay,
    cash_received = case when p_pay = 'Tunai' and coalesce(cash_received, 0) >= v_sub - v_disc then cash_received else null end
  where id = p_id
  returning * into v_tx;

  return v_tx;
end $$;


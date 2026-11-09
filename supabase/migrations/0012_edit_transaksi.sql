-- Koreksi transaksi penuh (hanya owner): metode bayar, diskon, dan seluruh baris layanan.
-- Baris lama diganti baris baru dalam satu transaksi database; subtotal dan total dihitung di server.
-- Nomor struk, waktu bayar, dan kasir tidak berubah.

create function public.update_transaction(
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
    (transaction_id, catalog_item_id, category_id, name, price, qty, therapist_id)
  select p_id,
         nullif(i->>'catalog_item_id', ''),
         nullif(i->>'category_id', ''),
         trim(i->>'name'),
         (i->>'price')::integer,
         (i->>'qty')::integer,
         nullif(i->>'therapist_id', '')::bigint
  from jsonb_array_elements(p_items) i;

  update public.transactions set
    customer = nullif(trim(p_customer), ''),
    customer_wa = nullif(trim(p_customer_wa), ''),
    subtotal = v_sub,
    discount = v_disc,
    total = v_sub - v_disc,
    pay_method = p_pay,
    -- uang diterima hanya berarti untuk tunai dan harus cukup untuk total baru
    cash_received = case when p_pay = 'Tunai' and coalesce(cash_received, 0) >= v_sub - v_disc then cash_received else null end
  where id = p_id
  returning * into v_tx;

  return v_tx;
end $$;

revoke execute on function public.update_transaction(bigint, text, text, integer, text, jsonb) from public, anon;
grant execute on function public.update_transaction(bigint, text, text, integer, text, jsonb) to authenticated;

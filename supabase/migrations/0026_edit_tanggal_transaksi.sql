-- Owner bisa mengubah tanggal/waktu transaksi saat edit (mis. transaksi kemarin yang baru diinput).
-- p_created_at null = waktu tidak berubah. Tidak boleh di masa depan.
-- Kunjungan member (cap/gratis) terkait ikut dipindah supaya hitungan cap dan masa berlaku konsisten.

drop function if exists public.update_transaction(bigint, text, text, integer, text, jsonb);

create function public.update_transaction(
  p_id bigint,
  p_customer text,
  p_customer_wa text,
  p_discount integer,
  p_pay text,
  p_items jsonb,
  p_created_at timestamptz default null
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_sub integer;
  v_disc integer;
  v_tx public.transactions;
  v_at timestamptz;
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
  if p_created_at is not null and p_created_at > now() + interval '5 minutes' then
    raise exception 'Tanggal transaksi tidak boleh di masa depan';
  end if;

  select * into v_tx from public.transactions where id = p_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;

  v_at := least(coalesce(p_created_at, v_tx.created_at), now());

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
    cash_received = case when p_pay = 'Tunai' and coalesce(cash_received, 0) >= v_sub - v_disc then cash_received else null end,
    created_at = v_at
  where id = p_id
  returning * into v_tx;

  update public.member_visits set visited_at = v_at where transaction_id = p_id;

  return v_tx;
end $$;

revoke execute on function public.update_transaction(bigint, text, text, integer, text, jsonb, timestamptz) from public, anon;
grant execute on function public.update_transaction(bigint, text, text, integer, text, jsonb, timestamptz) to authenticated;

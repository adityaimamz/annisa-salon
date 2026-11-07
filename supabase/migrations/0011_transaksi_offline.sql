-- Dukungan transaksi offline: client_id (anti ganda saat kirim ulang) dan waktu bayar asli.
-- Kirim ulang dengan client_id yang sama mengembalikan transaksi yang sudah ada, tidak membuat baru.

alter table public.transactions add column client_id uuid;
create unique index transactions_client_id_key on public.transactions (client_id) where client_id is not null;

drop function public.create_transaction(text, text, integer, text, integer, jsonb);

create function public.create_transaction(
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
  -- waktu bayar dari perangkat: tidak boleh di masa depan, maksimal 14 hari ke belakang
  v_at := least(greatest(coalesce(p_created_at, now()), now() - interval '14 days'), now());

  insert into public.transactions
    (customer, customer_wa, subtotal, discount, total, pay_method, cash_received, client_id, created_at)
  values
    (nullif(trim(p_customer), ''), nullif(trim(p_customer_wa), ''),
     v_sub, v_disc, v_sub - v_disc, p_pay, nullif(p_cash, 0), p_client_id, v_at)
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

revoke execute on function public.create_transaction(text, text, integer, text, integer, jsonb, uuid, timestamptz) from public, anon;
grant execute on function public.create_transaction(text, text, integer, text, integer, jsonb, uuid, timestamptz) to authenticated;

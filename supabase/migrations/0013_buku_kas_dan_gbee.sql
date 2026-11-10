-- 0013_buku_kas_dan_gbee.sql
-- 1. Pemisahan entitas Salon vs Gbee (catalog_items, transaction_items, expenses)
-- 2. Buku Kas Kasir harian (tabel daily_cash_books & RPC get_daily_cash_summary, save_daily_cash_book)

-- ---------- 1. Penanda Unit Bisnis: Salon vs Gbee ----------
alter table public.catalog_items
  add column if not exists business_unit text not null default 'salon'
  check (business_unit in ('salon', 'gbee'));

-- Produk skincare dan layanan berbahan Gbee ditandai sebagai 'gbee'
update public.catalog_items set business_unit = 'gbee'
  where category_id = 'produk' or id = 'facial-gbee';

alter table public.transaction_items
  add column if not exists business_unit text not null default 'salon'
  check (business_unit in ('salon', 'gbee'));

update public.transaction_items set business_unit = 'gbee'
  where category_id = 'produk'
     or catalog_item_id = 'facial-gbee'
     or lower(name) like '%gbee%';

-- Pengeluaran: metode bayar (Tunai laci vs Transfer rekening) dan unit bisnis
alter table public.expenses
  add column if not exists pay_method text not null default 'Tunai'
  check (pay_method in ('Tunai', 'Transfer'));

alter table public.expenses
  add column if not exists business_unit text not null default 'operasional'
  check (business_unit in ('salon', 'gbee', 'operasional'));

update public.expenses set business_unit = 'gbee'
  where lower(coalesce(note, '')) like '%gbee%' or category = 'Stok produk';

-- Perbarui create_transaction agar menyimpan business_unit di transaction_items
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
           case when nullif(i->>'category_id', '') = 'produk' or nullif(i->>'catalog_item_id', '') = 'facial-gbee' then 'gbee' else 'salon' end,
           'salon'
         )
  from jsonb_array_elements(p_items) i;

  return v_tx;
end $$;

-- Perbarui update_transaction agar mempertahankan/menyimpan business_unit
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
           case when nullif(i->>'category_id', '') = 'produk' or nullif(i->>'catalog_item_id', '') = 'facial-gbee' then 'gbee' else 'salon' end,
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

-- ---------- 2. Tabel Buku Kas Harian ----------
create table if not exists public.daily_cash_books (
  day date primary key default (now() at time zone 'Asia/Jakarta')::date,
  opening_cash integer not null default 0 check (opening_cash >= 0),
  cash_withdrawn integer not null default 0 check (cash_withdrawn >= 0),
  closing_cash_actual integer check (closing_cash_actual >= 0),
  notes text,
  is_closed boolean not null default false,
  opened_by uuid references public.profiles(id) default auth.uid(),
  closed_by uuid references public.profiles(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_cash_books enable row level security;
drop policy if exists daily_cash_books_staff_read on public.daily_cash_books;
drop policy if exists daily_cash_books_staff_write on public.daily_cash_books;
create policy daily_cash_books_staff_read on public.daily_cash_books for select using (public.is_staff());
create policy daily_cash_books_staff_write on public.daily_cash_books for all using (public.is_staff()) with check (public.is_staff());

-- RPC untuk mendapatkan rekap buku kas harian secara lengkap dan aman bagi staf/owner
create or replace function public.get_daily_cash_summary(p_day date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Asia/Jakarta')::date);
  v_book record;
  v_prev record;
  v_opening integer := 0;
  v_withdrawn integer := 0;
  v_closing_actual integer := null;
  v_notes text := null;
  v_is_closed boolean := false;
  v_closed_at timestamptz := null;
  v_closed_by_name text := null;

  v_total_sales integer := 0;
  v_cash_salon integer := 0;
  v_cash_gbee integer := 0;
  v_qris_salon integer := 0;
  v_qris_gbee integer := 0;
  v_transfer_salon integer := 0;
  v_transfer_gbee integer := 0;
  v_cash_expenses integer := 0;
  v_expected_cash integer := 0;

  v_txs jsonb := '[]'::jsonb;
begin
  if not public.is_staff() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;

  -- 1. Ambil rekaman daily_cash_books hari ini jika sudah ada
  select * into v_book from public.daily_cash_books where day = v_day;
  if found then
    v_opening := v_book.opening_cash;
    v_withdrawn := v_book.cash_withdrawn;
    v_closing_actual := v_book.closing_cash_actual;
    v_notes := v_book.notes;
    v_is_closed := v_book.is_closed;
    v_closed_at := v_book.closed_at;
    if v_book.closed_by is not null then
      select name into v_closed_by_name from public.profiles where id = v_book.closed_by;
    end if;
  else
    -- Cari hari sebelumnya yang paling dekat untuk mengambil sisa kas terakhir
    select * into v_prev from public.daily_cash_books
      where day < v_day order by day desc limit 1;
    if found then
      -- Saldo awal hari ini = sisa fisik kemarin dikurangi uang yang diambil/disetor
      v_opening := greatest(0, coalesce(v_prev.closing_cash_actual, v_prev.opening_cash) - coalesce(v_prev.cash_withdrawn, 0));
    else
      v_opening := 0;
    end if;
  end if;

  -- 2. Hitung penjualan hari ini berdasarkan transaksi dan alokasi Salon vs Gbee
  with day_tx as (
    select t.id, t.no, t.customer, t.pay_method, t.subtotal, t.discount, t.total, t.created_at,
           coalesce(sum(ti.price * ti.qty) filter (where ti.business_unit = 'salon'), 0) as sub_salon,
           coalesce(sum(ti.price * ti.qty) filter (where ti.business_unit = 'gbee'), 0) as sub_gbee
    from public.transactions t
    left join public.transaction_items ti on ti.transaction_id = t.id
    where (t.created_at at time zone 'Asia/Jakarta')::date = v_day
    group by t.id, t.no, t.customer, t.pay_method, t.subtotal, t.discount, t.total, t.created_at
  ),
  day_split as (
    select dt.*,
           case when dt.subtotal > 0 then round(dt.discount::numeric * dt.sub_salon / dt.subtotal)::integer else 0 end as disc_salon,
           dt.discount - (case when dt.subtotal > 0 then round(dt.discount::numeric * dt.sub_salon / dt.subtotal)::integer else 0 end) as disc_gbee
    from day_tx dt
  ),
  day_alloc as (
    select ds.*,
           greatest(0, ds.sub_salon - ds.disc_salon) as tot_salon,
           greatest(0, ds.sub_gbee - ds.disc_gbee) as tot_gbee
    from day_split ds
  )
  select
    coalesce(sum(total), 0),
    coalesce(sum(tot_salon) filter (where pay_method = 'Tunai'), 0),
    coalesce(sum(tot_gbee) filter (where pay_method = 'Tunai'), 0),
    coalesce(sum(tot_salon) filter (where pay_method = 'QRIS'), 0),
    coalesce(sum(tot_gbee) filter (where pay_method = 'QRIS'), 0),
    coalesce(sum(tot_salon) filter (where pay_method = 'Transfer'), 0),
    coalesce(sum(tot_gbee) filter (where pay_method = 'Transfer'), 0),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id, 'no', no, 'cust', customer, 'pay', pay_method,
        'total', total, 'salon', tot_salon, 'gbee', tot_gbee,
        'time', to_char(created_at at time zone 'Asia/Jakarta', 'HH24:MI')
      ) order by created_at asc
    ), '[]'::jsonb)
  into
    v_total_sales, v_cash_salon, v_cash_gbee,
    v_qris_salon, v_qris_gbee, v_transfer_salon, v_transfer_gbee,
    v_txs
  from day_alloc;

  -- 3. Hitung pengeluaran kasir tunai hari ini
  select coalesce(sum(amount), 0) into v_cash_expenses
    from public.expenses
    where (created_at at time zone 'Asia/Jakarta')::date = v_day
      and pay_method = 'Tunai';

  -- 4. Hitung uang fisik laci seharusnya
  -- Rumus: Modal (M) + Tunai Salon + Tunai Gbee - Pengeluaran Kasir Tunai - Setor ke Owner
  v_expected_cash := v_opening + v_cash_salon + v_cash_gbee - v_cash_expenses - v_withdrawn;

  return jsonb_build_object(
    'day', v_day,
    'opening_cash', v_opening,
    'cash_withdrawn', v_withdrawn,
    'closing_cash_actual', v_closing_actual,
    'notes', v_notes,
    'is_closed', v_is_closed,
    'closed_at', v_closed_at,
    'closed_by_name', v_closed_by_name,
    'total_sales', v_total_sales,
    'cash_sales_salon', v_cash_salon,
    'cash_sales_gbee', v_cash_gbee,
    'cash_sales_total', v_cash_salon + v_cash_gbee,
    'qris_sales_salon', v_qris_salon,
    'qris_sales_gbee', v_qris_gbee,
    'qris_sales_total', v_qris_salon + v_qris_gbee,
    'transfer_sales_salon', v_transfer_salon,
    'transfer_sales_gbee', v_transfer_gbee,
    'transfer_sales_total', v_transfer_salon + v_transfer_gbee,
    'cash_expenses', v_cash_expenses,
    'expected_cash', v_expected_cash,
    'difference', case when v_closing_actual is not null then v_closing_actual - v_expected_cash else null end,
    'tx_lines', v_txs
  );
end $$;

-- RPC untuk menyimpan / memperbarui buku kas harian
create or replace function public.save_daily_cash_book(
  p_day date,
  p_opening_cash integer,
  p_cash_withdrawn integer default 0,
  p_closing_cash_actual integer default null,
  p_notes text default null,
  p_is_closed boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;

  insert into public.daily_cash_books
    (day, opening_cash, cash_withdrawn, closing_cash_actual, notes, is_closed,
     closed_at, closed_by, updated_at)
  values
    (p_day, greatest(0, coalesce(p_opening_cash, 0)), greatest(0, coalesce(p_cash_withdrawn, 0)),
     p_closing_cash_actual, nullif(trim(p_notes), ''), p_is_closed,
     case when p_is_closed then now() else null end,
     case when p_is_closed then auth.uid() else null end,
     now())
  on conflict (day) do update set
    opening_cash = greatest(0, coalesce(p_opening_cash, excluded.opening_cash)),
    cash_withdrawn = greatest(0, coalesce(p_cash_withdrawn, excluded.cash_withdrawn)),
    closing_cash_actual = excluded.closing_cash_actual,
    notes = nullif(trim(p_notes), ''),
    is_closed = excluded.is_closed,
    closed_at = case when excluded.is_closed then now() else public.daily_cash_books.closed_at end,
    closed_by = case when excluded.is_closed then auth.uid() else public.daily_cash_books.closed_by end,
    updated_at = now();

  return public.get_daily_cash_summary(p_day);
end $$;

revoke execute on function public.get_daily_cash_summary(date) from public, anon;
revoke execute on function public.save_daily_cash_book(date, integer, integer, integer, text, boolean) from public, anon;
grant execute on function public.get_daily_cash_summary(date) to authenticated;
grant execute on function public.save_daily_cash_book(date, integer, integer, integer, text, boolean) to authenticated;


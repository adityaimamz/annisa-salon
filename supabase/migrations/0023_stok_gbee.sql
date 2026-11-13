-- 0023_stok_gbee.sql
-- Stok produk Gbee + harga reseller (modal), khusus admin/owner.
--  * item_costs     : harga reseller (modal) per produk. Sengaja TERPISAH dari catalog_items,
--                     karena catalog_items dibaca karyawan dan halaman publik /produk.
--  * stock_entries  : catatan stok masuk (awal / masuk / koreksi). Stok KELUAR tidak disimpan,
--                     dihitung dari transaction_items, jadi edit/hapus transaksi otomatis konsisten.
--  * sisa = jumlah catatan stok - penjualan sejak tanggal catatan stok pertama produk itu.

-- ---------- tabel ----------
create table if not exists public.item_costs (
  item_id text primary key references public.catalog_items(id) on delete cascade,
  reseller_price integer check (reseller_price >= 0),
  source text,
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_entries (
  id bigint generated always as identity primary key,
  item_id text not null references public.catalog_items(id) on delete cascade,
  kind text not null check (kind in ('awal', 'masuk', 'koreksi')),
  qty integer not null check (qty <> 0),
  source text,
  unit_cost integer check (unit_cost >= 0),
  note text,
  at timestamptz not null default now(),
  expense_id bigint references public.expenses(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists stock_entries_item_at on public.stock_entries (item_id, at);

alter table public.item_costs enable row level security;
alter table public.stock_entries enable row level security;
drop policy if exists item_costs_owner on public.item_costs;
drop policy if exists stock_entries_owner on public.stock_entries;
create policy item_costs_owner on public.item_costs for all using (public.is_owner()) with check (public.is_owner());
create policy stock_entries_owner on public.stock_entries for all using (public.is_owner()) with check (public.is_owner());

-- ---------- sisa stok saat ini (semua staff; hanya mengembalikan id + sisa) ----------
create or replace function public.get_stock_levels()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
             jsonb_build_object('item_id', s.item_id, 'sisa', s.total_in - coalesce(k.sold, 0))
             order by s.item_id)
    from (
      select se.item_id, min(se.at) as start_at, sum(se.qty)::integer as total_in
      from public.stock_entries se
      group by se.item_id
    ) s
    left join lateral (
      select sum(ti.qty)::integer as sold
      from public.transaction_items ti
      join public.transactions t on t.id = ti.transaction_id
      where ti.catalog_item_id = s.item_id and t.created_at >= s.start_at
    ) k on true
  ), '[]'::jsonb);
end $$;

-- ---------- rekap bulanan: awal / masuk / koreksi / keluar / sisa (owner) ----------
create or replace function public.get_stock_monthly(p_month date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_first date;
  v_ms timestamptz;
  v_me timestamptz;
begin
  if not public.is_owner() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;

  v_first := date_trunc('month', p_month::timestamp)::date;
  v_ms := v_first::timestamp at time zone 'Asia/Jakarta';
  v_me := (v_first + interval '1 month')::timestamp at time zone 'Asia/Jakarta';

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'item_id', x.item_id,
             'awal', x.in_before - x.sold_before,
             'masuk', x.masuk,
             'koreksi', x.koreksi,
             'keluar', x.sold_month,
             'sisa', x.in_before - x.sold_before + x.masuk + x.koreksi - x.sold_month
           ) order by x.item_id)
    from (
      select s.item_id, s.in_before, s.masuk, s.koreksi,
             coalesce(sb.q, 0) as sold_before,
             coalesce(sm.q, 0) as sold_month
      from (
        select se.item_id,
               min(se.at) as start_at,
               coalesce(sum(se.qty) filter (where se.at < v_ms), 0)::integer as in_before,
               coalesce(sum(se.qty) filter (where se.at >= v_ms and se.at < v_me and se.kind <> 'koreksi'), 0)::integer as masuk,
               coalesce(sum(se.qty) filter (where se.at >= v_ms and se.at < v_me and se.kind = 'koreksi'), 0)::integer as koreksi
        from public.stock_entries se
        group by se.item_id
        having min(se.at) < v_me
      ) s
      left join lateral (
        select sum(ti.qty)::integer as q
        from public.transaction_items ti
        join public.transactions t on t.id = ti.transaction_id
        where ti.catalog_item_id = s.item_id
          and t.created_at >= s.start_at and t.created_at < v_ms
      ) sb on true
      left join lateral (
        select sum(ti.qty)::integer as q
        from public.transaction_items ti
        join public.transactions t on t.id = ti.transaction_id
        where ti.catalog_item_id = s.item_id
          and t.created_at >= greatest(s.start_at, v_ms) and t.created_at < v_me
      ) sm on true
    ) x
  ), '[]'::jsonb);
end $$;

-- ---------- catat stok (awal / masuk / koreksi), sekali banyak produk (owner) ----------
-- p_items: [{"item_id": "...", "qty": 10, "unit_cost": 45000}, ...]
-- p_expense = true (hanya kind 'masuk'): sekaligus membuat satu pengeluaran "Stok produk" (unit Gbee).
-- unit_cost yang diisi juga memperbarui harga reseller + sumber produk tsb.
create or replace function public.add_stock_entries(
  p_items jsonb,
  p_kind text default 'masuk',
  p_source text default null,
  p_at timestamptz default null,
  p_note text default null,
  p_expense boolean default false,
  p_pay text default 'Tunai'
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz;
  v_total integer := 0;
  v_exp bigint := null;
  v_n integer;
  v_src text := nullif(trim(p_source), '');
begin
  if not public.is_owner() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;
  if p_kind not in ('awal', 'masuk', 'koreksi') then
    raise exception 'Jenis catatan stok tidak valid';
  end if;
  if p_pay not in ('Tunai', 'Transfer') then
    raise exception 'Metode bayar tidak valid';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pilih minimal satu produk';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) i
    where coalesce(i->>'item_id', '') = ''
       or coalesce((i->>'qty')::integer, 0) = 0
       or (p_kind <> 'koreksi' and (i->>'qty')::integer < 0)
       or coalesce((i->>'unit_cost')::integer, 0) < 0
  ) then
    raise exception 'Produk atau jumlah tidak valid';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) i
    where not exists (select 1 from public.catalog_items ci where ci.id = i->>'item_id')
  ) then
    raise exception 'Produk tidak ditemukan';
  end if;

  v_at := least(coalesce(p_at, now()), now());

  if p_expense and p_kind = 'masuk' then
    select coalesce(sum((i->>'qty')::integer * coalesce((i->>'unit_cost')::integer, 0)), 0)
      into v_total from jsonb_array_elements(p_items) i;
    if v_total > 0 then
      insert into public.expenses (category, amount, note, created_at, pay_method, business_unit)
      values ('Stok produk', v_total,
              'Stok masuk' || coalesce(' - ' || v_src, ''),
              v_at, p_pay, 'gbee')
      returning id into v_exp;
    end if;
  end if;

  insert into public.stock_entries (item_id, kind, qty, source, unit_cost, note, at, expense_id)
  select i->>'item_id', p_kind, (i->>'qty')::integer, v_src,
         nullif(i->>'unit_cost', '')::integer, nullif(trim(p_note), ''), v_at,
         case when coalesce((i->>'unit_cost')::integer, 0) > 0 then v_exp else null end
  from jsonb_array_elements(p_items) i;
  get diagnostics v_n = row_count;

  if p_kind <> 'koreksi' then
    insert into public.item_costs (item_id, reseller_price, source, updated_at)
    select d.item_id, d.unit_cost, v_src, now()
    from (
      select distinct on (i.value->>'item_id')
             i.value->>'item_id' as item_id,
             (i.value->>'unit_cost')::integer as unit_cost
      from jsonb_array_elements(p_items) with ordinality as i(value, ord)
      where nullif(i.value->>'unit_cost', '') is not null
      order by i.value->>'item_id', i.ord desc
    ) d
    on conflict (item_id) do update set
      reseller_price = excluded.reseller_price,
      source = coalesce(excluded.source, public.item_costs.source),
      updated_at = now();
  end if;

  return v_n;
end $$;

-- ---------- hapus satu catatan stok; pengeluaran terkait ikut disesuaikan (owner) ----------
create or replace function public.delete_stock_entry(p_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_e public.stock_entries;
  v_left integer;
begin
  if not public.is_owner() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;

  select * into v_e from public.stock_entries where id = p_id for update;
  if not found then raise exception 'Catatan stok tidak ditemukan'; end if;

  delete from public.stock_entries where id = p_id;

  if v_e.expense_id is not null and v_e.kind = 'masuk' then
    select amount - v_e.qty * coalesce(v_e.unit_cost, 0) into v_left
      from public.expenses where id = v_e.expense_id for update;
    if found then
      if v_left > 0 then
        update public.expenses set amount = v_left where id = v_e.expense_id;
      else
        delete from public.expenses where id = v_e.expense_id;
      end if;
    end if;
  end if;
end $$;

revoke execute on function public.get_stock_levels() from public, anon;
revoke execute on function public.get_stock_monthly(date) from public, anon;
revoke execute on function public.add_stock_entries(jsonb, text, text, timestamptz, text, boolean, text) from public, anon;
revoke execute on function public.delete_stock_entry(bigint) from public, anon;
grant execute on function public.get_stock_levels() to authenticated;
grant execute on function public.get_stock_monthly(date) to authenticated;
grant execute on function public.add_stock_entries(jsonb, text, text, timestamptz, text, boolean, text) to authenticated;
grant execute on function public.delete_stock_entry(bigint) to authenticated;

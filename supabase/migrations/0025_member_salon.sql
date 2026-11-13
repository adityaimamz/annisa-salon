-- 0025_member_salon.sql
-- Member salon (menggantikan kartu member fisik untuk member BARU; kartu lama dibiarkan sampai habis).
--  * Daftar gratis. Berlaku 1 tahun sejak daftar; setelah itu hangus -> daftar baru (baris member baru).
--  * Tiap kunjungan berbayar yang memuat layanan = 1 cap (walau layanannya lebih dari satu).
--  * Setiap 10 cap = 1x treatment gratis (layanan yang sama seperti biasa). Gratis dicatat sebagai transaksi
--    biasa dengan harga layanan Rp 0 dan TIDAK menambah cap.
--  * Cap dicatat otomatis saat bayar di Kasir (di dalam create_transaction, satu transaksi database).
--    Hapus transaksi -> cap/gratis ikut terhapus (on delete cascade).
--  * Yang mencatat hanya pihak salon; member tidak punya akun.

create table if not exists public.members (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  wa text,
  joined_on date not null default (now() at time zone 'Asia/Jakarta')::date,
  expires_on date not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists members_name_idx on public.members (lower(name));

create table if not exists public.member_visits (
  id bigint generated always as identity primary key,
  member_id bigint not null references public.members(id) on delete cascade,
  transaction_id bigint references public.transactions(id) on delete cascade,
  kind text not null check (kind in ('stamp', 'free')),
  treatments text,
  visited_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid()
);
create index if not exists member_visits_member_idx on public.member_visits (member_id, visited_at);
create unique index if not exists member_visits_tx_key on public.member_visits (transaction_id) where transaction_id is not null;

alter table public.members enable row level security;
alter table public.member_visits enable row level security;
drop policy if exists members_staff_read on public.members;
drop policy if exists members_owner_write on public.members;
drop policy if exists member_visits_staff_read on public.member_visits;
drop policy if exists member_visits_owner_write on public.member_visits;
create policy members_staff_read on public.members for select using (public.is_staff());
create policy members_owner_write on public.members for all using (public.is_owner()) with check (public.is_owner());
create policy member_visits_staff_read on public.member_visits for select using (public.is_staff());
create policy member_visits_owner_write on public.member_visits for all using (public.is_owner()) with check (public.is_owner());

-- ---------- daftar member baru (semua staff) ----------
create or replace function public.create_member(p_name text, p_wa text default null, p_joined date default null)
returns public.members
language plpgsql security definer set search_path = public as $$
declare
  v_m public.members;
  v_joined date := coalesce(p_joined, (now() at time zone 'Asia/Jakarta')::date);
begin
  if not public.is_staff() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nama member wajib diisi';
  end if;
  if v_joined > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal daftar tidak boleh di masa depan';
  end if;
  insert into public.members (name, wa, joined_on, expires_on)
  values (trim(p_name), nullif(trim(p_wa), ''), v_joined, (v_joined + interval '1 year')::date)
  returning * into v_m;
  return v_m;
end $$;

-- ---------- cap manual (owner): untuk kunjungan yang lupa dicatat di Kasir ----------
create or replace function public.add_member_visit(
  p_member_id bigint, p_kind text default 'stamp', p_treatments text default null, p_at timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_m public.members;
  v_at timestamptz := least(coalesce(p_at, now()), now());
  v_day date;
  v_stamps integer;
  v_free integer;
begin
  if not public.is_owner() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;
  if p_kind not in ('stamp', 'free') then
    raise exception 'Jenis kunjungan tidak valid';
  end if;
  select * into v_m from public.members where id = p_member_id for update;
  if not found then raise exception 'Member tidak ditemukan'; end if;
  v_day := (v_at at time zone 'Asia/Jakarta')::date;
  if v_day < v_m.joined_on or v_day > v_m.expires_on then
    raise exception 'Tanggal di luar masa berlaku member';
  end if;
  if p_kind = 'free' then
    select count(*) filter (where kind = 'stamp'), count(*) filter (where kind = 'free')
      into v_stamps, v_free from public.member_visits where member_id = p_member_id;
    if v_stamps / 10 - v_free <= 0 then raise exception 'Cap belum cukup untuk treatment gratis'; end if;
  end if;
  insert into public.member_visits (member_id, kind, treatments, visited_at)
  values (p_member_id, p_kind, nullif(trim(p_treatments), ''), v_at);
end $$;

-- ---------- create_transaction: tambah parameter member (cap / gratis otomatis) ----------
drop function if exists public.create_transaction(text, text, integer, text, integer, jsonb, uuid, timestamptz);

create function public.create_transaction(
  p_customer text,
  p_customer_wa text,
  p_discount integer,
  p_pay text,
  p_cash integer,
  p_items jsonb,
  p_client_id uuid default null,
  p_created_at timestamptz default null,
  p_member_id bigint default null,
  p_member_free boolean default false
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  v_sub integer;
  v_disc integer;
  v_tx public.transactions;
  v_at timestamptz;
  v_m public.members;
  v_day date;
  v_treat text;
  v_stamps integer;
  v_free integer;
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

  -- validasi member sebelum menulis apa pun
  if p_member_id is not null then
    select * into v_m from public.members where id = p_member_id for update;
    if not found then raise exception 'Member tidak ditemukan'; end if;
    v_day := (v_at at time zone 'Asia/Jakarta')::date;
    if v_day < v_m.joined_on or v_day > v_m.expires_on then
      raise exception 'Member sudah kedaluwarsa (berlaku sampai %)', to_char(v_m.expires_on, 'DD-MM-YYYY');
    end if;
    select string_agg(i->>'name', ', ') into v_treat
      from jsonb_array_elements(p_items) i where coalesce(i->>'category_id', '') <> 'produk';
    if p_member_free then
      if v_treat is null then raise exception 'Pilih layanan untuk treatment gratis'; end if;
      select count(*) filter (where kind = 'stamp'), count(*) filter (where kind = 'free')
        into v_stamps, v_free from public.member_visits where member_id = p_member_id;
      if v_stamps / 10 - v_free <= 0 then raise exception 'Cap member belum cukup untuk treatment gratis'; end if;
    end if;
  end if;

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

  -- kunjungan berbayar yang memuat layanan = 1 cap; kunjungan gratis tidak menambah cap
  if p_member_id is not null and v_treat is not null then
    insert into public.member_visits (member_id, transaction_id, kind, treatments, visited_at)
    values (p_member_id, v_tx.id, case when p_member_free then 'free' else 'stamp' end, v_treat, v_at);
  end if;

  return v_tx;
end $$;

revoke execute on function public.create_member(text, text, date) from public, anon;
revoke execute on function public.add_member_visit(bigint, text, text, timestamptz) from public, anon;
revoke execute on function public.create_transaction(text, text, integer, text, integer, jsonb, uuid, timestamptz, bigint, boolean) from public, anon;
grant execute on function public.create_member(text, text, date) to authenticated;
grant execute on function public.add_member_visit(bigint, text, text, timestamptz) to authenticated;
grant execute on function public.create_transaction(text, text, integer, text, integer, jsonb, uuid, timestamptz, bigint, boolean) to authenticated;

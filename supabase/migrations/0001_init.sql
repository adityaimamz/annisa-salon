-- Annisa Salon: skema awal. Jalankan di Supabase Dashboard -> SQL Editor.

-- ---------- profil & peran ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'kasir' check (role in ('owner','kasir')),
  created_at timestamptz not null default now()
);

create function public.current_role_name() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.current_role_name() in ('owner','kasir'), false) $$;

create function public.is_owner() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.current_role_name() = 'owner', false) $$;

-- akun baru otomatis jadi 'kasir'; promosi ke owner dilakukan manual (lihat bawah)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- katalog ----------
create table public.categories (
  id text primary key,
  name text not null,
  sort int not null default 0
);

create table public.catalog_items (
  id text primary key,
  category_id text not null references public.categories(id),
  name text not null,
  note text,
  is_service boolean not null default false,
  price integer check (price >= 0),          -- null jika memakai variants
  variant_label text,
  variants jsonb,                              -- [["Pendek",200000], ...]
  options jsonb,                               -- ["Brightening", ...]
  is_sample boolean not null default false,    -- harga contoh, belum final
  active boolean not null default true,
  sort int not null default 0
);

create table public.therapists (
  id bigint generated always as identity primary key,
  name text not null unique,
  active boolean not null default true
);

-- ---------- transaksi ----------
create table public.tx_counters (
  day date primary key,
  last_seq int not null default 0
);

create table public.transactions (
  id bigint generated always as identity primary key,
  no text unique,
  customer text,
  subtotal integer not null check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  total integer not null check (total >= 0),
  pay_method text not null check (pay_method in ('Tunai','QRIS','Transfer')),
  cashier_id uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.transactions (created_at);

create table public.transaction_items (
  id bigint generated always as identity primary key,
  transaction_id bigint not null references public.transactions(id) on delete cascade,
  catalog_item_id text references public.catalog_items(id),
  category_id text,
  name text not null,              -- snapshot nama + varian saat transaksi
  price integer not null check (price >= 0),
  qty integer not null default 1 check (qty > 0),
  therapist_id bigint references public.therapists(id)
);
create index on public.transaction_items (transaction_id);

-- nomor struk: AN + yymmdd + urutan per hari, atomik
create function public.set_tx_no() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date := (new.created_at at time zone 'Asia/Jakarta')::date; s int;
begin
  insert into public.tx_counters (day, last_seq) values (d, 1)
  on conflict (day) do update set last_seq = public.tx_counters.last_seq + 1
  returning last_seq into s;
  new.no := 'AN' || to_char(d,'YYMMDD') || '-' || lpad(s::text,4,'0');
  return new;
end $$;
create trigger transactions_set_no before insert on public.transactions
  for each row when (new.no is null) execute function public.set_tx_no();

create table public.expenses (
  id bigint generated always as identity primary key,
  category text not null,
  amount integer not null check (amount > 0),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) default auth.uid()
);
create index on public.expenses (created_at);

-- ---------- RLS ----------
alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.catalog_items     enable row level security;
alter table public.therapists        enable row level security;
alter table public.tx_counters       enable row level security;  -- tanpa policy: hanya via trigger
alter table public.transactions      enable row level security;
alter table public.transaction_items enable row level security;
alter table public.expenses          enable row level security;

-- profil: lihat diri sendiri; owner lihat & ubah semua
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_owner());
create policy profiles_owner_write on public.profiles for all using (public.is_owner()) with check (public.is_owner());

-- katalog: publik boleh baca item aktif (untuk halaman produk); owner kelola
create policy categories_read on public.categories for select using (true);
create policy categories_owner on public.categories for all using (public.is_owner()) with check (public.is_owner());
create policy catalog_public_read on public.catalog_items for select using (active or public.is_staff());
create policy catalog_owner on public.catalog_items for all using (public.is_owner()) with check (public.is_owner());

-- terapis: staf baca, owner kelola
create policy therapists_read on public.therapists for select using (public.is_staff());
create policy therapists_owner on public.therapists for all using (public.is_owner()) with check (public.is_owner());

-- transaksi: staf baca & tambah; hanya owner ubah/hapus
create policy tx_read on public.transactions for select using (public.is_staff());
create policy tx_insert on public.transactions for insert with check (public.is_staff());
create policy tx_owner_mod on public.transactions for update using (public.is_owner()) with check (public.is_owner());
create policy tx_owner_del on public.transactions for delete using (public.is_owner());
create policy txi_read on public.transaction_items for select using (public.is_staff());
create policy txi_insert on public.transaction_items for insert with check (public.is_staff());
create policy txi_owner_mod on public.transaction_items for update using (public.is_owner()) with check (public.is_owner());
create policy txi_owner_del on public.transaction_items for delete using (public.is_owner());

-- pengeluaran & laporan keuangan: hanya owner
create policy expenses_owner on public.expenses for all using (public.is_owner()) with check (public.is_owner());

-- ---------- setelah membuat akun pemilik di Auth -> Users, jalankan: ----------
-- update public.profiles set role = 'owner' where id = '<UUID user pemilik>';

-- Manajemen karyawan oleh owner + mode karyawan (hanya Kasir & lihat Harga).
-- Peran 'kasir' = karyawan. Akun dibuat lewat RPC (owner saja), tanpa backend/secret key di browser.

-- ---------- akun bisa dinonaktifkan (riwayat transaksi tetap utuh) ----------
alter table public.profiles add column active boolean not null default true;

-- akun nonaktif kehilangan peran => is_staff()/is_owner() false => RLS menolak semuanya
create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() and active $$;

-- ---------- karyawan tidak membaca riwayat transaksi ----------
-- Staf masih boleh membuat transaksi; create_transaction jadi security definer
-- (insert ... returning tidak lagi butuh policy SELECT untuk staf). Otorisasi dicek di dalam fungsi.
drop policy tx_read on public.transactions;
drop policy txi_read on public.transaction_items;
create policy tx_read on public.transactions for select using (public.is_owner());
create policy txi_read on public.transaction_items for select using (public.is_owner());

alter function public.create_transaction(text, text, integer, text, integer, jsonb) security definer;

-- ---------- RPC kelola karyawan (hanya owner) ----------
create function public.list_staff()
returns table (id uuid, name text, email text, role text, active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_owner() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, u.email::text, p.role, p.active, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    order by (p.role = 'owner') desc, p.created_at;
end $$;

create function public.create_staff(p_name text, p_email text, p_password text)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
  v_name text := trim(p_name);
begin
  if not public.is_owner() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;
  if coalesce(v_name, '') = '' then raise exception 'Nama wajib diisi'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email tidak valid'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Kata sandi minimal 8 karakter'; end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Email sudah terdaftar';
  end if;

  -- trigger on_auth_user_created membuat baris profiles (role 'kasir') dari raw_user_meta_data->name
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('name', v_name), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );
  return v_id;
end $$;

create function public.reset_staff_password(p_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.is_owner() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Kata sandi minimal 8 karakter'; end if;
  if not exists (select 1 from public.profiles where id = p_id and role = 'kasir') then
    raise exception 'Karyawan tidak ditemukan';
  end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
  where id = p_id;
end $$;

revoke execute on function public.list_staff() from public, anon;
revoke execute on function public.create_staff(text, text, text) from public, anon;
revoke execute on function public.reset_staff_password(uuid, text) from public, anon;
grant execute on function public.list_staff() to authenticated;
grant execute on function public.create_staff(text, text, text) to authenticated;
grant execute on function public.reset_staff_password(uuid, text) to authenticated;

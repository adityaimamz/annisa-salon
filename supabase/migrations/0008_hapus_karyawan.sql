-- Karyawan dihapus (bukan dinonaktifkan). Riwayat transaksi/pengeluaran tetap ada, nama kasirnya jadi kosong.

alter table public.transactions drop constraint transactions_cashier_id_fkey,
  add constraint transactions_cashier_id_fkey foreign key (cashier_id) references public.profiles(id) on delete set null;
alter table public.expenses drop constraint expenses_created_by_fkey,
  add constraint expenses_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

-- kolom `active` dari 0007 tidak dipakai lagi
create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;
alter table public.profiles drop column active;

drop function public.list_staff();
create function public.list_staff()
returns table (id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_owner() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, u.email::text, p.role, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    order by (p.role = 'owner') desc, p.created_at;
end $$;

-- hapus akun karyawan (profil ikut terhapus lewat cascade). Pemilik tidak bisa dihapus lewat sini.
create function public.delete_staff(p_id uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_owner() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_id and role = 'kasir') then
    raise exception 'Karyawan tidak ditemukan';
  end if;
  delete from auth.users where id = p_id;
end $$;

revoke execute on function public.list_staff() from public, anon;
revoke execute on function public.delete_staff(uuid) from public, anon;
grant execute on function public.list_staff() to authenticated;
grant execute on function public.delete_staff(uuid) to authenticated;

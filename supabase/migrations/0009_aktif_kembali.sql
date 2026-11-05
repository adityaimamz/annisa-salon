-- Nonaktif tetap ada (toggle) di samping hapus: kembalikan profiles.active dari 0007.

alter table public.profiles add column active boolean not null default true;

create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() and active $$;

drop function public.list_staff();
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

revoke execute on function public.list_staff() from public, anon;
grant execute on function public.list_staff() to authenticated;

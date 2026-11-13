-- Migration 0022: Tabel audit log untuk riwayat penyesuaian modal kas laci
create table if not exists public.daily_cash_logs (
  id bigint generated always as identity primary key,
  day date not null,
  action text not null default 'adjust_modal',
  old_amount integer,
  new_amount integer not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.daily_cash_logs enable row level security;
drop policy if exists daily_cash_logs_staff_read on public.daily_cash_logs;
drop policy if exists daily_cash_logs_staff_write on public.daily_cash_logs;
create policy daily_cash_logs_staff_read on public.daily_cash_logs for select using (public.is_staff());
create policy daily_cash_logs_staff_write on public.daily_cash_logs for insert with check (public.is_staff());

-- Masukkan log pencatatan modal 11 Nov (Rp 88.000) sesuai buku fisik salon
insert into public.daily_cash_logs (day, action, old_amount, new_amount, note, created_at)
values (
  '2026-11-11',
  'adjust_modal',
  148000,
  88000,
  'Sisa fisik kas laci kemarin (10 Nov) sebesar Rp 88.000 dibawa menjadi modal awal 11 Nov sesuai catatan buku kas fisik salon (M = 88rb)',
  '2026-11-11 08:00:00+07'
);

-- Perbarui fungsi save_daily_cash_opening agar otomatis mencatat ke daily_cash_logs
create or replace function public.save_daily_cash_opening(
  p_day date,
  p_opening_cash integer,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old integer := null;
  v_new integer := greatest(0, coalesce(p_opening_cash, 0));
  v_note text;
begin
  if not public.is_staff() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;

  select opening_cash into v_old from public.daily_cash_books where day = p_day;

  insert into public.daily_cash_books (day, opening_cash, updated_at)
  values (p_day, v_new, now())
  on conflict (day) do update set
    opening_cash = v_new,
    updated_at = now();

  v_note := coalesce(nullif(trim(p_note), ''),
    case
      when v_old is not null then 'Perubahan modal kas dari Rp ' || to_char(v_old, 'FM999,999,999') || ' menjadi Rp ' || to_char(v_new, 'FM999,999,999')
      else 'Penetapan modal kas awal Rp ' || to_char(v_new, 'FM999,999,999')
    end
  );

  insert into public.daily_cash_logs (day, action, old_amount, new_amount, note, created_by, created_at)
  values (p_day, 'adjust_modal', v_old, v_new, v_note, auth.uid(), now());

  return public.get_daily_cash_summary(p_day);
end $$;

revoke execute on function public.save_daily_cash_opening(date, integer, text) from public, anon;
grant execute on function public.save_daily_cash_opening(date, integer, text) to authenticated;

-- RPC untuk mengambil riwayat log perubahan kas harian
create or replace function public.list_daily_cash_logs(p_limit integer default 50)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'day', l.day,
        'action', l.action,
        'old_amount', l.old_amount,
        'new_amount', l.new_amount,
        'note', l.note,
        'created_at', l.created_at,
        'user_name', p.name
      ) order by l.created_at desc
    )
    from (
      select * from public.daily_cash_logs order by created_at desc limit coalesce(p_limit, 50)
    ) l
    left join public.profiles p on p.id = l.created_by
  ), '[]'::jsonb);
end $$;

revoke execute on function public.list_daily_cash_logs(integer) from public, anon;
grant execute on function public.list_daily_cash_logs(integer) to authenticated;


-- Migration 0021: Fungsi khusus update opening cash harian secara aman
create or replace function public.save_daily_cash_opening(
  p_day date,
  p_opening_cash integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Tidak diizinkan' using errcode = '42501';
  end if;

  insert into public.daily_cash_books (day, opening_cash, updated_at)
  values (p_day, greatest(0, coalesce(p_opening_cash, 0)), now())
  on conflict (day) do update set
    opening_cash = greatest(0, coalesce(p_opening_cash, daily_cash_books.opening_cash)),
    updated_at = now();

  return public.get_daily_cash_summary(p_day);
end $$;

revoke execute on function public.save_daily_cash_opening(date, integer) from public, anon;
grant execute on function public.save_daily_cash_opening(date, integer) to authenticated;

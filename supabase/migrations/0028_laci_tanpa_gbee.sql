-- Migration 0028: Uang laci hanya Salon.
-- Penjualan tunai Gbee dan pengeluaran Gbee TIDAK masuk kas laci maupun rolling modal (M).
-- Pengeluaran operasional (business_unit = 'operasional') tetap mengurangi laci.

-- 1. Helper: porsi tunai SALON (setelah diskon dibagi proporsional) untuk transaksi dengan
--    tanggal Jakarta di rentang [p_from, p_to).
create or replace function public.cash_salon_tunai(p_from date, p_to date)
returns integer
language sql stable security definer set search_path = public as $$
  with day_tx as (
    select t.id, t.subtotal, t.discount,
           coalesce(sum(ti.price * ti.qty) filter (where ti.business_unit = 'salon'), 0) as sub_salon
    from public.transactions t
    left join public.transaction_items ti on ti.transaction_id = t.id
    where t.pay_method = 'Tunai'
      and (t.created_at at time zone 'Asia/Jakarta')::date >= p_from
      and (t.created_at at time zone 'Asia/Jakarta')::date < p_to
    group by t.id, t.subtotal, t.discount
  ),
  split as (
    select sub_salon,
           case when subtotal > 0 then round(discount::numeric * sub_salon / subtotal)::integer else 0 end as disc_salon
    from day_tx
  )
  select coalesce(sum(greatest(0, sub_salon - disc_salon)), 0)::integer from split;
$$;

revoke all on function public.cash_salon_tunai(date, date) from public, anon, authenticated;

-- 2. get_daily_cash_summary: laci = M + tunai salon - pengeluaran tunai non-Gbee - setor + suntikan.
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

  v_anchor_cash integer := 0;
  v_inter_in integer := 0;
  v_inter_out integer := 0;
  v_inter_withdrawn integer := 0;
  v_inter_cap integer := 0;
  v_prev_in integer := 0;
  v_prev_out integer := 0;
  v_day_cap integer := 0;

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

  -- 1. Rekaman daily_cash_books hari ini, atau anchor dari hari sebelumnya
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
    select * into v_prev from public.daily_cash_books
      where day < v_day order by day desc limit 1;

    if found then
      if v_prev.closing_cash_actual is not null then
        v_anchor_cash := greatest(0, v_prev.closing_cash_actual - coalesce(v_prev.cash_withdrawn, 0));
      else
        v_prev_in := public.cash_salon_tunai(v_prev.day, v_prev.day + 1);
        select coalesce(sum(e.amount), 0) into v_prev_out
          from public.expenses e
          where (e.created_at at time zone 'Asia/Jakarta')::date = v_prev.day
            and e.pay_method = 'Tunai' and e.business_unit <> 'gbee';
        v_anchor_cash := greatest(0, v_prev.opening_cash + v_prev_in - v_prev_out - coalesce(v_prev.cash_withdrawn, 0));
      end if;

      v_inter_in := public.cash_salon_tunai(v_prev.day + 1, v_day);

      select coalesce(sum(e.amount), 0) into v_inter_out
        from public.expenses e
        where (e.created_at at time zone 'Asia/Jakarta')::date > v_prev.day
          and (e.created_at at time zone 'Asia/Jakarta')::date < v_day
          and e.pay_method = 'Tunai' and e.business_unit <> 'gbee';

      select coalesce(sum(b.cash_withdrawn), 0) into v_inter_withdrawn
        from public.daily_cash_books b
        where b.day > v_prev.day and b.day < v_day;

      select coalesce(sum(ci.amount), 0) into v_inter_cap
        from public.capital_injections ci
        where (ci.created_at at time zone 'Asia/Jakarta')::date > v_prev.day
          and (ci.created_at at time zone 'Asia/Jakarta')::date < v_day
          and ci.category <> 'Modal Awal Bulan';

      v_opening := greatest(0, v_anchor_cash + v_inter_in - v_inter_out - v_inter_withdrawn + v_inter_cap);
    else
      v_inter_in := public.cash_salon_tunai(date '0001-01-01', v_day);
      select coalesce(sum(e.amount), 0) into v_inter_out
        from public.expenses e
        where (e.created_at at time zone 'Asia/Jakarta')::date < v_day
          and e.pay_method = 'Tunai' and e.business_unit <> 'gbee';
      select coalesce(sum(ci.amount), 0) into v_inter_cap
        from public.capital_injections ci
        where (ci.created_at at time zone 'Asia/Jakarta')::date < v_day;
      v_opening := greatest(0, v_inter_in - v_inter_out + v_inter_cap);
    end if;
  end if;

  -- Suntikan modal hari ini (selain Modal Awal Bulan)
  select coalesce(sum(ci.amount), 0) into v_day_cap
    from public.capital_injections ci
    where (ci.created_at at time zone 'Asia/Jakarta')::date = v_day
      and ci.category <> 'Modal Awal Bulan';

  -- 2. Penjualan hari ini per entitas (Salon vs Gbee)
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

  -- 3. Pengeluaran tunai hari ini yang berasal dari laci (bukan Gbee)
  select coalesce(sum(amount), 0) into v_cash_expenses
    from public.expenses
    where (created_at at time zone 'Asia/Jakarta')::date = v_day
      and pay_method = 'Tunai' and business_unit <> 'gbee';

  -- 4. Uang fisik laci seharusnya: M + tunai Salon - pengeluaran laci - setor + suntikan hari ini
  v_expected_cash := v_opening + v_cash_salon - v_cash_expenses - v_withdrawn + v_day_cap;

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
    'qris_sales_salon', v_qris_salon,
    'qris_sales_gbee', v_qris_gbee,
    'transfer_sales_salon', v_transfer_salon,
    'transfer_sales_gbee', v_transfer_gbee,
    'cash_sales_total', v_cash_salon + v_cash_gbee,
    'qris_sales_total', v_qris_salon + v_qris_gbee,
    'transfer_sales_total', v_transfer_salon + v_transfer_gbee,
    'cash_expenses', v_cash_expenses,
    'capital_injections', v_day_cap,
    'expected_cash', v_expected_cash,
    'diff', case when v_closing_actual is not null then v_closing_actual - v_expected_cash else null end,
    'tx_lines', v_txs
  );
end $$;

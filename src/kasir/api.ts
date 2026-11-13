import { supabase } from '../lib/supabase';
import type {
  BusinessUnit, CapitalInjection, CartLine, Category, DailyCashLog, DailyCashSummary, Expense, Item, ItemCost, Member, MemberVisit, PayMethod, Photo, Profile, StaffMember, StockEntry, StockKind, StockMonthRow, Therapist, Tx, TxLine,
} from './types';

function db() {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi (isi .env).');
  return supabase;
}

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

/* ---------- member salon ---------- */
interface MemberRow {
  id: number; name: string; wa: string | null; joined_on: string; expires_on: string; note: string | null;
  member_visits?: { kind: 'stamp' | 'free' }[];
}
const memberFromRow = (r: MemberRow): Member => ({
  id: r.id, name: r.name, wa: r.wa ?? '', joinedOn: r.joined_on, expiresOn: r.expires_on, note: r.note ?? '',
  stamps: (r.member_visits ?? []).filter((v) => v.kind === 'stamp').length,
  freeUsed: (r.member_visits ?? []).filter((v) => v.kind === 'free').length,
});

export async function loadMembers(): Promise<Member[]> {
  const { data, error } = await db().from('members')
    .select('id,name,wa,joined_on,expires_on,note,member_visits(kind)').order('name').limit(2000);
  fail(error);
  return (data as unknown as MemberRow[]).map(memberFromRow);
}

export async function createMember(name: string, wa: string): Promise<Member> {
  const { data, error } = await db().rpc('create_member', { p_name: name, p_wa: wa || null, p_joined: null });
  fail(error);
  return memberFromRow(data as MemberRow);
}

export async function loadMemberVisits(memberId: number): Promise<MemberVisit[]> {
  const { data, error } = await db().from('member_visits')
    .select('id,kind,treatments,visited_at,transaction_id').eq('member_id', memberId)
    .order('visited_at', { ascending: false });
  fail(error);
  return (data ?? []).map((r) => ({
    id: r.id, kind: r.kind, treatments: r.treatments ?? '', at: Date.parse(r.visited_at), txId: r.transaction_id,
  }));
}

export async function addMemberVisit(memberId: number, kind: 'stamp' | 'free', treatments: string, at?: number) {
  const { error } = await db().rpc('add_member_visit', {
    p_member_id: memberId, p_kind: kind, p_treatments: treatments || null, p_at: at ? new Date(at).toISOString() : null,
  });
  fail(error);
}

export async function deleteMemberVisit(id: number) {
  const { data, error } = await db().from('member_visits').delete().eq('id', id).select('id');
  fail(error);
  if (!data?.length) throw new Error('Catatan tidak ditemukan atau Anda tidak berhak menghapusnya.');
}

export async function deleteMember(id: number) {
  const { data, error } = await db().from('members').delete().eq('id', id).select('id');
  fail(error);
  if (!data?.length) throw new Error('Member tidak ditemukan atau Anda tidak berhak menghapusnya.');
}

/* ---------- stok produk (Gbee) ---------- */
/** Sisa stok per produk. Produk yang belum punya catatan stok tidak ada di hasil. */
export async function loadStockLevels(): Promise<Record<string, number>> {
  const { data, error } = await db().rpc('get_stock_levels');
  fail(error);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { item_id: string; sisa: number }[]) out[r.item_id] = r.sisa;
  return out;
}

export async function loadItemCosts(): Promise<Record<string, ItemCost>> {
  const { data, error } = await db().from('item_costs').select('item_id,reseller_price,source');
  fail(error);
  const out: Record<string, ItemCost> = {};
  for (const r of data ?? []) out[r.item_id] = { price: r.reseller_price, source: r.source ?? '' };
  return out;
}

export async function setResellerPrice(itemId: string, price: number) {
  const { error } = await db().from('item_costs')
    .upsert({ item_id: itemId, reseller_price: price, updated_at: new Date().toISOString() });
  fail(error);
}

export async function addStockEntries(p: {
  kind: StockKind;
  items: { itemId: string; qty: number; unitCost?: number }[];
  source?: string;
  at?: number;
  note?: string;
  expense?: boolean;
  pay?: 'Tunai' | 'Transfer';
}): Promise<number> {
  const { data, error } = await db().rpc('add_stock_entries', {
    p_items: p.items.map((i) => ({ item_id: i.itemId, qty: i.qty, unit_cost: i.unitCost ?? null })),
    p_kind: p.kind,
    p_source: p.source ?? null,
    p_at: p.at ? new Date(p.at).toISOString() : null,
    p_note: p.note ?? null,
    p_expense: p.expense ?? false,
    p_pay: p.pay ?? 'Tunai',
  });
  fail(error);
  return data as number;
}

export async function loadStockEntries(itemId: string): Promise<StockEntry[]> {
  const { data, error } = await db().from('stock_entries')
    .select('id,item_id,kind,qty,source,unit_cost,note,at')
    .eq('item_id', itemId).order('at', { ascending: false }).order('id', { ascending: false });
  fail(error);
  return (data ?? []).map((r) => ({
    id: r.id, itemId: r.item_id, kind: r.kind, qty: r.qty, source: r.source ?? '',
    unitCost: r.unit_cost, note: r.note ?? '', at: Date.parse(r.at),
  }));
}

export async function deleteStockEntry(id: number) {
  const { error } = await db().rpc('delete_stock_entry', { p_id: id });
  fail(error);
}

/** monthFirst: 'YYYY-MM-01' */
export async function loadStockMonthly(monthFirst: string): Promise<StockMonthRow[]> {
  const { data, error } = await db().rpc('get_stock_monthly', { p_month: monthFirst });
  fail(error);
  return ((data ?? []) as Record<string, number | string>[]).map((r) => ({
    itemId: r.item_id as string, awal: r.awal as number, masuk: r.masuk as number,
    koreksi: r.koreksi as number, keluar: r.keluar as number, sisa: r.sisa as number,
  }));
}

/* ---------- profil ---------- */
export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await db().from('profiles').select('id,name,role').eq('id', userId).maybeSingle();
  fail(error);
  return data as Profile | null;
}

/* ---------- katalog ---------- */
interface ItemRow {
  id: string; category_id: string; name: string; note: string | null; is_service: boolean;
  price: number | null; web_price: number | null; variant_label: string | null; variants: [string, number][] | null;
  options: string[] | null; active: boolean; sort: number; description: string | null;
  business_unit?: 'salon' | 'gbee' | null;
}

const fromRow = (r: ItemRow): Item => ({
  id: r.id, cat: r.category_id, name: r.name, k: r.note ?? undefined, service: r.is_service,
  unit: (r.business_unit as BusinessUnit) ?? (r.category_id === 'produk' ? 'gbee' : 'salon'),
  price: r.price ?? undefined, webPrice: r.web_price ?? undefined, vlabel: r.variant_label ?? undefined, variants: r.variants ?? undefined,
  opts: r.options ?? undefined, off: !r.active, sort: r.sort, desc: r.description ?? undefined,
});

const toRow = (it: Item): ItemRow => ({
  id: it.id, category_id: it.cat, name: it.name, note: it.k ?? null, is_service: it.service,
  business_unit: it.unit ?? (it.cat === 'produk' ? 'gbee' : 'salon'),
  price: it.price ?? null, web_price: it.webPrice ?? null, variant_label: it.vlabel ?? null, variants: it.variants ?? null,
  options: it.opts ?? null, active: !it.off, sort: it.sort, description: it.desc ?? null,
});

export async function loadCatalog(): Promise<{ cats: Category[]; items: Item[] }> {
  const [c, i, r] = await Promise.all([
    db().from('categories').select('id,name').order('sort'),
    db().from('catalog_items').select('*').order('sort'),
    db().from('item_reseller_prices').select('item_id,price'),
  ]);
  fail(c.error); fail(i.error);
  // harga reseller opsional: kegagalan memuatnya tidak boleh menghalangi Kasir
  const resell = new Map((r.error ? [] : r.data ?? []).map((x) => [x.item_id as string, x.price as number]));
  return {
    cats: c.data as Category[],
    items: (i.data as ItemRow[]).map(fromRow).map((it) => ({ ...it, resellPrice: resell.get(it.id) })),
  };
}

export async function saveItem(it: Item) {
  const { error } = await db().from('catalog_items').upsert(toRow(it));
  fail(error);
  if (it.cat !== 'produk') return;
  const rp = it.resellPrice;
  const { error: e2 } = rp
    ? await db().from('item_reseller_prices').upsert({ item_id: it.id, price: rp, updated_at: new Date().toISOString() })
    : await db().from('item_reseller_prices').delete().eq('item_id', it.id);
  fail(e2);
}

export async function deleteItem(id: string) {
  const { error } = await db().from('catalog_items').delete().eq('id', id);
  fail(error);
}

export async function loadTherapists(): Promise<Therapist[]> {
  const { data, error } = await db().from('therapists').select('id,name').eq('active', true).order('id');
  fail(error);
  return data as Therapist[];
}

/* Kelola terapis (hanya owner; ditegakkan RLS `therapists_owner`) */
export async function listTherapistsAll(): Promise<(Therapist & { active: boolean })[]> {
  const { data, error } = await db().from('therapists').select('id,name,active').order('id');
  fail(error);
  return data as (Therapist & { active: boolean })[];
}

const therapistErr = (e: { message: string; code?: string }) => {
  if (e.code === '23505') throw new Error('Nama terapis itu sudah ada.');
  if (e.code === '23503') throw new Error('Terapis ini sudah tercatat di transaksi, tidak bisa dihapus. Nonaktifkan saja.');
  throw new Error(e.message);
};

export async function addTherapist(name: string) {
  const { error } = await db().from('therapists').insert({ name });
  if (error) therapistErr(error);
}

export async function renameTherapist(id: number, name: string) {
  const { error } = await db().from('therapists').update({ name }).eq('id', id);
  if (error) therapistErr(error);
}

export async function setTherapistActive(id: number, active: boolean) {
  const { error } = await db().from('therapists').update({ active }).eq('id', id);
  if (error) therapistErr(error);
}

export async function deleteTherapist(id: number) {
  const { error } = await db().from('therapists').delete().eq('id', id);
  if (error) therapistErr(error);
}

/* ---------- transaksi ---------- */
interface TxRow {
  id: number; no: string; created_at: string; customer: string | null; customer_wa: string | null;
  subtotal: number; discount: number; total: number; pay_method: PayMethod; cash_received: number | null;
  profiles: { name: string } | null;
  transaction_items: {
    id: number; catalog_item_id: string | null; category_id: string | null; name: string; price: number; qty: number;
    business_unit?: 'salon' | 'gbee' | null;
    therapist_id: number | null; therapists: { name: string } | null;
  }[];
}

const SELECT_TX =
  '*, profiles:cashier_id(name), transaction_items(id,catalog_item_id,category_id,name,price,qty,business_unit,therapist_id,therapists:therapist_id(name))';

const txFromRow = (r: TxRow): Tx => ({
  id: r.id, no: r.no, at: new Date(r.created_at).getTime(), cust: r.customer ?? '', wa: r.customer_wa ?? '',
  sub: r.subtotal, disc: r.discount, total: r.total, pay: r.pay_method, cash: r.cash_received ?? 0,
  kasir: r.profiles?.name ?? '-',
  lines: r.transaction_items.map((l): TxLine => ({
    id: l.catalog_item_id, cat: l.category_id, name: l.name, price: l.price, qty: l.qty,
    unit: (l.business_unit as BusinessUnit) ?? (l.category_id === 'produk' ? 'gbee' : 'salon'),
    terapis: l.therapists?.name ?? null, rowId: l.id, terapisId: l.therapist_id,
  })),
});

/** Koreksi transaksi penuh (owner; RPC update_transaction): metode bayar, diskon, dan seluruh baris layanan. */
export async function updateTransaction(
  id: number,
  p: {
    customer: string; wa: string; discount: number; pay: PayMethod;
    at?: number; // waktu baru; kosong = tidak diubah
    lines: { catalogId: string | null; cat: string | null; name: string; price: number; qty: number; unit?: BusinessUnit; terapisId: number | null }[];
  },
): Promise<Tx> {
  const { error } = await db().rpc('update_transaction', {
    p_id: id, p_customer: p.customer, p_customer_wa: p.wa, p_discount: p.discount, p_pay: p.pay,
    ...(p.at ? { p_created_at: new Date(p.at).toISOString() } : {}),
    p_items: p.lines.map((l) => ({
      catalog_item_id: l.catalogId, category_id: l.cat, name: l.name, price: l.price, qty: l.qty,
      business_unit: l.unit ?? (l.cat === 'produk' ? 'gbee' : 'salon'),
      therapist_id: l.terapisId,
    })),
  });
  fail(error);
  const { data, error: e2 } = await db().from('transactions').select(SELECT_TX).eq('id', id).single();
  fail(e2);
  return txFromRow(data as unknown as TxRow);
}

export async function deleteTransaction(id: number) {
  const { data, error } = await db().from('transactions').delete().eq('id', id).select('id');
  fail(error);
  if (!data?.length) throw new Error('Transaksi tidak ditemukan atau Anda tidak berhak menghapusnya.');
}

const PAGE = 1000;

export async function loadTransactions(sinceMs: number): Promise<Tx[]> {
  const out: Tx[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from('transactions').select(SELECT_TX)
      .gte('created_at', new Date(sinceMs).toISOString())
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    fail(error);
    const rows = data as unknown as TxRow[];
    out.push(...rows.map(txFromRow));
    if (rows.length < PAGE) break;
  }
  return out;
}

export interface PayInput {
  customer: string; wa: string; discount: number; pay: PayMethod; cash: number;
  lines: CartLine[]; cashierName: string;
  clientId?: string; createdAt?: number; // transaksi offline: id unik + waktu bayar asli
  memberId?: number; memberFree?: boolean; // member: cap otomatis, atau treatment gratis
}

export async function createTransaction(p: PayInput): Promise<Tx> {
  const { data, error } = await db().rpc('create_transaction', {
    p_customer: p.customer,
    p_customer_wa: p.wa,
    p_discount: p.discount,
    p_pay: p.pay,
    p_cash: p.cash,
    p_client_id: p.clientId ?? null,
    p_created_at: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    p_member_id: p.memberId ?? null,
    p_member_free: p.memberFree ?? false,
    p_items: p.lines.map((l) => ({
      catalog_item_id: l.id, category_id: l.cat, name: l.name, price: l.price, qty: l.qty,
      business_unit: l.unit ?? (l.cat === 'produk' ? 'gbee' : 'salon'),
      therapist_id: l.terapis ? Number(l.terapis) : null,
    })),
  });
  fail(error);
  const r = data as { id: number; no: string; created_at: string; subtotal: number; discount: number; total: number };
  return {
    id: r.id, no: r.no, at: new Date(r.created_at).getTime(), cust: p.customer, wa: p.wa,
    sub: r.subtotal, disc: r.discount, total: r.total, pay: p.pay, cash: p.cash, kasir: p.cashierName,
    lines: [], // diisi pemanggil (butuh nama terapis)
  };
}

/* ---------- pengeluaran ---------- */
export async function loadExpenses(sinceMs: number): Promise<Expense[]> {
  const out: Expense[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from('expenses').select('id,category,amount,note,created_at,pay_method,business_unit')
      .gte('created_at', new Date(sinceMs).toISOString())
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    fail(error);
    const rows = data as {
      id: number; category: string; amount: number; note: string | null; created_at: string;
      pay_method?: 'Tunai' | 'Transfer' | null; business_unit?: 'salon' | 'gbee' | 'operasional' | null;
    }[];
    out.push(...rows.map((x) => ({
      id: x.id, at: new Date(x.created_at).getTime(), cat: x.category, amt: x.amount, note: x.note ?? '',
      pay: x.pay_method ?? 'Tunai', unit: x.business_unit ?? 'operasional',
    })));
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function addExpense(e: { cat: string; amt: number; note: string; at: number; pay?: 'Tunai' | 'Transfer'; unit?: 'salon' | 'gbee' | 'operasional' }) {
  const { error } = await db().from('expenses').insert({
    category: e.cat, amount: e.amt, note: e.note || null, created_at: new Date(e.at).toISOString(),
    pay_method: e.pay ?? 'Tunai', business_unit: e.unit ?? 'operasional',
  });
  fail(error);
}

export async function updateExpense(id: number, e: { cat: string; amt: number; note: string; at: number; pay?: 'Tunai' | 'Transfer'; unit?: 'salon' | 'gbee' | 'operasional' }) {
  const { error } = await db().from('expenses').update({
    category: e.cat, amount: e.amt, note: e.note || null, created_at: new Date(e.at).toISOString(),
    pay_method: e.pay ?? 'Tunai', business_unit: e.unit ?? 'operasional',
  }).eq('id', id);
  fail(error);
}

export async function deleteExpense(id: number) {
  const { error } = await db().from('expenses').delete().eq('id', id);
  fail(error);
}

/* ---------- buku kas kasir ---------- */
export async function getDailyCashSummary(day?: string): Promise<DailyCashSummary> {
  const { data, error } = await db().rpc('get_daily_cash_summary', { p_day: day ?? null });
  fail(error);
  return data as DailyCashSummary;
}

export async function saveDailyCashBook(p: {
  day: string;
  openingCash: number;
  cashWithdrawn?: number;
  closingCashActual?: number | null;
  notes?: string;
  isClosed?: boolean;
}): Promise<DailyCashSummary> {
  const { data, error } = await db().rpc('save_daily_cash_book', {
    p_day: p.day,
    p_opening_cash: p.openingCash,
    p_cash_withdrawn: p.cashWithdrawn ?? 0,
    p_closing_cash_actual: p.closingCashActual ?? null,
    p_notes: p.notes ?? null,
    p_is_closed: p.isClosed ?? false,
  });
  fail(error);
  return data as DailyCashSummary;
}

export async function getModalBulanLalu(): Promise<number> {
  // Ambil total suntikan modal awal bulan berjalan jika ada, atau fallback ke setting/148000
  const { data: injections } = await db()
    .from('capital_injections')
    .select('amount');
  if (injections && injections.length > 0) {
    return injections.reduce((acc, cur) => acc + Number(cur.amount || 0), 0);
  }
  const { data, error } = await db()
    .from('app_settings')
    .select('value')
    .eq('key', 'modal_bulan_lalu')
    .maybeSingle();
  if (error || !data) return 148000;
  const n = Number(data.value);
  return Number.isFinite(n) ? n : 148000;
}

export async function setModalBulanLalu(amount: number): Promise<number> {
  const amt = Math.max(0, Math.round(amount));
  await db()
    .from('app_settings')
    .upsert({
      key: 'modal_bulan_lalu',
      value: String(amt),
      updated_at: new Date().toISOString(),
    });
  return amt;
}

/* ---------- suntikan modal (capital injections) ---------- */
export async function loadCapitalInjections(sinceMs?: number): Promise<CapitalInjection[]> {
  let q = db().from('capital_injections').select('*').order('created_at', { ascending: false });
  if (sinceMs) q = q.gte('created_at', new Date(sinceMs).toISOString());
  const { data, error } = await q;
  fail(error);
  return (data as { id: number; created_at: string; amount: number; category: string; note: string | null; created_by: string | null }[])
    .map((r) => ({
      id: r.id,
      at: new Date(r.created_at).getTime(),
      amt: Number(r.amount),
      cat: r.category,
      note: r.note ?? '',
      by: r.created_by ?? undefined,
    }));
}

export async function addCapitalInjection(p: { amt: number; cat: string; note?: string; at?: number; by?: string }): Promise<CapitalInjection> {
  const { data, error } = await db()
    .from('capital_injections')
    .insert({
      amount: Math.max(0, Math.round(p.amt)),
      category: p.cat || 'Modal Awal Bulan',
      note: p.note || null,
      created_at: p.at ? new Date(p.at).toISOString() : new Date().toISOString(),
      created_by: p.by || null,
    })
    .select('*')
    .single();
  fail(error);
  const r = data as { id: number; created_at: string; amount: number; category: string; note: string | null; created_by: string | null };
  return {
    id: r.id,
    at: new Date(r.created_at).getTime(),
    amt: Number(r.amount),
    cat: r.category,
    note: r.note ?? '',
    by: r.created_by ?? undefined,
  };
}

export async function deleteCapitalInjection(id: number): Promise<void> {
  const { error } = await db().from('capital_injections').delete().eq('id', id);
  fail(error);
}

export async function getPeriodOpeningCash(startDay: string, endDay: string): Promise<number> {
  return getModalBulanLalu();
}

export async function getPeriodModal(startMs: number, endMs: number): Promise<number> {
  const { data, error } = await db()
    .from('capital_injections')
    .select('amount, created_at');
  if (error || !data) return 0;
  return (data as { amount: number; created_at: string }[])
    .filter((r) => {
      const t = new Date(r.created_at).getTime();
      return t >= startMs && t < endMs;
    })
    .reduce((acc, cur) => acc + Number(cur.amount || 0), 0);
}

export async function saveDailyCashOpening(day: string, openingCash: number, note?: string): Promise<DailyCashSummary> {
  const { data, error } = await db().rpc('save_daily_cash_opening', {
    p_day: day,
    p_opening_cash: Math.max(0, Math.round(openingCash)),
    p_note: note || null,
  });
  fail(error);
  return data as DailyCashSummary;
}

export async function loadDailyCashLogs(limit: number = 50): Promise<DailyCashLog[]> {
  const { data, error } = await db().rpc('list_daily_cash_logs', { p_limit: limit });
  if (error || !data) return [];
  return data as DailyCashLog[];
}

/* ---------- karyawan (hanya owner; ditegakkan RPC + RLS) ---------- */
export async function listStaff(): Promise<StaffMember[]> {
  const { data, error } = await db().rpc('list_staff');
  fail(error);
  return (data as { id: string; name: string; email: string; role: StaffMember['role']; active: boolean; created_at: string }[])
    .map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, active: r.active, createdAt: new Date(r.created_at).getTime() }));
}

export async function createStaff(name: string, email: string, password: string) {
  const { error } = await db().rpc('create_staff', { p_name: name, p_email: email, p_password: password });
  fail(error);
}

export async function resetStaffPassword(id: string, password: string) {
  const { error } = await db().rpc('reset_staff_password', { p_id: id, p_password: password });
  fail(error);
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await db().auth.getSession();
  return data.session?.user.id ?? null;
}

/** Ganti kata sandi akun yang sedang masuk (owner). */
export async function changeOwnPassword(password: string) {
  const { error } = await db().auth.updateUser({ password });
  fail(error);
}

export async function setStaffActive(id: string, active: boolean) {
  const { error } = await db().from('profiles').update({ active }).eq('id', id).eq('role', 'kasir');
  fail(error);
}

export async function deleteStaff(id: string) {
  const { error } = await db().rpc('delete_staff', { p_id: id });
  fail(error);
}

/* ---------- galeri (hanya owner yang boleh menulis; ditegakkan RLS + policy Storage) ---------- */
interface PhotoRow {
  id: string; title: string; subtitle: string | null; alt: string | null; categories: string[];
  image_url: string; thumb_url: string; width: number | null; height: number | null; sort: number; active: boolean;
}
const photoFrom = (r: PhotoRow): Photo => ({
  id: r.id, title: r.title, sub: r.subtitle ?? '', alt: r.alt ?? '', cats: r.categories,
  image: r.image_url, thumb: r.thumb_url, w: r.width, h: r.height, sort: r.sort, off: !r.active,
});
const photoTo = (p: Photo): PhotoRow => ({
  id: p.id, title: p.title, subtitle: p.sub || null, alt: p.alt || null, categories: p.cats,
  image_url: p.image, thumb_url: p.thumb, width: p.w, height: p.h, sort: p.sort, active: !p.off,
});

const BUCKET = 'gallery';
// URL Storage -> path di bucket; foto bawaan situs (/assets/...) bukan di Storage, jadi null.
const storagePath = (url: string) => {
  const i = url.indexOf(`/${BUCKET}/`);
  return url.startsWith('http') && i >= 0 ? url.slice(i + BUCKET.length + 2) : null;
};

export async function loadGallery(): Promise<Photo[]> {
  const { data, error } = await db().from('gallery_photos').select('*').order('sort').order('created_at');
  fail(error);
  return (data as PhotoRow[]).map(photoFrom);
}

export async function savePhoto(p: Photo) {
  const { error } = await db().from('gallery_photos').upsert(photoTo(p));
  fail(error);
}

async function removeFiles(urls: string[]) {
  const paths = urls.map(storagePath).filter((x): x is string => !!x);
  if (paths.length) await db().storage.from(BUCKET).remove(paths); // sisa berkas yatim tidak fatal
}

export async function deletePhoto(p: Photo) {
  const { error } = await db().from('gallery_photos').delete().eq('id', p.id);
  fail(error);
  await removeFiles([p.image, p.thumb]);
}

/** Unggah versi penuh + thumbnail; mengembalikan URL publiknya. */
export async function uploadPhoto(full: Blob, thumb: Blob): Promise<{ image: string; thumb: string }> {
  const id = crypto.randomUUID();
  const up = async (path: string, b: Blob) => {
    const { error } = await db().storage.from(BUCKET).upload(path, b, { contentType: 'image/webp', cacheControl: '31536000' });
    fail(error);
    return db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };
  const image = await up(`${id}.webp`, full);
  try { return { image, thumb: await up(`${id}-sm.webp`, thumb) }; }
  catch (e) { await removeFiles([image]); throw e; }
}

export { removeFiles as removePhotoFiles };

/* ---------- auth ---------- */
export async function signIn(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email, password });
  fail(error);
}
export const signOut = () => db().auth.signOut();

import { supabase } from '../lib/supabase';
import type {
  CartLine, Category, Expense, Item, PayMethod, Profile, Therapist, Tx, TxLine,
} from './types';

function db() {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi (isi .env).');
  return supabase;
}

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

/* ---------- profil ---------- */
export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await db().from('profiles').select('id,name,role').eq('id', userId).maybeSingle();
  fail(error);
  return data as Profile | null;
}

/* ---------- katalog ---------- */
interface ItemRow {
  id: string; category_id: string; name: string; note: string | null; is_service: boolean;
  price: number | null; variant_label: string | null; variants: [string, number][] | null;
  options: string[] | null; is_sample: boolean; active: boolean; sort: number;
}

const fromRow = (r: ItemRow): Item => ({
  id: r.id, cat: r.category_id, name: r.name, k: r.note ?? undefined, service: r.is_service,
  price: r.price ?? undefined, vlabel: r.variant_label ?? undefined, variants: r.variants ?? undefined,
  opts: r.options ?? undefined, sample: r.is_sample, off: !r.active, sort: r.sort,
});

const toRow = (it: Item): ItemRow => ({
  id: it.id, category_id: it.cat, name: it.name, note: it.k ?? null, is_service: it.service,
  price: it.price ?? null, variant_label: it.vlabel ?? null, variants: it.variants ?? null,
  options: it.opts ?? null, is_sample: it.sample, active: !it.off, sort: it.sort,
});

export async function loadCatalog(): Promise<{ cats: Category[]; items: Item[] }> {
  const [c, i] = await Promise.all([
    db().from('categories').select('id,name').order('sort'),
    db().from('catalog_items').select('*').order('sort'),
  ]);
  fail(c.error); fail(i.error);
  return { cats: c.data as Category[], items: (i.data as ItemRow[]).map(fromRow) };
}

export async function saveItem(it: Item) {
  const { error } = await db().from('catalog_items').upsert(toRow(it));
  fail(error);
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

/* ---------- transaksi ---------- */
interface TxRow {
  id: number; no: string; created_at: string; customer: string | null; customer_wa: string | null;
  subtotal: number; discount: number; total: number; pay_method: PayMethod; cash_received: number | null;
  profiles: { name: string } | null;
  transaction_items: {
    catalog_item_id: string | null; category_id: string | null; name: string; price: number; qty: number;
    therapists: { name: string } | null;
  }[];
}

const SELECT_TX =
  '*, profiles:cashier_id(name), transaction_items(catalog_item_id,category_id,name,price,qty,therapists:therapist_id(name))';

const txFromRow = (r: TxRow): Tx => ({
  id: r.id, no: r.no, at: new Date(r.created_at).getTime(), cust: r.customer ?? '', wa: r.customer_wa ?? '',
  sub: r.subtotal, disc: r.discount, total: r.total, pay: r.pay_method, cash: r.cash_received ?? 0,
  kasir: r.profiles?.name ?? '-',
  lines: r.transaction_items.map((l): TxLine => ({
    id: l.catalog_item_id, cat: l.category_id, name: l.name, price: l.price, qty: l.qty,
    terapis: l.therapists?.name ?? null,
  })),
});

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
}

export async function createTransaction(p: PayInput): Promise<Tx> {
  const { data, error } = await db().rpc('create_transaction', {
    p_customer: p.customer,
    p_customer_wa: p.wa,
    p_discount: p.discount,
    p_pay: p.pay,
    p_cash: p.cash,
    p_items: p.lines.map((l) => ({
      catalog_item_id: l.id, category_id: l.cat, name: l.name, price: l.price, qty: l.qty,
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
      .from('expenses').select('id,category,amount,note,created_at')
      .gte('created_at', new Date(sinceMs).toISOString())
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    fail(error);
    const rows = data as { id: number; category: string; amount: number; note: string | null; created_at: string }[];
    out.push(...rows.map((x) => ({
      id: x.id, at: new Date(x.created_at).getTime(), cat: x.category, amt: x.amount, note: x.note ?? '',
    })));
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function addExpense(e: { cat: string; amt: number; note: string; at: number }) {
  const { error } = await db().from('expenses').insert({
    category: e.cat, amount: e.amt, note: e.note || null, created_at: new Date(e.at).toISOString(),
  });
  fail(error);
}

/* ---------- auth ---------- */
export async function signIn(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email, password });
  fail(error);
}
export const signOut = () => db().auth.signOut();

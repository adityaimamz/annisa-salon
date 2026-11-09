import { supabase } from '../lib/supabase';
import type {
  CartLine, Category, Expense, Item, PayMethod, Photo, Profile, StaffMember, Therapist, Tx, TxLine,
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
  price: number | null; web_price: number | null; variant_label: string | null; variants: [string, number][] | null;
  options: string[] | null; active: boolean; sort: number; description: string | null;
}

const fromRow = (r: ItemRow): Item => ({
  id: r.id, cat: r.category_id, name: r.name, k: r.note ?? undefined, service: r.is_service,
  price: r.price ?? undefined, webPrice: r.web_price ?? undefined, vlabel: r.variant_label ?? undefined, variants: r.variants ?? undefined,
  opts: r.options ?? undefined, off: !r.active, sort: r.sort, desc: r.description ?? undefined,
});

const toRow = (it: Item): ItemRow => ({
  id: it.id, category_id: it.cat, name: it.name, note: it.k ?? null, is_service: it.service,
  price: it.price ?? null, web_price: it.webPrice ?? null, variant_label: it.vlabel ?? null, variants: it.variants ?? null,
  options: it.opts ?? null, active: !it.off, sort: it.sort, description: it.desc ?? null,
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
    therapist_id: number | null; therapists: { name: string } | null;
  }[];
}

const SELECT_TX =
  '*, profiles:cashier_id(name), transaction_items(id,catalog_item_id,category_id,name,price,qty,therapist_id,therapists:therapist_id(name))';

const txFromRow = (r: TxRow): Tx => ({
  id: r.id, no: r.no, at: new Date(r.created_at).getTime(), cust: r.customer ?? '', wa: r.customer_wa ?? '',
  sub: r.subtotal, disc: r.discount, total: r.total, pay: r.pay_method, cash: r.cash_received ?? 0,
  kasir: r.profiles?.name ?? '-',
  lines: r.transaction_items.map((l): TxLine => ({
    id: l.catalog_item_id, cat: l.category_id, name: l.name, price: l.price, qty: l.qty,
    terapis: l.therapists?.name ?? null, rowId: l.id, terapisId: l.therapist_id,
  })),
});

/** Koreksi transaksi penuh (owner; RPC update_transaction): metode bayar, diskon, dan seluruh baris layanan. */
export async function updateTransaction(
  id: number,
  p: {
    customer: string; wa: string; discount: number; pay: PayMethod;
    lines: { catalogId: string | null; cat: string | null; name: string; price: number; qty: number; terapisId: number | null }[];
  },
): Promise<Tx> {
  const { error } = await db().rpc('update_transaction', {
    p_id: id, p_customer: p.customer, p_customer_wa: p.wa, p_discount: p.discount, p_pay: p.pay,
    p_items: p.lines.map((l) => ({
      catalog_item_id: l.catalogId, category_id: l.cat, name: l.name, price: l.price, qty: l.qty, therapist_id: l.terapisId,
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

export async function updateExpense(id: number, e: { cat: string; amt: number; note: string; at: number }) {
  const { error } = await db().from('expenses').update({
    category: e.cat, amount: e.amt, note: e.note || null, created_at: new Date(e.at).toISOString(),
  }).eq('id', id);
  fail(error);
}

export async function deleteExpense(id: number) {
  const { error } = await db().from('expenses').delete().eq('id', id);
  fail(error);
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

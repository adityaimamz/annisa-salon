export type Role = 'owner' | 'kasir';
export type PayMethod = 'Tunai' | 'QRIS' | 'Transfer';
export type Variant = [string, number];
export type BusinessUnit = 'salon' | 'gbee';

export interface Profile {
  id: string;
  name: string;
  role: Role;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface Item {
  id: string;
  cat: string;
  name: string;
  k?: string;
  service: boolean;
  unit?: BusinessUnit;
  price?: number; // harga kasir
  webPrice?: number; // harga produk di website (landing & /produk); kosong = ikut harga kasir. Layanan selalu memakai `price`.
  desc?: string; // deskripsi layanan di website
  vlabel?: string;
  variants?: Variant[];
  opts?: string[];
  off: boolean;
  sort: number;
}

export interface Therapist {
  id: number;
  name: string;
}

export interface TxLine {
  id: string | null;
  cat: string | null;
  name: string;
  price: number;
  qty: number;
  unit?: BusinessUnit;
  terapis: string | null;
  /** hanya terisi untuk transaksi yang dibaca dari server (dipakai saat edit) */
  rowId?: number;
  terapisId?: number | null;
}

export interface Tx {
  id: number;
  no: string;
  at: number;
  cust: string;
  wa: string;
  lines: TxLine[];
  sub: number;
  disc: number;
  total: number;
  pay: PayMethod;
  cash: number;
  kasir: string;
}

export interface Expense {
  id: number;
  at: number;
  cat: string;
  amt: number;
  note: string;
  pay?: 'Tunai' | 'Transfer';
  unit?: 'salon' | 'gbee' | 'operasional';
}

export interface CapitalInjection {
  id: number;
  at: number;
  amt: number;
  cat: string;
  note: string;
  by?: string;
}

export const CAPITAL_CATS = [
  'Modal Awal Bulan',
  'Uang Kembalian Kasir',
  'Suntikan Dana Operasional',
  'Lainnya',
];

export interface CartLine {
  key: string;
  id: string;
  cat: string;
  name: string;
  price: number;
  qty: number;
  unit?: BusinessUnit;
  terapis: string; // id terapis sebagai string, '' = belum dipilih
  service: boolean;
}

export const EXP_CATS = ['Belanja bahan', 'Stok produk', 'Gaji', 'Listrik & air', 'Sewa', 'Lainnya'];

export interface DailyCashSummary {
  day: string; // YYYY-MM-DD
  opening_cash: number; // M
  cash_withdrawn: number;
  closing_cash_actual: number | null;
  notes: string | null;
  is_closed: boolean;
  closed_at: string | null;
  closed_by_name: string | null;
  total_sales: number;
  cash_sales_salon: number;
  cash_sales_gbee: number;
  cash_sales_total: number;
  qris_sales_salon: number;
  qris_sales_gbee: number;
  qris_sales_total: number;
  transfer_sales_salon: number;
  transfer_sales_gbee: number;
  transfer_sales_total: number;
  cash_expenses: number;
  expected_cash: number;
  difference: number | null;
  tx_lines: {
    id: number;
    no: string;
    cust: string | null;
    pay: PayMethod;
    total: number;
    salon: number;
    gbee: number;
    time: string;
  }[];
}

export interface Photo {
  id: string;
  title: string;
  sub: string;
  alt: string;
  cats: string[];
  image: string; // versi penuh (lightbox)
  thumb: string; // versi kecil (grid)
  w: number | null;
  h: number | null;
  sort: number;
  off: boolean;
}

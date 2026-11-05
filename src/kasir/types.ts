export type Role = 'owner' | 'kasir';
export type PayMethod = 'Tunai' | 'QRIS' | 'Transfer';
export type Variant = [string, number];

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
  terapis: string | null;
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
}

export interface CartLine {
  key: string;
  id: string;
  cat: string;
  name: string;
  price: number;
  qty: number;
  terapis: string; // id terapis sebagai string, '' = belum dipilih
  service: boolean;
}

export const EXP_CATS = ['Belanja bahan', 'Stok produk', 'Gaji', 'Listrik & air', 'Sewa', 'Lainnya'];

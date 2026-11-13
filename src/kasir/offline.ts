// Penyimpanan lokal (IndexedDB) untuk mode offline: antrean transaksi + cache data awal.
import type { PayMethod } from './types';

export interface QueuedTx {
  clientId: string;
  userId: string;
  createdAt: number;
  customer: string; wa: string; discount: number; pay: PayMethod; cash: number;
  cashierName: string;
  memberId?: number; memberFree?: boolean;
  lines: { id: string; cat: string; name: string; price: number; qty: number; terapis: string; service: boolean; key: string; free?: boolean }[];
  error?: string; // ditolak server (bukan masalah jaringan); tetap disimpan supaya tidak hilang
}

const DB_NAME = 'kasir-offline';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('queue', { keyPath: 'clientId' });
      r.result.createObjectStore('cache');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const enqueue = (t: QueuedTx) => run('queue', 'readwrite', (s) => s.put(t));
export const dequeue = (clientId: string) => run('queue', 'readwrite', (s) => s.delete(clientId));
export async function listQueue(userId: string): Promise<QueuedTx[]> {
  const all = await run<QueuedTx[]>('queue', 'readonly', (s) => s.getAll());
  return all.filter((t) => t.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
}

export const cacheSet = (key: string, value: unknown) => run('cache', 'readwrite', (s) => s.put(value, key)).catch(() => {});
export const cacheGet = <T,>(key: string) => run<T | undefined>('cache', 'readonly', (s) => s.get(key)).catch(() => undefined);

/** Kegagalan jaringan (bukan penolakan server). */
export const isNetworkError = (e: unknown) =>
  !navigator.onLine || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test((e as Error)?.message ?? '');

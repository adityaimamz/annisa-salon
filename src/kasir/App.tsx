import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createTransaction, deleteItem, loadCatalog, loadProfile, loadTherapists, saveItem, signOut,
} from './api';
import GaleriView from './GaleriView';
import HargaView from './HargaView';
import KaryawanView from './KaryawanView';
import KasirView from './KasirView';
import KeuanganView from './KeuanganView';
import Login from './Login';
import PengeluaranView from './PengeluaranView';
import { cacheGet, cacheSet, dequeue, enqueue, isNetworkError, listQueue } from './offline';
import TransaksiView from './TransaksiView';
import type { Category, Item, Profile, Therapist } from './types';
import { ConfirmProvider, Icon, ToastProvider, useToast } from './ui';
import { supabase, supabaseReady } from '../lib/supabase';

type View = 'kasir' | 'transaksi' | 'keuangan' | 'pengeluaran' | 'harga' | 'galeri' | 'karyawan';
const NAV: { id: View; label: string; icon: (s?: number) => React.ReactNode; ownerOnly?: boolean }[] = [
  { id: 'kasir', label: 'Kasir', icon: Icon.kasir },
  { id: 'transaksi', label: 'Transaksi', icon: Icon.transaksi, ownerOnly: true },
  { id: 'keuangan', label: 'Keuangan', icon: Icon.keuangan, ownerOnly: true },
  { id: 'pengeluaran', label: 'Pengeluaran', icon: Icon.pengeluaran, ownerOnly: true },
  { id: 'harga', label: 'Harga', icon: Icon.harga },
  { id: 'galeri', label: 'Galeri', icon: Icon.galeri, ownerOnly: true },
  { id: 'karyawan', label: 'Karyawan', icon: Icon.karyawan, ownerOnly: true },
];

export default function App() {
  if (!supabaseReady) {
    return <div className="boot">Supabase belum dikonfigurasi. Isi PUBLIC_SUPABASE_URL dan PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.</div>;
  }
  return <ToastProvider><ConfirmProvider><Auth /></ConfirmProvider></ToastProvider>;
}

function Auth() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const sb = supabase!;
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="boot">Memuat…</div>;
  if (!session) return <Login />;
  return <Shell key={session.user.id} userId={session.user.id} />;
}

function Shell({ userId }: { userId: string }) {
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('kasir');
  const [refreshKey, setRefreshKey] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState(0);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let sent = 0;
      for (const q of await listQueue(userId)) {
        if (q.error) continue;
        try {
          await createTransaction(q);
          await dequeue(q.clientId);
          sent++;
        } catch (e) {
          if (isNetworkError(e)) break;
          await enqueue({ ...q, error: (e as Error).message }); // ditolak server: simpan, jangan hilang
        }
      }
      const left = (await listQueue(userId));
      setPending(left.filter((t) => !t.error).length);
      setRejected(left.filter((t) => t.error).length);
      if (sent) {
        setRefreshKey((k) => k + 1);
        toast(`${sent} transaksi offline berhasil dikirim`);
      }
    } catch { /* IndexedDB tidak tersedia: abaikan */ } finally {
      flushing.current = false;
    }
  }, [userId, toast]);

  useEffect(() => {
    const on = () => { setOnline(true); flush(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const t = setInterval(() => { if (navigator.onLine) flush(); }, 20000);
    flush();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, [flush]);

  useEffect(() => {
    (async () => {
      try {
        let boot: { p: Profile; c: { cats: Category[]; items: Item[] }; t: Therapist[] };
        try {
          const p = await loadProfile(userId);
          if (!p) throw new Error('Akun tidak aktif atau profil tidak ditemukan. Hubungi pemilik salon.');
          const [c, t] = await Promise.all([loadCatalog(), loadTherapists()]);
          boot = { p, c, t };
          cacheSet('boot:' + userId, boot);
        } catch (e) {
          // Offline: pakai data terakhir yang tersimpan di perangkat.
          const cached = isNetworkError(e) ? await cacheGet<typeof boot>('boot:' + userId) : undefined;
          if (!cached) throw e;
          boot = cached;
        }
        setProfile(boot.p); setCats(boot.c.cats); setItems(boot.c.items); setTherapists(boot.t);
        setReady(true);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [userId]);

  const save = useCallback(async (it: Item) => {
    await saveItem(it);
    setItems((cur) => (cur.some((x) => x.id === it.id) ? cur.map((x) => (x.id === it.id ? it : x)) : [...cur, it]));
  }, []);
  const remove = useCallback(async (id: string) => {
    await deleteItem(id);
    setItems((cur) => cur.filter((x) => x.id !== id));
  }, []);

  if (error) {
    return (
      <div className="boot" style={{ flexDirection: 'column', gap: 12, textAlign: 'center', padding: 24 }}>
        <p>{error}</p>
        <button className="btn btn-line" onClick={() => signOut()}>Keluar</button>
      </div>
    );
  }
  if (!ready || !profile) return <div className="boot">Memuat data…</div>;

  const isOwner = profile.role === 'owner';
  const nav = NAV.filter((n) => !n.ownerOnly || isOwner);
  const current = nav.some((n) => n.id === view) ? view : 'kasir';
  const logout = async () => { try { await signOut(); } catch (e) { toast((e as Error).message, true); } };

  return (
    <div className="app">
      <aside className="side" aria-label="Panel samping">
        <div className="brand">
          <img src="/assets/mark-light.png" alt="" width="28" height="32" />
          <span className="brand-name">An-Nisa<small>Kasir &amp; Keuangan</small></span>
        </div>
        <p className="side-label">Menu</p>
        <nav className="side-nav" aria-label="Menu utama">
          {nav.map((n) => (
            <button key={n.id} className="navi" aria-current={current === n.id ? 'page' : undefined} onClick={() => setView(n.id)}>
              {n.icon(18)}{n.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <a className="navi" href="/">{Icon.back(18)}Kembali ke website</a>
          <div className="who">
            <span className="avatar" aria-hidden="true">{profile.name.trim().charAt(0).toUpperCase()}</span>
            <span className="who-text"><b>{profile.name}</b>{isOwner ? 'Pemilik' : 'Karyawan'}</span>
            <button className="logout" type="button" onClick={logout}>Keluar</button>
          </div>
        </div>
      </aside>

      <main className="main">
        {(!online || pending > 0 || rejected > 0) && (
          <div className="sync-pill" role="status">
            {!online ? 'Offline' : 'Online'}
            {pending > 0 && ` · ${pending} transaksi menunggu dikirim`}
            {rejected > 0 && ` · ${rejected} ditolak server (hubungi pemilik)`}
          </div>
        )}
        <div className="mobile-banner"><strong>An-Nisa · {profile.name}</strong>
          <span className="banner-links"><a href="/">Ke website</a><button type="button" onClick={logout}>Keluar</button></span>
        </div>
        <div hidden={current !== 'kasir'} style={{ height: '100%' }}>
          <KasirView cats={cats} items={items} therapists={therapists} profile={profile} onPaid={() => setRefreshKey((k) => k + 1)} onQueued={flush} />
        </div>
        {current === 'transaksi' && <TransaksiView refreshKey={refreshKey} therapists={therapists} items={items} />}
        {current === 'keuangan' && <KeuanganView cats={cats} refreshKey={refreshKey} onOpenPengeluaran={() => setView('pengeluaran')} />}
        {current === 'pengeluaran' && <PengeluaranView refreshKey={refreshKey} />}
        {current === 'harga' && <HargaView cats={cats} items={items} onSave={save} onDelete={remove} readOnly={!isOwner} />}
        {current === 'galeri' && <GaleriView />}
        {current === 'karyawan' && <KaryawanView onTherapists={setTherapists} />}
      </main>

      <nav className="tabbar" aria-label="Menu aplikasi" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
        {nav.map((n) => (
          <button key={n.id} className="navi" aria-current={current === n.id ? 'page' : undefined} onClick={() => setView(n.id)}>
            {n.icon(20)}{n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

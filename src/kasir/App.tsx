import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import {
  deleteItem, loadCatalog, loadProfile, loadTherapists, saveItem, signOut,
} from './api';
import HargaView from './HargaView';
import KaryawanView from './KaryawanView';
import KasirView from './KasirView';
import KeuanganView from './KeuanganView';
import Login from './Login';
import TransaksiView from './TransaksiView';
import type { Category, Item, Profile, Therapist } from './types';
import { ConfirmProvider, Icon, ToastProvider, useToast } from './ui';
import { supabase, supabaseReady } from '../lib/supabase';

type View = 'kasir' | 'transaksi' | 'keuangan' | 'harga' | 'karyawan';
const NAV: { id: View; label: string; icon: (s?: number) => React.ReactNode; ownerOnly?: boolean }[] = [
  { id: 'kasir', label: 'Kasir', icon: Icon.kasir },
  { id: 'transaksi', label: 'Transaksi', icon: Icon.transaksi, ownerOnly: true },
  { id: 'keuangan', label: 'Keuangan', icon: Icon.keuangan, ownerOnly: true },
  { id: 'harga', label: 'Harga', icon: Icon.harga },
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

  useEffect(() => {
    (async () => {
      try {
        const p = await loadProfile(userId);
        if (!p) throw new Error('Akun tidak aktif atau profil tidak ditemukan. Hubungi pemilik salon.');
        const [c, t] = await Promise.all([loadCatalog(), loadTherapists()]);
        setProfile(p); setCats(c.cats); setItems(c.items); setTherapists(t);
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
        <div className="mobile-banner"><strong>An-Nisa · {profile.name}</strong>
          <span className="banner-links"><a href="/">Ke website</a><button type="button" onClick={logout}>Keluar</button></span>
        </div>
        <div hidden={current !== 'kasir'} style={{ height: '100%' }}>
          <KasirView cats={cats} items={items} therapists={therapists} profile={profile} onPaid={() => setRefreshKey((k) => k + 1)} />
        </div>
        {current === 'transaksi' && <TransaksiView refreshKey={refreshKey} />}
        {current === 'keuangan' && <KeuanganView cats={cats} refreshKey={refreshKey} />}
        {current === 'harga' && <HargaView cats={cats} items={items} onSave={save} onDelete={remove} readOnly={!isOwner} />}
        {current === 'karyawan' && <KaryawanView />}
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

import { useEffect, useState } from 'react';
import { supabase, supabaseReady } from '../lib/supabase';

// Placeholder island. Prototipe lengkap masih di kasir/index.html
// dan akan dimigrasikan bertahap ke komponen React di sini.
export default function Kasir() {
  const [status, setStatus] = useState('memeriksa koneksi…');

  useEffect(() => {
    if (!supabase) return setStatus('Supabase belum dikonfigurasi (isi .env).');
    supabase.auth.getSession().then(({ error }) =>
      setStatus(error ? `Error: ${error.message}` : 'Terhubung ke Supabase.')
    );
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>Kasir Annisa Salon</h1>
      <p>{supabaseReady ? status : 'Supabase belum dikonfigurasi (isi .env).'}</p>
    </main>
  );
}

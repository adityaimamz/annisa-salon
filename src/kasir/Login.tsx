import { useState } from 'react';
import { signIn } from './api';
import { Icon } from './ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try { await signIn(email.trim(), password); }
    catch (ex) {
      const m = (ex as Error).message;
      setErr(/invalid login/i.test(m) ? 'Email atau kata sandi salah.' : m);
    } finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <div className="brand">
          <img src="/assets/mark.png" alt="" width="30" height="34" />
          <span className="brand-name">An-Nisa<small>Kasir &amp; Keuangan</small></span>
        </div>
        <h1>Masuk</h1>
        <p className="sub">Gunakan akun yang diberikan pemilik salon.</p>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input className="input" id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Kata sandi</label>
          <input className="input" id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn btn-green" type="submit" disabled={busy || !email || !password}>{busy ? 'Masuk…' : 'Masuk'}</button>
        {err && <p className="err" role="alert">{err}</p>}
        <a className="login-back" href="/">{Icon.back(16)}Kembali ke beranda</a>
      </form>
    </div>
  );
}

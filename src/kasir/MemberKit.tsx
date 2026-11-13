import { useEffect, useMemo, useState } from 'react';
import { createMember } from './api';
import { MEMBER_GOAL, fmtDate, memberStat } from './member';
import type { Member } from './types';
import { CloseBtn, Icon, Sheet, useToast } from './ui';

/** Titik cap 1..10 (terisi = sudah dicap). Terakhir = hadiah gratis. */
export function StampDots({ m }: Readonly<{ m: Member }>) {
  const { cycle, available } = memberStat(m);
  return (
    <span className="stamps" role="img" aria-label={`Cap ${cycle} dari ${MEMBER_GOAL}`}>
      {Array.from({ length: MEMBER_GOAL }, (_, i) => <i key={i} className={i < cycle ? 'on' : ''} />)}
      <b className={available > 0 ? 'gift on' : 'gift'}>Gratis</b>
    </span>
  );
}

export function MemberTags({ m }: Readonly<{ m: Member }>) {
  const { expired, available } = memberStat(m);
  return (
    <>
      {expired && <span className="tagx off">Kedaluwarsa</span>}
      {available > 0 && <span className="tagx on">Gratis tersedia</span>}
    </>
  );
}

/** Form daftar member baru: gratis, berlaku 1 tahun. */
export function MemberFormSheet({ open, defaultName = '', defaultWa = '', onClose, onCreated }: Readonly<{
  open: boolean; defaultName?: string; defaultWa?: string; onClose: () => void; onCreated: (m: Member) => void;
}>) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [wa, setWa] = useState('');
  const [busy, setBusy] = useState(false);
  const [nameErr, setNameErr] = useState(false);

  useEffect(() => { if (open) { setName(defaultName); setWa(defaultWa); setNameErr(false); } }, [open, defaultName, defaultWa]);

  async function submit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      setNameErr(true);
      document.getElementById('memName')?.focus();
      toast('Nama member belum diisi', true);
      return;
    }
    setBusy(true);
    try {
      const m = await createMember(name.trim(), wa.trim());
      onClose(); onCreated(m);
      toast(`Member ${m.name} terdaftar, berlaku sampai ${fmtDate(m.expiresOn)}`);
    } catch (err) {
      toast(`Gagal mendaftar: ${(err as Error).message}`, true);
    } finally { setBusy(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="memFormTitle">
      <form className="sheet-in" onSubmit={submit} noValidate>
        <CloseBtn onClick={onClose} />
        <h3 id="memFormTitle">Daftar member baru</h3>
        <p className="sub2">Gratis. Berlaku 1 tahun sejak hari ini. Tiap 10 kunjungan, 1 treatment gratis.</p>
        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="memName">Nama</label>
          <input className="input" id="memName" value={name} aria-invalid={nameErr || undefined}
            onChange={(e) => { setName(e.target.value); setNameErr(false); }} placeholder="Nama member" />
          {nameErr && <p className="field-err" role="alert">Nama wajib diisi.</p>}
        </div>
        <div className="field">
          <label htmlFor="memWa">No. WA <span className="opt">(opsional)</span></label>
          <input className="input" id="memWa" inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)} placeholder="08…" />
        </div>
        <div className="sheet-actions">
          <button className="btn btn-green" type="submit" disabled={busy}>{busy ? 'Mendaftarkan…' : 'Daftarkan member'}</button>
        </div>
      </form>
    </Sheet>
  );
}

/** Pilih member di Kasir: cari nama / WA, atau daftar baru. */
export function MemberPicker({ open, members, defaultName, defaultWa, onClose, onPick }: Readonly<{
  open: boolean; members: Member[]; defaultName: string; defaultWa: string; onClose: () => void; onPick: (m: Member) => void;
}>) {
  const [q, setQ] = useState('');
  const [reg, setReg] = useState(false);
  useEffect(() => { if (open) { setQ(''); setReg(false); } }, [open]);

  const needle = q.trim().toLowerCase();
  const list = useMemo(() => {
    const rows = members
      .map((m) => ({ m, s: memberStat(m) }))
      .filter(({ m }) => !needle || `${m.name} ${m.wa}`.toLowerCase().includes(needle));
    return rows.sort((a, b) => Number(a.s.expired) - Number(b.s.expired) || a.m.name.localeCompare(b.m.name, 'id'));
  }, [members, needle]);

  return (
    <>
      <Sheet open={open && !reg} onClose={() => { if (!reg) onClose(); }} labelledBy="memPickTitle">
        <div className="sheet-in">
          <CloseBtn onClick={onClose} />
          <h3 id="memPickTitle">Pilih member</h3>
          <label className="search" style={{ display: 'block', margin: '16px 0 10px' }}>
            {Icon.search()}
            <input className="input" type="search" placeholder="Cari nama atau no. WA…" autoComplete="off" aria-label="Cari member"
              value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="mem-list">
            {list.length ? list.map(({ m, s }) => (
              <button key={m.id} type="button" className={`mem-row${s.expired ? ' exp' : ''}`} onClick={() => onPick(m)}>
                <span className="mem-top"><b>{m.name}</b><MemberTags m={m} /></span>
                <span className="mem-sub">{m.wa && `${m.wa} · `}Cap {s.cycle}/{MEMBER_GOAL} · s.d. {fmtDate(m.expiresOn)}</span>
              </button>
            )) : <p className="stk-empty" style={{ padding: '14px 4px' }}>{members.length ? 'Tidak ada member yang cocok.' : 'Belum ada member.'}</p>}
          </div>
          <div className="sheet-actions" style={{ marginTop: 14 }}>
            <button className="btn btn-line" type="button" onClick={() => setReg(true)}>+ Daftar member baru</button>
          </div>
        </div>
      </Sheet>
      <MemberFormSheet open={open && reg} defaultName={q.trim() || defaultName} defaultWa={defaultWa}
        onClose={() => setReg(false)} onCreated={(m) => onPick(m)} />
    </>
  );
}

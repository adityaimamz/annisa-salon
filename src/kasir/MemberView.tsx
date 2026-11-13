import { useCallback, useEffect, useMemo, useState } from 'react';
import { addMemberVisit, deleteMember, deleteMemberVisit, loadMembers, loadMemberVisits } from './api';
import { fmtDay } from './format';
import { MemberFormSheet, MemberTags, StampDots } from './MemberKit';
import { MEMBER_GOAL, fmtDate, memberStat } from './member';
import type { Member, MemberVisit } from './types';
import { CloseBtn, Icon, Sheet, useConfirm, useToast } from './ui';

type Filter = 'aktif' | 'lama' | 'semua';

/** Menu Member (owner): daftar, cari, riwayat cap, cap manual, hapus. Cap otomatis dicatat dari Kasir. */
export default function MemberView({ refreshKey }: Readonly<{ refreshKey: number }>) {
  const toast = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [filter, setFilter] = useState<Filter>('aktif');
  const [q, setQ] = useState('');
  const [reg, setReg] = useState(false);
  const [detail, setDetail] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { setMembers(await loadMembers()); }
    catch (e) { toast(`Gagal memuat member: ${(e as Error).message}`, true); }
  }, [toast]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (members ?? [])
      .map((m) => ({ m, s: memberStat(m) }))
      .filter(({ m, s }) =>
        (filter === 'semua' || (filter === 'aktif') === !s.expired) &&
        (!needle || `${m.name} ${m.wa}`.toLowerCase().includes(needle)))
      .sort((a, b) => b.s.available - a.s.available || a.m.name.localeCompare(b.m.name, 'id'));
  }, [members, filter, q]);

  const activeCount = (members ?? []).filter((m) => !memberStat(m).expired).length;
  const selected = members?.find((m) => m.id === detail) ?? null;

  return (
    <section className="view" aria-label="Member">
      <div className="v-head">
        <div><h1>Member</h1>
          <p className="meta">{members ? `${activeCount} member aktif` : 'Memuat…'} · cap dicatat otomatis saat bayar di Kasir</p></div>
        <button className="btn btn-green btn-sm" type="button" onClick={() => setReg(true)}>+ Daftar member</button>
      </div>
      <div className="pad">
        <div className="stk-tools">
          <div className="seg seg-scroll" role="group" aria-label="Status member">
            <button type="button" aria-pressed={filter === 'aktif'} onClick={() => setFilter('aktif')}>Aktif</button>
            <button type="button" aria-pressed={filter === 'lama'} onClick={() => setFilter('lama')}>Kedaluwarsa</button>
            <button type="button" aria-pressed={filter === 'semua'} onClick={() => setFilter('semua')}>Semua</button>
          </div>
        </div>
        <label className="search" style={{ display: 'block', marginBottom: 16 }}>
          {Icon.search()}
          <input className="input" type="search" placeholder="Cari nama atau no. WA…" autoComplete="off" aria-label="Cari member"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </label>

        {members === null ? <p className="empty-cart">Memuat…</p> : rows.length ? (
          <div className="pr-card">
            {rows.map(({ m, s }) => (
              <button key={m.id} type="button" className={`mem-item${s.expired ? ' exp' : ''}`} onClick={() => setDetail(m.id)}>
                <span className="mem-top"><b>{m.name}</b><MemberTags m={m} /></span>
                <StampDots m={m} />
                <span className="mem-sub">{m.wa && `${m.wa} · `}Daftar {fmtDate(m.joinedOn)} · s.d. {fmtDate(m.expiresOn)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-cart">
            <b>{members.length ? 'Tidak ada member yang cocok' : 'Belum ada member'}</b>
            {members.length ? '' : 'Tekan "+ Daftar member" atau daftarkan langsung dari Kasir.'}
          </p>
        )}
      </div>

      <MemberFormSheet open={reg} onClose={() => setReg(false)} onCreated={(m) => { setMembers((c) => [...(c ?? []), m]); setDetail(m.id); }} />
      <MemberDetail member={selected} onClose={() => setDetail(null)} onChanged={() => void load()} />
    </section>
  );
}

function MemberDetail({ member, onClose, onChanged }: Readonly<{ member: Member | null; onClose: () => void; onChanged: () => void }>) {
  const toast = useToast();
  const confirm = useConfirm();
  const [visits, setVisits] = useState<MemberVisit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [treat, setTreat] = useState('');
  const id = member?.id;

  const reload = useCallback(async () => {
    if (!id) return;
    try { setVisits(await loadMemberVisits(id)); }
    catch (e) { toast(`Gagal memuat riwayat: ${(e as Error).message}`, true); }
  }, [id, toast]);
  useEffect(() => { setVisits(null); setTreat(''); void reload(); }, [reload]);

  async function addStamp() {
    if (!member || busy) return;
    setBusy(true);
    try { await addMemberVisit(member.id, 'stamp', treat.trim()); setTreat(''); await reload(); onChanged(); toast('Cap ditambahkan'); }
    catch (e) { toast(`Gagal: ${(e as Error).message}`, true); }
    finally { setBusy(false); }
  }

  async function removeVisit(v: MemberVisit) {
    if (!(await confirm({
      title: 'Hapus catatan ini?',
      message: v.txId ? 'Catatan ini terkait transaksi. Transaksinya tidak ikut terhapus.' : 'Cap/gratis ini akan dihapus.',
      confirmLabel: 'Hapus', danger: true,
    }))) return;
    try { await deleteMemberVisit(v.id); await reload(); onChanged(); toast('Catatan dihapus'); }
    catch (e) { toast(`Gagal menghapus: ${(e as Error).message}`, true); }
  }

  async function removeMember() {
    if (!member || !(await confirm({
      title: `Hapus member ${member.name}?`,
      message: 'Seluruh riwayat cap ikut dihapus. Transaksi di Kasir tidak berubah.',
      confirmLabel: 'Hapus', danger: true,
    }))) return;
    try { await deleteMember(member.id); onClose(); onChanged(); toast('Member dihapus'); }
    catch (e) { toast(`Gagal menghapus: ${(e as Error).message}`, true); }
  }

  const s = member ? memberStat(member) : null;
  return (
    <Sheet open={!!member} onClose={onClose} labelledBy="memDetTitle" className="sheet-stok">
      {member && s && (
        <div className="sheet-in">
          <CloseBtn onClick={onClose} />
          <h3 id="memDetTitle">{member.name}</h3>
          <p className="sub2">{member.wa && `${member.wa} · `}Daftar {fmtDate(member.joinedOn)} · berlaku s.d. {fmtDate(member.expiresOn)}</p>
          <div className="mem-prog">
            <StampDots m={member} />
            <span>Cap {s.cycle}/{MEMBER_GOAL}{s.available > 0 && ' · gratis tersedia'}{s.expired && ' · kedaluwarsa'}</span>
          </div>

          {!s.expired && (
            <div className="stk-koreksi">
              <span className="label">Tambah cap manual <small>(kunjungan yang lupa dicatat di Kasir)</small></span>
              <div className="stk-koreksi-row" style={{ gridTemplateColumns: '1fr auto' }}>
                <input className="input" placeholder="Treatment (opsional)" aria-label="Treatment" value={treat} onChange={(e) => setTreat(e.target.value)} />
                <button className="btn btn-line btn-sm" type="button" onClick={addStamp} disabled={busy}>+ Cap</button>
              </div>
            </div>
          )}

          <h4 className="stk-h4">Riwayat</h4>
          {visits === null ? <p className="stk-empty">Memuat…</p> : visits.length ? (
            <ul className="stk-hist">
              {visits.map((v) => (
                <li key={v.id}>
                  <div>
                    <b>{v.kind === 'free' ? 'Treatment gratis' : 'Cap'}</b>
                    <span className="m">{fmtDay(v.at, { day: 'numeric', month: 'short', year: 'numeric' })}{v.treatments && ` · ${v.treatments}`}</span>
                  </div>
                  <span className="q">{v.kind === 'free' ? 'Gratis' : '+1'}</span>
                  <button className="icon-btn" type="button" aria-label="Hapus catatan" onClick={() => removeVisit(v)}>{Icon.close()}</button>
                </li>
              ))}
            </ul>
          ) : <p className="stk-empty">Belum ada kunjungan.</p>}

          <div className="sheet-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-line btn-danger" type="button" onClick={removeMember}>Hapus member</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

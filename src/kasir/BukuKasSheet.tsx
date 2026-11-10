import { useEffect, useState } from 'react';
import { getDailyCashSummary, saveDailyCashBook } from './api';
import { dayKey, fmtDay, money, num, rp } from './format';
import type { DailyCashSummary, Role } from './types';
import { CloseBtn, Icon, Sheet, useToast } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  role: Role;
  initialDay?: string;
  onSaved?: () => void;
}

export default function BukuKasSheet({ open, onClose, role, initialDay, onSaved }: Props) {
  const toast = useToast();
  const todayStr = dayKey(new Date());
  const [day, setDay] = useState(initialDay || todayStr);
  const [summary, setSummary] = useState<DailyCashSummary | null>(null);
  const [loading, setLoading] = useState(false);

  // Form inputs
  const [editOpening, setEditOpening] = useState(false);
  const [openingInput, setOpeningInput] = useState('');
  const [actualInput, setActualInput] = useState('');
  const [withdrawnInput, setWithdrawnInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDay(initialDay || todayStr);
  }, [open, initialDay, todayStr]);

  const loadData = async (d: string) => {
    setLoading(true);
    try {
      const s = await getDailyCashSummary(d);
      setSummary(s);
      setOpeningInput(String(s.opening_cash));
      setActualInput(s.closing_cash_actual !== null ? String(s.closing_cash_actual) : '');
      setWithdrawnInput(String(s.cash_withdrawn || ''));
      setNotesInput(s.notes || '');
      setEditOpening(false);
    } catch (e) {
      toast(`Gagal memuat buku kas: ${(e as Error).message}`, true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadData(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, day]);

  if (!summary && loading) {
    return (
      <Sheet open={open} onClose={onClose} labelledBy="bukuKasTitle">
        <div className="sheet-in">
          <CloseBtn onClick={onClose} />
          <h3 id="bukuKasTitle">Buku Kas & Rekonsiliasi Laci</h3>
          <p style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-3)' }}>Memuat data buku kas…</p>
        </div>
      </Sheet>
    );
  }

  const s = summary;
  const opening = editOpening ? num(openingInput) : (s?.opening_cash ?? 0);
  const withdrawn = num(withdrawnInput);
  const actual = actualInput.trim() !== '' ? num(actualInput) : null;
  const nonCashTotal = (s?.qris_sales_total ?? 0) + (s?.transfer_sales_total ?? 0);
  const expected = opening + (s?.cash_sales_total ?? 0) - (s?.cash_expenses ?? 0) - withdrawn;
  const diff = actual !== null ? actual - expected : null;

  async function handleSaveOpening() {
    if (!s || busy) return;
    setBusy(true);
    try {
      const res = await saveDailyCashBook({
        day,
        openingCash: num(openingInput),
        cashWithdrawn: withdrawn,
        closingCashActual: actual,
        notes: notesInput,
        isClosed: s.is_closed,
      });
      setSummary(res);
      setEditOpening(false);
      toast('Modal awal (M) diperbarui');
      onSaved?.();
    } catch (e) {
      toast(`Gagal menyimpan modal awal: ${(e as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseShift(isClosed: boolean) {
    if (!s || busy) return;
    setBusy(true);
    try {
      const res = await saveDailyCashBook({
        day,
        openingCash: opening,
        cashWithdrawn: withdrawn,
        closingCashActual: actual,
        notes: notesInput,
        isClosed,
      });
      setSummary(res);
      toast(isClosed ? 'Tutup kasir berhasil disimpan' : 'Buku kas diperbarui');
      onSaved?.();
    } catch (e) {
      toast(`Gagal menyimpan: ${(e as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  }

  function copyWhatsApp() {
    if (!s) return;
    const lines: string[] = [
      `*REKAP BUKU KAS AN-NISA SALON*`,
      `Tanggal: ${fmtDay(new Date(`${day}T00:00:00`), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
      ``,
      `*FORMAT BUKU KAS (LACI FISIK):*`,
      `M (Modal / Sisa Kemarin) : Rp ${money(opening)}`,
    ];

    if (s.tx_lines.length) {
      s.tx_lines.forEach((t, idx) => {
        const payTag = t.pay !== 'Tunai' ? ` (${t.pay})` : '';
        const name = t.cust ? `${t.cust}` : `Tx ${t.no}`;
        lines.push(`↳ ${idx + 1}. ${name}${payTag} : Rp ${money(t.total)}`);
      });
    } else {
      lines.push(`(Belum ada transaksi)`);
    }

    const subKotor = opening + s.total_sales;
    lines.push(`─────────────────────────────`);
    lines.push(`Subtotal Kotor : Rp ${money(subKotor)}`);
    if (s.qris_sales_total > 0) lines.push(`(-) QRIS : -Rp ${money(s.qris_sales_total)}`);
    if (s.transfer_sales_total > 0) lines.push(`(-) Transfer : -Rp ${money(s.transfer_sales_total)}`);
    if (s.cash_expenses > 0) lines.push(`(-) Pengeluaran Tunai : -Rp ${money(s.cash_expenses)}`);
    if (withdrawn > 0) lines.push(`(-) Setor ke Owner : -Rp ${money(withdrawn)}`);
    lines.push(`─────────────────────────────`);
    lines.push(`*Uang Fisik di Laci Seharusnya : Rp ${money(expected)}*`);

    if (actual !== null) {
      const statusText = diff === 0 ? 'PAS (Selisih Rp 0)' : diff! > 0 ? `LEBIH (+Rp ${money(diff!)})` : `KURANG (-Rp ${money(Math.abs(diff!))})`;
      lines.push(`Uang Fisik Aktual : Rp ${money(actual)} (${statusText})`);
    }

    lines.push(``);
    lines.push(`*PEMISAHAN ENTITAS:*`);
    lines.push(`• Salon : Rp ${money(s.cash_sales_salon + s.qris_sales_salon + s.transfer_sales_salon)} (Tunai: Rp ${money(s.cash_sales_salon)})`);
    lines.push(`• Gbee  : Rp ${money(s.cash_sales_gbee + s.qris_sales_gbee + s.transfer_sales_gbee)} (Tunai: Rp ${money(s.cash_sales_gbee)})`);

    if (notesInput.trim()) {
      lines.push(``);
      lines.push(`Catatan: ${notesInput.trim()}`);
    }

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast('Format rekap buku kas disalin ke clipboard!');
    }).catch(() => {
      toast('Gagal menyalin ke clipboard', true);
    });
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy="bukuKasTitle" className="sheet-buku-kas">
      <div className="sheet-in">
        <CloseBtn onClick={onClose} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingRight: 32 }}>
          <h3 id="bukuKasTitle" style={{ margin: 0 }}>Buku Kas & Rekonsiliasi</h3>
          {s?.is_closed && <span className="chip" style={{ background: 'var(--green-bg, #E6F4EA)', color: 'var(--green, #1F8A5B)', fontWeight: 600, fontSize: 12, padding: '2px 8px', borderRadius: 999 }}>✓ Selesai Tutup Kasir</span>}
        </div>

        {/* Pemilihan Tanggal */}
        <div className="buku-date-bar" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 14, flexWrap: 'wrap' }}>
          <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: 'auto', minWidth: 130, flex: '1 1 auto' }} />
          {day !== todayStr && <button type="button" className="btn btn-line btn-sm" onClick={() => setDay(todayStr)}>Hari ini</button>}
          <button type="button" className="btn btn-line btn-sm" onClick={() => {
            const d = new Date(`${day}T00:00:00`);
            d.setDate(d.getDate() - 1);
            setDay(dayKey(d));
          }}>← Kemarin</button>
        </div>

        {s && (
          <div style={{ display: 'grid', gap: 16, maxHeight: 'calc(80vh - 120px)', overflowY: 'auto', paddingRight: 4 }}>
            {/* KARTU 1: Format Buku Kas Manual (Identik Buku Kasir) */}
            <div style={{ background: 'var(--paper-2, #F8F9FA)', border: '1px solid var(--line, #E0E0E0)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px dashed var(--line)', paddingBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Perhitungan Kas Fisik Laci</span>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{fmtDay(new Date(`${day}T00:00:00`), { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>

              {/* Baris M (Modal / Sisa Laci Kemarin) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                <div>
                  <b style={{ color: 'var(--ink)' }}>M (Modal / Sisa Kemarin)</b>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>Uang kas tunai di awal hari</p>
                </div>
                {editOpening ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input className="input" inputMode="numeric" style={{ width: 110, height: 32, fontSize: 13, textAlign: 'right' }}
                      value={money(num(openingInput))} onChange={(e) => setOpeningInput(e.target.value)} />
                    <button type="button" className="btn btn-green btn-sm" onClick={handleSaveOpening} disabled={busy}>Simpan</button>
                    <button type="button" className="btn btn-line btn-sm" onClick={() => setEditOpening(false)}>Batal</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{rp(opening)}</span>
                    <button type="button" className="linkbtn" style={{ fontSize: 12 }} onClick={() => setEditOpening(true)}>Ubah</button>
                  </div>
                )}
              </div>

              {/* Transaksi Hari Ini */}
              <div style={{ margin: '8px 0', padding: '8px 0', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 6, fontWeight: 500 }}>
                  Transaksi Hari Ini ({s.tx_lines.length} transaksi)
                </div>
                {s.tx_lines.length ? (
                  <div style={{ display: 'grid', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
                    {s.tx_lines.map((t, idx) => (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                        <span>
                          <span style={{ color: 'var(--ink-3)', marginRight: 6 }}>{idx + 1}.</span>
                          <span style={{ fontWeight: 500 }}>{t.cust || `No. ${t.no}`}</span>
                          {t.pay !== 'Tunai' && <span style={{ marginLeft: 6, fontSize: 11, background: t.pay === 'QRIS' ? '#ECEBFA' : '#EEE', color: t.pay === 'QRIS' ? '#5E54C7' : '#555', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>{t.pay}</span>}
                          {t.gbee > 0 && <span style={{ marginLeft: 4, fontSize: 11, background: '#FFF3E0', color: '#E65100', padding: '1px 5px', borderRadius: 4 }}>Gbee</span>}
                        </span>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{rp(t.total)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic', padding: '4px 0' }}>Belum ada transaksi pada tanggal ini.</div>
                )}
              </div>

              {/* Subtotal Kotor & Pengurangan */}
              <div style={{ display: 'grid', gap: 6, fontSize: 13.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-2)' }}>
                  <span>Subtotal Kotor (M + Transaksi)</span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{rp(opening + s.total_sales)}</b>
                </div>

                {s.qris_sales_total > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#B4372F' }}>
                    <span>(-) Non-Tunai (QRIS)</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>- {rp(s.qris_sales_total)}</span>
                  </div>
                )}

                {s.transfer_sales_total > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#B4372F' }}>
                    <span>(-) Non-Tunai (Transfer)</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>- {rp(s.transfer_sales_total)}</span>
                  </div>
                )}

                {s.cash_expenses > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#B4372F' }}>
                    <span>(-) Pengeluaran Kasir Tunai</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>- {rp(s.cash_expenses)}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>(-) Setor ke Owner / Tarik Kas</span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ color: '#B4372F', fontSize: 13 }}>-</span>
                    <input className="input" inputMode="numeric" placeholder="0" style={{ width: 100, height: 30, fontSize: 13, textAlign: 'right' }}
                      value={withdrawn ? money(withdrawn) : ''} onChange={(e) => setWithdrawnInput(e.target.value)} />
                  </div>
                </div>

                <div style={{ borderTop: '2px solid var(--ink)', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <b style={{ fontSize: 14 }}>Uang Fisik di Laci Seharusnya</b>
                  <b style={{ fontSize: 20, color: 'var(--green, #1F8A5B)', fontVariantNumeric: 'tabular-nums' }}>{rp(expected)}</b>
                </div>
              </div>
            </div>

            {/* KARTU 2: Pemisahan Entitas (Salon vs Gbee) */}
            <div style={{ background: 'var(--paper, #fff)', border: '1px solid var(--line, #E0E0E0)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span>Pemisahan Arus Kas (Salon vs Gbee)</span>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Penjualan Hari Ini</span>
              </div>
              <div className="buku-split-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* Pos Salon */}
                <div style={{ background: 'var(--paper-2, #F8F9FA)', padding: 10, borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', marginBottom: 4 }}>💇 Salon</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Tunai: <b>{rp(s.cash_sales_salon)}</b></div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Non-tunai: {rp(s.qris_sales_salon + s.transfer_sales_salon)}</div>
                  <div style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    Total: {rp(s.cash_sales_salon + s.qris_sales_salon + s.transfer_sales_salon)}
                  </div>
                </div>

                {/* Pos Gbee */}
                <div style={{ background: '#FFF8E1', padding: 10, borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#E65100', marginBottom: 4 }}>✨ Gbee Glow Beauty</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Tunai: <b>{rp(s.cash_sales_gbee)}</b></div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Non-tunai: {rp(s.qris_sales_gbee + s.transfer_sales_gbee)}</div>
                  <div style={{ borderTop: '1px solid rgba(230,81,0,.2)', marginTop: 4, paddingTop: 4, fontSize: 13, fontWeight: 700, color: '#E65100' }}>
                    Total: {rp(s.cash_sales_gbee + s.qris_sales_gbee + s.transfer_sales_gbee)}
                  </div>
                </div>
              </div>
            </div>

            {/* KARTU 3: Hitungan Fisik Riil Laci (Rekonsiliasi / Tutup Kasir) */}
            <div style={{ background: 'var(--card, #fff)', border: '1px solid var(--line, #E0E0E0)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>Rekonsiliasi Hitungan Fisik</div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <label htmlFor="cashActual" style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 4 }}>
                    Jumlah uang tunai riil di laci saat dihitung:
                  </label>
                  <input id="cashActual" className="input" inputMode="numeric" placeholder="Masukkan total uang fisik (Rp)"
                    style={{ fontSize: 16, fontWeight: 600 }}
                    value={actual !== null ? money(actual) : ''} onChange={(e) => setActualInput(e.target.value)} />
                </div>

                {actual !== null && (
                  <div className="buku-diff-box" style={{
                    padding: 10, borderRadius: 8, fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: diff === 0 ? '#E6F4EA' : diff! > 0 ? '#E8F0FE' : '#FCE8E6',
                    color: diff === 0 ? '#137333' : diff! > 0 ? '#1967D2' : '#C5221F',
                  }}>
                    <span>{diff === 0 ? '✓ PAS (Sesuai hitungan sistem)' : diff! > 0 ? `▲ LEBIH: +${rp(diff!)}` : `▼ KURANG: -${rp(Math.abs(diff!))}`}</span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>Fisik: {rp(actual)} vs Sistem: {rp(expected)}</span>
                  </div>
                )}

                <div>
                  <label htmlFor="cashNotes" style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 4 }}>
                    Catatan rekonsiliasi (opsional):
                  </label>
                  <input id="cashNotes" className="input" placeholder="Misal: ada uang kembalian receh belum ditukar"
                    value={notesInput} onChange={(e) => setNotesInput(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Tombol Aksi */}
            <div className="buku-actions-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <button type="button" className="btn btn-green" onClick={() => handleCloseShift(!s.is_closed)} disabled={busy} style={{ order: 1 }}>
                {busy ? 'Menyimpan…' : s.is_closed ? 'Perbarui Buku Kas' : 'Tutup Kasir Hari Ini'}
              </button>
              <button type="button" className="btn btn-line" onClick={copyWhatsApp} style={{ order: 2 }}>
                📋 Salin Rekap WA
              </button>
            </div>

            {s.closed_at && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', textAlign: 'center' }}>
                Terakhir ditutup oleh {s.closed_by_name || 'Kasir'} pada {new Date(s.closed_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}


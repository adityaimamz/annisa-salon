import { useEffect, useMemo, useState } from 'react';
import { addCapitalInjection, deleteCapitalInjection, loadCapitalInjections, loadDailyCashLogs } from './api';
import { dayKey, fmtDay, fmtTime, money, num, rp } from './format';
import { CAPITAL_CATS, type CapitalInjection, type DailyCashLog } from './types';
import { CloseBtn, Sheet, useConfirm, useToast } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type HistoryItem = {
  type: 'injection' | 'adjustment';
  id: string;
  at: number;
  amt: number;
  oldAmt?: number | null;
  cat: string;
  note: string;
  by?: string;
  rawInjection?: CapitalInjection;
};

export default function CapitalSheet({ open, onClose, onSaved }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'add' | 'history'>('add');
  const [injections, setInjections] = useState<CapitalInjection[]>([]);
  const [cashLogs, setCashLogs] = useState<DailyCashLog[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'injection' | 'adjustment'>('all');
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Form states
  const [cat, setCat] = useState<string>(CAPITAL_CATS[0]);
  const [customCat, setCustomCat] = useState('');
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(dayKey(new Date()));
    setAmt('');
    setNote('');
    setCat(CAPITAL_CATS[0]);
    setCustomCat('');
    refreshHistory();
  }, [open]);

  async function refreshHistory() {
    setLoadingHistory(true);
    try {
      const [injData, logsData] = await Promise.all([
        loadCapitalInjections(),
        loadDailyCashLogs(50),
      ]);
      setInjections(injData);
      setCashLogs(logsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  }

  const historyItems = useMemo<HistoryItem[]>(() => {
    const list: HistoryItem[] = [];
    for (const item of injections) {
      list.push({
        type: 'injection',
        id: `inj-${item.id}`,
        at: item.at,
        amt: item.amt,
        cat: item.cat,
        note: item.note,
        by: item.by,
        rawInjection: item,
      });
    }
    for (const log of cashLogs) {
      list.push({
        type: 'adjustment',
        id: `log-${log.id}`,
        at: new Date(log.created_at).getTime(),
        amt: log.new_amount,
        oldAmt: log.old_amount,
        cat: 'Penyesuaian Kas Laci',
        note: log.note || '',
        by: log.user_name || undefined,
      });
    }
    return list.sort((a, b) => b.at - a.at);
  }, [injections, cashLogs]);

  const filteredHistory = useMemo(() => {
    if (logFilter === 'injection') return historyItems.filter((x) => x.type === 'injection');
    if (logFilter === 'adjustment') return historyItems.filter((x) => x.type === 'adjustment');
    return historyItems;
  }, [historyItems, logFilter]);

  const finalCat = customCat.trim() || cat;
  const canSubmit = !!num(amt) && finalCat;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || saving) return;
    const a = num(amt);
    setSaving(true);
    try {
      const [Y, M, D] = date.split('-').map(Number);
      const at = new Date(Y, M - 1, D, 12).getTime();
      await addCapitalInjection({
        amt: a,
        cat: finalCat,
        note: note.trim() || undefined,
        at,
      });
      toast(`Modal ${finalCat} sebesar ${rp(a)} berhasil dicatat!`);
      await refreshHistory();
      onSaved();
      setTab('history');
      setAmt('');
      setNote('');
    } catch (err) {
      toast(`Gagal menyimpan: ${(err as Error).message}`, true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: CapitalInjection) {
    if (saving) return;
    if (!(await confirm({
      title: 'Hapus catatan modal ini?',
      message: `${item.cat} · ${rp(item.amt)} (${item.note || 'Tanpa keterangan'}) akan dihapus.`,
      confirmLabel: 'Hapus',
      danger: true,
    }))) return;

    setSaving(true);
    try {
      await deleteCapitalInjection(item.id);
      toast('Catatan modal berhasil dihapus');
      await refreshHistory();
      onSaved();
    } catch (err) {
      toast(`Gagal menghapus: ${(err as Error).message}`, true);
    } finally {
      setSaving(false);
    }
  }

  const totalCapital = injections.reduce((acc, cur) => acc + cur.amt, 0);

  return (
    <Sheet open={open} onClose={onClose} labelledBy="capTitle">
      <div className="sheet-in">
        <CloseBtn onClick={onClose} />
        <h3 id="capTitle" style={{ marginBottom: 14 }}>💵 Modal Kas &amp; Suntikan Dana</h3>

        {/* Tab switcher */}
        <div className="seg" style={{ width: '100%', marginBottom: 16 }}>
          <button
            type="button"
            aria-pressed={tab === 'add'}
            onClick={() => setTab('add')}
            style={{ flex: 1, textAlign: 'center' }}
          >
            + Tambah Modal
          </button>
          <button
            type="button"
            aria-pressed={tab === 'history'}
            onClick={() => setTab('history')}
            style={{ flex: 1, textAlign: 'center' }}
          >
            📜 Riwayat ({historyItems.length})
          </button>
        </div>

        {tab === 'add' ? (
          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <span className="label">Jenis / Keterangan Suntikan Dana</span>
              <div className="chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {CAPITAL_CATS.map((c) => (
                  <label className="chip" key={c}>
                    <input
                      type="radio"
                      name="capCat"
                      value={c}
                      checked={!customCat.trim() && cat === c}
                      onChange={() => { setCat(c); setCustomCat(''); }}
                    />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
              <input
                className="input"
                style={{ marginTop: 8 }}
                placeholder="Atau tulis jenis suntikan lainnya…"
                value={customCat}
                onChange={(e) => setCustomCat(e.target.value)}
                maxLength={40}
              />
            </div>

            <div className="field row2" style={{ marginTop: 14 }}>
              <div>
                <label htmlFor="capAmt">Nominal Modal</label>
                <input
                  className="input"
                  id="capAmt"
                  inputMode="numeric"
                  placeholder="Rp0"
                  value={amt ? 'Rp' + money(num(amt)) : ''}
                  onChange={(e) => setAmt(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="capDate">Tanggal</label>
                <input
                  className="input"
                  id="capDate"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="capNote">Catatan / Keterangan Tambahan</label>
              <textarea
                className="input"
                id="capNote"
                rows={2}
                placeholder="Contoh: Pecahan 5rb & 10rb untuk kembalian kasir, modal sisa bulan lalu, dll."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                type="submit"
                className="btn btn-green btn-full"
                disabled={!canSubmit || saving}
              >
                {saving ? 'Menyimpan…' : 'Simpan Suntikan Modal'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div style={{
              background: 'var(--card-sub, #f5f4ef)',
              padding: '10px 14px',
              borderRadius: 8,
              marginBottom: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}>
              <div>
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Total Modal Masuk:</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>*Suntikan dana riil ke kas</span>
              </div>
              <b style={{ fontSize: 16, color: 'var(--green, #1F8A5B)' }}>{rp(totalCapital)}</b>
            </div>

            {/* Filter pills */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
              <button
                type="button"
                className={`linkbtn ${logFilter === 'all' ? 'active' : ''}`}
                onClick={() => setLogFilter('all')}
                style={{
                  fontSize: 11.5,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: logFilter === 'all' ? 'var(--ink)' : 'var(--card-sub, #f0efe9)',
                  color: logFilter === 'all' ? '#fff' : 'var(--ink-2)',
                  fontWeight: 600,
                }}
              >
                Semua ({historyItems.length})
              </button>
              <button
                type="button"
                className={`linkbtn ${logFilter === 'injection' ? 'active' : ''}`}
                onClick={() => setLogFilter('injection')}
                style={{
                  fontSize: 11.5,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: logFilter === 'injection' ? 'var(--ink)' : 'var(--card-sub, #f0efe9)',
                  color: logFilter === 'injection' ? '#fff' : 'var(--ink-2)',
                  fontWeight: 600,
                }}
              >
                Suntikan Modal ({injections.length})
              </button>
              <button
                type="button"
                className={`linkbtn ${logFilter === 'adjustment' ? 'active' : ''}`}
                onClick={() => setLogFilter('adjustment')}
                style={{
                  fontSize: 11.5,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: logFilter === 'adjustment' ? 'var(--ink)' : 'var(--card-sub, #f0efe9)',
                  color: logFilter === 'adjustment' ? '#fff' : 'var(--ink-2)',
                  fontWeight: 600,
                }}
              >
                Penyesuaian Kas ({cashLogs.length})
              </button>
            </div>

            {loadingHistory ? (
              <p className="muted" style={{ textAlign: 'center', padding: 20 }}>Memuat riwayat…</p>
            ) : filteredHistory.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: 20 }}>Belum ada catatan riwayat modal.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
                {filteredHistory.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span
                          className="pill"
                          style={{
                            fontSize: 11,
                            background: item.type === 'injection' ? '#E8F5E9' : '#E3F2FD',
                            color: item.type === 'injection' ? '#1B5E20' : '#1565C0',
                          }}
                        >
                          {item.cat}
                        </span>
                        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                          {fmtDay(item.at, { day: 'numeric', month: 'short' })} · {fmtTime(item.at)}
                        </span>
                        {item.by && (
                          <span style={{ fontSize: 10.5, color: 'var(--ink-3)', background: 'var(--card-sub)', padding: '1px 5px', borderRadius: 4 }}>
                            {item.by}
                          </span>
                        )}
                      </div>
                      {item.note && (
                        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>
                          {item.note}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <b style={{ fontVariantNumeric: 'tabular-nums', color: item.type === 'injection' ? 'var(--green, #1F8A5B)' : 'var(--ink)' }}>
                          {item.type === 'injection' ? `+${rp(item.amt)}` : rp(item.amt)}
                        </b>
                        {item.oldAmt != null && item.oldAmt !== item.amt && (
                          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textDecoration: 'line-through' }}>
                            {rp(item.oldAmt)}
                          </div>
                        )}
                      </div>
                      {item.rawInjection && (
                        <button
                          type="button"
                          className="linkbtn"
                          style={{ color: 'var(--red, #D32F2F)', fontSize: 12, padding: '2px 4px' }}
                          onClick={() => handleDelete(item.rawInjection!)}
                          title="Hapus catatan modal ini"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

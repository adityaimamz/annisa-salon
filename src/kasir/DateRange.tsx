/** Dua kolom tanggal (dari – sampai) untuk rentang bebas. Nilai berformat yyyy-mm-dd. */
export default function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const todayKey = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return (
    <div className="field row2 date-range">
      <div><label htmlFor="drFrom">Dari</label>
        <input className="input" id="drFrom" type="date" value={from} max={to || todayKey} onChange={(e) => onChange(e.target.value, to)} /></div>
      <div><label htmlFor="drTo">Sampai</label>
        <input className="input" id="drTo" type="date" value={to} min={from || undefined} max={todayKey} onChange={(e) => onChange(from, e.target.value)} /></div>
    </div>
  );
}

/** Awal bulan ini dan hari ini, sebagai nilai awal saat memilih "Pilih tanggal". */
export function defaultRange(): [string, string] {
  const k = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const now = new Date();
  return [k(new Date(now.getFullYear(), now.getMonth(), 1)), k(now)];
}

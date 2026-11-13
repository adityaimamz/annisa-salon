import { useEffect, useState } from 'react';
import { money, num } from './format';

/** Input nominal yang menyimpan saat blur / Enter. Nilai 0 atau kosong dibatalkan. */
export default function MoneyInput({ value, label, onCommit }: { value: number; label: string; onCommit: (v: number) => void }) {
  const [text, setText] = useState(money(value));
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(money(value)), [value]);
  const commit = () => {
    const v = num(text);
    if (!v) { setText(money(value)); return; }
    if (v === value) return;
    setSaved(true);
    onCommit(v);
    window.setTimeout(() => setSaved(false), 1200);
  };
  return (
    <label className="money"><span>Rp</span>
      <input className={`input${saved ? ' saved' : ''}`} inputMode="numeric" value={text} aria-label={`Harga ${label}`}
        onChange={(e) => { setText(money(num(e.target.value))); setSaved(false); }}
        onFocus={(e) => e.target.select()}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

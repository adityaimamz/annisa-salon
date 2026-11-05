export const rp = (n: number) => 'Rp' + Math.round(n).toLocaleString('id-ID');
export const rpk = (n: number) =>
  n >= 1e6 ? (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : Math.round(n / 1000) + ' rb';
export const num = (s: string) => Number(String(s).replace(/[^\d]/g, '')) || 0;
export const money = (v: number) => (v ? v.toLocaleString('id-ID') : '');

export const startOfDay = (d: number | Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const dayKey = (d: number | Date) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const fmtDay = (
  d: number | Date,
  o: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' },
) => new Date(d).toLocaleDateString('id-ID', o);
export const fmtTime = (d: number | Date) =>
  new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';

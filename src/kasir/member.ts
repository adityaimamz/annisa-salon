import { dayKey, fmtDay } from './format';
import type { Member } from './types';

export const MEMBER_GOAL = 10;

/** Status member: cap siklus ini (maks 10), jumlah treatment gratis yang tersedia, dan kedaluwarsa. */
export function memberStat(m: Member, today: string = dayKey(new Date())) {
  const expired = today > m.expiresOn;
  const earned = Math.floor(m.stamps / MEMBER_GOAL);
  const available = expired ? 0 : Math.max(0, earned - m.freeUsed);
  const cycle = Math.max(0, Math.min(MEMBER_GOAL, m.stamps - MEMBER_GOAL * m.freeUsed));
  return { expired, available, cycle };
}

export const fmtDate = (ymd: string) =>
  fmtDay(new Date(`${ymd}T00:00:00`), { day: 'numeric', month: 'short', year: 'numeric' });

export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** 'YYYY-MM-DD' (input[type=date] 값) */
export const toDateInput = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

export const formatDue = (iso: string): string =>
  new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(iso));

export const isOverdue = (iso: string, now = new Date()): boolean =>
  new Date(iso).getTime() < new Date(now.toDateString()).getTime();

export const formatDateTime = (iso: string): string =>
  new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

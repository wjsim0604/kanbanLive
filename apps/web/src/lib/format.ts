/** 아바타 이니셜: 영문은 단어 앞글자 2개(Jane Doe → JD), 한글 등은 첫 글자 1개(김지우 → 김) */
export const initials = (name: string): string => {
  const trimmed = name.trim();
  if (!/^[A-Za-z]/.test(trimmed)) return Array.from(trimmed)[0] ?? '?';
  return trimmed
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

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

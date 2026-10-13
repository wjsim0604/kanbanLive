import type { UserDto } from '@kanban/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const COLORS = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
];

/** 사용자 id로 결정되는 고정 색상 (presence에서 사람 구분용) */
const colorOf = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

export function UserAvatar({ user, className }: { user: UserDto; className?: string }) {
  return (
    <Avatar className={cn('size-7 text-xs', className)} title={user.name}>
      <AvatarFallback className={cn('font-medium', colorOf(user.id))}>
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}

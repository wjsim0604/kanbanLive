import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Columns3, LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/user-avatar';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export function AppHeader({ children }: { children?: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logout = async () => {
    await api.logout().catch(() => undefined);
    clear();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <Link to="/boards" className="flex items-center gap-2 font-semibold">
        <Columns3 className="size-5" aria-hidden />
        <span className="hidden sm:inline">Kanban Live</span>
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="계정 메뉴">
              <UserAvatar user={user} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()}>
              <LogOut /> 로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}

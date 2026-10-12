import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { canManage, type BoardSnapshotDto, type PresenceUser, type Role } from '@kanban/shared';
import { UserAvatar } from '@/components/user-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, errorMessage } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/constants';
import { queryKeys } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth';
import { updateBoardCache } from './board-cache';

type Assignable = Exclude<Role, 'OWNER'>;

export function BoardTitle({ snapshot }: { snapshot: BoardSnapshotDto }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(snapshot.board.title);
  const [editing, setEditing] = useState(false);
  const manage = canManage(snapshot.role);
  const rename = useMutation({
    mutationFn: (t: string) => api.updateBoard(snapshot.board.id, t),
    onSuccess: (b) => {
      updateBoardCache(qc, snapshot.board.id, (s) => ({
        ...s,
        board: { ...s.board, title: b.title },
      }));
      void qc.invalidateQueries({ queryKey: queryKeys.boards });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!editing) {
    return (
      <h1
        className="truncate text-lg font-semibold"
        onDoubleClick={() => manage && (setTitle(snapshot.board.title), setEditing(true))}
        title={manage ? '더블클릭하여 이름 변경' : undefined}
      >
        {snapshot.board.title}
      </h1>
    );
  }
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setEditing(false);
    const t = title.trim();
    if (t && t !== snapshot.board.title) rename.mutate(t);
  };
  return (
    <form onSubmit={submit}>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => submit()}
        className="h-8 w-64"
        aria-label="보드 이름"
      />
    </form>
  );
}

/** 현재 보드를 보고 있는 사용자 아바타 */
export function PresenceAvatars({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) return null;
  return (
    <div
      className="flex items-center"
      data-testid="presence"
      aria-label={`접속 중 ${users.length}명`}
    >
      <span className="mr-2 hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
        <span className="size-2 rounded-full bg-emerald-500" aria-hidden /> 접속 중
      </span>
      <div className="flex -space-x-2">
        {users.slice(0, 5).map((u) => (
          <Tooltip key={u.id}>
            <TooltipTrigger asChild>
              <span data-testid="presence-user" data-user-id={u.id}>
                <UserAvatar user={u} className="ring-2 ring-background" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {u.name}
              {u.connections > 1 && ` (${u.connections}개 탭)`}
            </TooltipContent>
          </Tooltip>
        ))}
        {users.length > 5 && (
          <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs ring-2 ring-background">
            +{users.length - 5}
          </span>
        )}
      </div>
    </div>
  );
}

export function MembersDialog({ snapshot }: { snapshot: BoardSnapshotDto }) {
  const boardId = snapshot.board.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const manage = canManage(snapshot.role);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Assignable>('EDITOR');

  const refresh = () => void qc.invalidateQueries({ queryKey: queryKeys.board(boardId) });
  const onError = (e: unknown) => toast.error(errorMessage(e));

  const invite = useMutation({
    mutationFn: () => api.addMember(boardId, email.trim(), role),
    onSuccess: (member) => {
      updateBoardCache(qc, boardId, (s) =>
        s.members.some((m) => m.user.id === member.user.id)
          ? s
          : { ...s, members: [...s.members, member] },
      );
      toast.success(`${member.user.name}님을 초대했습니다.`);
      setEmail('');
    },
    onError,
  });
  const changeRole = useMutation({
    mutationFn: (v: { userId: string; role: Assignable }) =>
      api.updateMember(boardId, v.userId, v.role),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(boardId, userId),
    onSuccess: (_r, userId) => {
      if (userId === me?.id) {
        void qc.invalidateQueries({ queryKey: queryKeys.boards });
        navigate('/boards');
      } else refresh();
    },
    onError,
  });
  const deleteBoard = useMutation({
    mutationFn: () => api.deleteBoard(boardId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.boards });
      navigate('/boards');
    },
    onError,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users /> 멤버 {snapshot.members.length}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>보드 멤버</DialogTitle>
          <DialogDescription>
            소유자는 멤버를 초대하고 역할을 바꿀 수 있습니다. 뷰어는 읽기만 가능합니다.
          </DialogDescription>
        </DialogHeader>
        {manage && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) invite.mutate();
            }}
          >
            <Input
              type="email"
              placeholder="초대할 이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="초대할 이메일"
            />
            <Select value={role} onValueChange={(v) => setRole(v as Assignable)}>
              <SelectTrigger className="w-28" aria-label="역할">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EDITOR">편집자</SelectItem>
                <SelectItem value="VIEWER">뷰어</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!email.trim() || invite.isPending}>
              <UserPlus /> 초대
            </Button>
          </form>
        )}
        <ul className="grid gap-2">
          {snapshot.members.map((mb) => (
            <li key={mb.user.id} className="flex items-center gap-3" data-testid="member">
              <UserAvatar user={mb.user} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {mb.user.name}{' '}
                  {mb.user.id === me?.id && <span className="text-muted-foreground">(나)</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{mb.user.email}</div>
              </div>
              {manage && mb.role !== 'OWNER' ? (
                <Select
                  value={mb.role}
                  onValueChange={(v) =>
                    changeRole.mutate({ userId: mb.user.id, role: v as Assignable })
                  }
                >
                  <SelectTrigger size="sm" className="w-24" aria-label={`${mb.user.name} 역할`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EDITOR">편집자</SelectItem>
                    <SelectItem value="VIEWER">뷰어</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant={mb.role === 'OWNER' ? 'default' : 'secondary'}>
                  {ROLE_LABEL[mb.role]}
                </Badge>
              )}
              {mb.role !== 'OWNER' && (manage || mb.user.id === me?.id) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={mb.user.id === me?.id ? '보드 나가기' : `${mb.user.name} 내보내기`}
                  onClick={() => remove.mutate(mb.user.id)}
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {manage && (
          <Button
            variant="outline"
            className="justify-self-start text-destructive"
            onClick={() =>
              window.confirm('보드를 삭제할까요? 모든 리스트와 카드가 삭제됩니다.') &&
              deleteBoard.mutate()
            }
          >
            <Trash2 /> 보드 삭제
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

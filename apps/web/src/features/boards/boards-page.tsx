import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { AppHeader } from '@/components/app-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/constants';
import { queryKeys } from '@/lib/query-client';

function CreateBoardDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (t: string) => api.createBoard(t),
    onSuccess: (board) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
      setOpen(false);
      setTitle('');
      navigate(`/boards/${board.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) create.mutate(title.trim());
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> 새 보드
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>새 보드 만들기</DialogTitle>
            <DialogDescription>
              기본 리스트(할 일 / 진행 중 / 완료)가 함께 만들어집니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="board-title">보드 이름</Label>
            <Input
              id="board-title"
              autoFocus
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              만들기
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BoardsPage() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.boards,
    queryFn: api.boards,
  });

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">내 보드</h1>
          <CreateBoardDialog />
        </div>
        {isPending && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        )}
        {isError && (
          <div className="rounded-lg border border-destructive/30 bg-background p-6 text-sm">
            <p className="text-destructive">{errorMessage(error)}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              다시 시도
            </Button>
          </div>
        )}
        {data && data.length === 0 && (
          <div className="rounded-lg border border-dashed bg-background p-10 text-center text-muted-foreground">
            아직 보드가 없습니다. 새 보드를 만들어 보세요.
          </div>
        )}
        {data && data.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((b) => (
              <li key={b.id}>
                <Link
                  to={`/boards/${b.id}`}
                  className="block rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Card className="h-full gap-2 transition-shadow hover:shadow-md">
                    <CardHeader>
                      <CardTitle className="truncate">{b.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Badge variant={b.role === 'OWNER' ? 'default' : 'secondary'}>
                          {ROLE_LABEL[b.role]}
                        </Badge>
                        <span className="text-xs">
                          {new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(
                            new Date(b.updatedAt),
                          )}
                        </span>
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

import { Columns3 } from 'lucide-react';
import { ApiStatus } from '@/components/api-status';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function App() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Columns3 className="size-5" aria-hidden />
            <CardTitle className="text-xl">Kanban Live</CardTitle>
          </div>
          <CardDescription>여러 사람이 동시에 편집하는 실시간 협업 칸반보드</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">서버 상태</span>
          <ApiStatus />
        </CardContent>
        <CardFooter className="gap-2">
          <Button className="flex-1" disabled>
            로그인
          </Button>
          <Button className="flex-1" variant="outline" disabled>
            회원가입
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

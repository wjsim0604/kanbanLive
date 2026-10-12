import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Columns3, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, errorMessage } from '@/lib/api';
import { DEMO_ACCOUNT } from '@/lib/constants';
import { useAuthStore } from '@/stores/auth';

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignup = mode === 'signup';

  const submit = async (credentials: { email: string; password: string }) => {
    setPending(true);
    setError(null);
    try {
      const session = isSignup
        ? await api.signup({ ...credentials, name })
        : await api.login(credentials);
      setSession(session);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/boards', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit({ email, password });
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <Columns3 className="size-5" aria-hidden />
            <span className="font-semibold">Kanban Live</span>
          </div>
          <CardTitle className="text-xl">{isSignup ? '회원가입' : '로그인'}</CardTitle>
          <CardDescription>
            {isSignup
              ? '계정을 만들고 팀과 실시간으로 협업하세요.'
              : '보드에 접속하려면 로그인하세요.'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="flex flex-col gap-4">
            {isSignup && (
              <div className="grid gap-2">
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  required
                  maxLength={50}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                required
                minLength={isSignup ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {isSignup && <p className="text-xs text-muted-foreground">8자 이상</p>}
            </div>
            {error && (
              <p role="alert" className="text-sm whitespace-pre-line text-destructive">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="mt-6 flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {isSignup ? '가입하기' : '로그인'}
            </Button>
            {!isSignup && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={pending}
                onClick={() => void submit(DEMO_ACCOUNT)}
              >
                데모 계정으로 둘러보기
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              {isSignup ? '이미 계정이 있나요? ' : '계정이 없나요? '}
              <Link
                className="text-foreground underline underline-offset-4"
                to={isSignup ? '/login' : '/signup'}
              >
                {isSignup ? '로그인' : '회원가입'}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}

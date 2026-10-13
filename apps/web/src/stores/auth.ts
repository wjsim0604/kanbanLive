import { create } from 'zustand';
import type { AuthResponse, UserDto } from '@kanban/shared';

type Status = 'unknown' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  /** access token은 XSS 대비로 메모리에만 둔다. 새로고침 시 refresh 쿠키로 복구한다. */
  accessToken: string | null;
  user: UserDto | null;
  setSession: (session: AuthResponse) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'unknown',
  accessToken: null,
  user: null,
  setSession: ({ accessToken, user }) => set({ status: 'authenticated', accessToken, user }),
  clear: () => set({ status: 'anonymous', accessToken: null, user: null }),
}));

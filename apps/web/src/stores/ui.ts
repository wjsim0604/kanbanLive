import { create } from 'zustand';

/** 서버 상태가 아닌 순수 UI 상태 (TanStack Query와 분리) */
interface UiState {
  openCardId: string | null;
  openCard: (id: string) => void;
  closeCard: () => void;
  /** 리스트 하단의 "카드 추가" 입력이 열려 있는 리스트 */
  composerListId: string | null;
  setComposerListId: (id: string | null) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  openCardId: null,
  openCard: (id) => set({ openCardId: id }),
  closeCard: () => set({ openCardId: null }),
  composerListId: null,
  setComposerListId: (id) => set({ composerListId: id }),
}));

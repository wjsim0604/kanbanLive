import bcrypt from 'bcryptjs';

// bcryptjs: 순수 JS 구현이라 alpine/arm 등 어떤 이미지에서도 네이티브 빌드 없이 동작한다.
const ROUNDS = 10;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

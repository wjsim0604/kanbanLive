import bcrypt from 'bcryptjs';

// bcryptjs: 순수 JS 구현이라 alpine/arm 등 어떤 이미지에서도 네이티브 빌드 없이 동작한다.
const ROUNDS = 10;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

/**
 * 존재하지 않는 계정으로 로그인할 때도 같은 비용의 bcrypt 비교를 수행하기 위한 더미 해시.
 * 비교를 건너뛰면 응답 시간 차이(약 100ms vs 5ms)로 가입 여부가 드러난다.
 */
let dummyHash: Promise<string> | undefined;
export const verifyAgainstDummy = async (plain: string): Promise<false> => {
  dummyHash ??= hashPassword('dummy-password-for-timing-equalization');
  await bcrypt.compare(plain, await dummyHash);
  return false;
};

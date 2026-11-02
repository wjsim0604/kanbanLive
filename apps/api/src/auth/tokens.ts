import { createHash, randomBytes } from 'node:crypto';

export const REFRESH_COOKIE = 'kl_refresh';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name: string;
  /** 만료 시각 (초, JWT 표준 클레임). 서명 시 자동으로 채워진다 */
  exp?: number;
}

export const generateRefreshToken = (): string => randomBytes(32).toString('base64url');

/** refresh token은 DB에 해시로만 저장한다 (DB 유출 시 재사용 방지). */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export interface AppConfig {
  port: number;
  webOrigin: string;
  isProduction: boolean;
  jwtAccessSecret: string;
  accessTokenTtlSec: number;
  refreshTokenTtlDays: number;
  redisUrl: string;
  /** 설정되면 api가 web 빌드 결과물을 같은 오리진에서 서빙한다 (배포용) */
  webDistDir: string | null;
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const isProduction = env.NODE_ENV === 'production';
  const jwtAccessSecret = env.JWT_ACCESS_SECRET ?? (isProduction ? '' : 'dev-access-secret');
  if (!jwtAccessSecret) {
    throw new Error('JWT_ACCESS_SECRET must be set in production');
  }
  return {
    port: Number(env.PORT ?? 3000),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
    isProduction,
    jwtAccessSecret,
    accessTokenTtlSec: Number(env.ACCESS_TOKEN_TTL_SEC ?? 15 * 60),
    refreshTokenTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 14),
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    webDistDir: env.WEB_DIST_DIR || null,
  };
};

export const APP_CONFIG = Symbol('APP_CONFIG');

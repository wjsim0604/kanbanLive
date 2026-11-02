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
  /** Swagger UI(/docs) 노출 여부. 운영 기본값은 비공개 */
  swaggerEnabled: boolean;
  /**
   * Express 'trust proxy'. 프록시(Fly, Nginx) 뒤에서 req.ip를 실제 클라이언트 IP로 쓰기 위해 필요하다.
   * 프록시 없이 신뢰하면 X-Forwarded-For 위조로 IP 기반 제한을 우회할 수 있으므로 운영에서만 기본 1(프록시 1단).
   */
  trustProxy: number | false;
  /** 인증 엔드포인트 요청 제한 (1분당) */
  authRateLimit: {
    /** 같은 IP + 같은 이메일 (비밀번호 무차별 대입 방지) */
    perAccount: number;
    /** 같은 IP 전체 (계정 대량 생성·이메일 바꿔 가며 시도 방지) */
    perIp: number;
  };
}

const bool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined || value === '' ? fallback : value === 'true' || value === '1';

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
    swaggerEnabled: bool(env.SWAGGER_ENABLED, !isProduction),
    trustProxy:
      env.TRUST_PROXY !== undefined && env.TRUST_PROXY !== ''
        ? Number(env.TRUST_PROXY) || false
        : isProduction
          ? 1
          : false,
    authRateLimit: {
      perAccount: Number(env.AUTH_RATE_LIMIT_PER_ACCOUNT ?? 10),
      perIp: Number(env.AUTH_RATE_LIMIT_PER_IP ?? 100),
    },
  };
};

export const APP_CONFIG = Symbol('APP_CONFIG');

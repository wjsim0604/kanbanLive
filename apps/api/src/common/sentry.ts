import * as Sentry from '@sentry/node';

let enabled = false;

/** SENTRY_DSN이 있을 때만 에러 추적을 켠다 (로컬/CI에서는 비활성). */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.FLY_IMAGE_REF ?? process.env.GIT_SHA,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    serverName: process.env.INSTANCE_ID,
  });
  enabled = true;
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (enabled) Sentry.captureException(err, context ? { extra: context } : undefined);
}

// e2e 테스트에서는 요청 로그를 끈다 (필요하면 LOG_LEVEL=debug pnpm test:e2e)
process.env.LOG_LEVEL ??= 'silent';

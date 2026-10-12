import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 테스트. 기본은 이미 실행 중인 서버(BASE_URL, 기본 http://localhost:5173)를 대상으로 한다.
 * E2E_START_SERVER=1 이면 api가 web 빌드 결과물까지 서빙하는 단일 서버를 직접 띄운다 (CI).
 */
const baseURL =
  process.env.BASE_URL ??
  (process.env.E2E_START_SERVER ? 'http://localhost:3000' : 'http://localhost:5173');

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    locale: 'ko-KR',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: process.env.E2E_START_SERVER
    ? {
        command: 'node ../apps/api/dist/main.js',
        url: 'http://localhost:3000/api/health',
        reuseExistingServer: false,
        timeout: 60_000,
        env: { WEB_DIST_DIR: '../apps/web/dist', PORT: '3000' },
      }
    : undefined,
});

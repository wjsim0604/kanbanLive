import type { Config } from 'jest';

// 실제 PostgreSQL(DATABASE_URL)이 필요한 통합 테스트
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  testTimeout: 30_000,
  setupFiles: ['<rootDir>/setup-env.ts'],
};

export default config;

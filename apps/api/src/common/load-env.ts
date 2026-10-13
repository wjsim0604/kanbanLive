import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** 개발 편의: apps/api/.env가 있으면 process.env로 읽는다 (이미 설정된 값은 덮어쓰지 않음). */
export function loadEnvFile(path = resolve(__dirname, '../../.env')): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

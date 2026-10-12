# Troubleshooting

문제 → 원인 → 해결 → 결과 형식으로 누적 기록합니다.

## 1. ts-jest 경고 TS151002 (Phase 1)

- **문제**: api 테스트 실행 시 `Using hybrid module kind (Node16/18/Next) is only supported in "isolatedModules: true"` 경고가 테스트 파일마다 출력됨.
- **원인**: api tsconfig를 `module: nodenext`로 설정. NestJS는 `emitDecoratorMetadata` 때문에 `isolatedModules`를 끌 수밖에 없는데, ts-jest는 이 조합을 지원하지 않는다.
- **해결**: api는 `module: commonjs` + `moduleResolution: bundler`로 변경. TS 6에서 `node10` 해석이 deprecated라 `bundler`를 사용한다.
- **결과**: 경고가 사라지고, 타입체크와 빌드 결과는 동일.

## 2. Vitest 설정 파일 ESM/CJS 경고 (Phase 1)

- **문제**: `packages/shared`에서 `ESM syntax in a file loaded as CommonJS (vitest.config.ts)` 경고.
- **원인**: shared는 api가 require할 수 있게 CommonJS 패키지(`type` 미지정)로 두었기 때문에 `.ts` 설정 파일이 CJS로 해석된다.
- **해결**: 설정 파일을 `vitest.config.mts`로 변경.
- **결과**: 경고 제거.

## 3. fractional indexing 순서가 DB 정렬과 다름 (Phase 2)

- **문제**: `generateKeyBetween`이 만든 키(`Zz` < `a0` < `a0V`)를 PostgreSQL에서 `ORDER BY position`으로 정렬하면, 대소문자가 섞인 키의 순서가 뒤바뀔 수 있다.
- **원인**: fractional indexing은 **코드 포인트(바이트) 순** 비교(`0-9 < A-Z < a-z`)를 전제로 한다. PostgreSQL 기본 collation(`en_US.UTF-8`)은 언어 규칙으로 정렬해 대소문자를 거의 같은 값으로 본다.
- **해결**:
  - 마이그레이션 SQL에서 `position` 컬럼을 `TEXT COLLATE "C"`로 만들었다. Prisma 스키마에는 collation 속성이 없지만 introspection에서 차이로 잡히지 않아 drift가 생기지 않는다.
  - 애플리케이션에서도 `sortByPosition()`(코드 포인트 비교)으로 한 번 더 정렬해, DB 설정과 무관하게 결과가 같게 했다.
- **결과**: `prisma migrate dev`를 다시 실행해도 drift 없음. 정렬 결과가 shared 단위 테스트의 불변식과 일치한다.

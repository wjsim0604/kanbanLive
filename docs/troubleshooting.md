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

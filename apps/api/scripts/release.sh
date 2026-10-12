#!/bin/sh
# 배포 직전 1회 실행 (Fly.io release_command): 마이그레이션 → (선택) 데모 데이터 시드
set -e
node node_modules/prisma/build/index.js migrate deploy
if [ "$SEED_DEMO" = "true" ]; then
  node dist/seed.js
fi

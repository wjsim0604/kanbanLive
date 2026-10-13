import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** 전역 JwtAuthGuard를 건너뛰는 엔드포인트 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

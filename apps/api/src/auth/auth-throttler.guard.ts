import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import type { Request, Response } from 'express';

export const ACCOUNT_THROTTLER = 'account';
export const IP_THROTTLER = 'ip';

/**
 * 인증 엔드포인트 요청 제한.
 * - account: 같은 IP에서 같은 이메일로 1분에 N회 → 한 계정에 대한 비밀번호 무차별 대입 방지
 * - ip:      같은 IP에서 1분에 M회 → 이메일을 바꿔 가며 시도하거나 계정을 대량 생성하는 것 방지
 *
 * req.ip는 'trust proxy' 설정에 따라 프록시 뒤의 실제 클라이언트 IP가 된다 (setupApp).
 * 카운터는 인스턴스 메모리에 있으므로 N대 운영 시 실효 한도는 최대 N배다 (docs/decisions/009).
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected override generateKey(context: ExecutionContext, suffix: string, name: string): string {
    if (name !== ACCOUNT_THROTTLER) return super.generateKey(context, suffix, name);
    const body = context.switchToHttp().getRequest<Request>().body as
      { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    return super.generateKey(context, `${suffix}:${email}`, name);
  }

  /** 이름 붙은 제한은 `Retry-After-account`처럼 비표준 헤더만 붙으므로 표준 Retry-After(초)도 함께 보낸다. */
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Retry-After', String(detail.timeToBlockExpire));
    return super.throwThrottlingException(context, detail);
  }
}

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

/** 클라이언트가 분기할 수 있도록 에러 응답에 code를 싣는다. */
export const ErrorCode = {
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  NOT_A_MEMBER: 'NOT_A_MEMBER',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const notFound = (what: string) =>
  new NotFoundException({ message: `${what} not found`, code: ErrorCode.NOT_FOUND });

export const forbidden = (message: string, code: ErrorCode) =>
  new ForbiddenException({ message, code });

export const conflict = (message: string, code: ErrorCode, extra?: Record<string, unknown>) =>
  new ConflictException({ message, code, ...extra });

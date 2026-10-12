import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '@kanban/shared';

interface ExceptionResponseObject {
  message?: string | string[];
  error?: string;
  code?: string;
  [key: string]: unknown;
}

/**
 * 모든 에러를 ApiErrorBody 형식으로 통일한다.
 * { statusCode, error, message, details?, code?, path, timestamp, ...extra }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const { status, body } = this.toBody(exception);
    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(status).json({
      ...body,
      path: req.url,
      timestamp: new Date().toISOString(),
    } satisfies ApiErrorBody);
  }

  private toBody(exception: unknown): {
    status: number;
    body: Omit<ApiErrorBody, 'path' | 'timestamp'>;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const obj: ExceptionResponseObject =
        typeof raw === 'string' ? { message: raw } : (raw as ExceptionResponseObject);
      const { message, error, code, statusCode: _s, ...extra } = obj;
      const details = Array.isArray(message) ? message : undefined;
      return {
        status,
        body: {
          ...extra,
          statusCode: status,
          error: error ?? HttpStatus[status] ?? 'Error',
          message: details
            ? 'Validation failed'
            : ((message as string | undefined) ?? exception.message),
          ...(details && { details }),
          ...(code && { code }),
        },
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') {
      return {
        status: 404,
        body: {
          statusCode: 404,
          error: 'Not Found',
          message: 'Resource not found',
          code: 'NOT_FOUND',
        },
      };
    }
    return {
      status: 500,
      body: { statusCode: 500, error: 'Internal Server Error', message: 'Internal server error' },
    };
  }
}

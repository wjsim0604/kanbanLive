import { BadRequestException } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';

/** 소켓 메시지도 REST와 같은 DTO 규칙(whitelist, forbidNonWhitelisted)으로 검증한다. */
export async function validateDto<T extends object>(
  cls: ClassConstructor<T>,
  payload: unknown,
): Promise<T> {
  if (typeof payload !== 'object' || payload === null)
    throw new BadRequestException('Invalid payload');
  const instance = plainToInstance(cls, payload);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    const details = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new BadRequestException(details);
  }
  return instance;
}

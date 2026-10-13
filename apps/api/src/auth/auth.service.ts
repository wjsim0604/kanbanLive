import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type { AuthResponse, UserDto } from '@kanban/shared';
import { APP_CONFIG, type AppConfig } from '../config';
import { conflict, ErrorCode } from '../common/errors';
import { toUserDto } from '../common/mappers';
import { userSelect } from '../common/prisma-select';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto, SignupDto } from './dto';
import { hashPassword, verifyPassword } from './password';
import { type AccessTokenPayload, generateRefreshToken, hashToken } from './tokens';

export interface IssuedTokens extends AuthResponse {
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async signup(dto: SignupDto): Promise<IssuedTokens> {
    try {
      const user = await this.prisma.user.create({
        data: { email: dto.email, name: dto.name, passwordHash: await hashPassword(dto.password) },
        select: userSelect,
      });
      return this.issue(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw conflict('Email already registered', ErrorCode.ALREADY_EXISTS);
      }
      throw e;
    }
  }

  async login(dto: LoginDto): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // 사용자 존재 여부를 노출하지 않도록 동일한 에러를 사용한다.
    if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        code: ErrorCode.INVALID_CREDENTIALS,
      });
    }
    return this.issue(user);
  }

  /**
   * refresh token 회전: 사용한 토큰은 폐기하고 새 토큰을 발급한다.
   * 이미 폐기된 토큰이 다시 쓰이면 탈취로 보고 해당 사용자의 모든 refresh token을 폐기한다.
   */
  async refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { select: userSelect } },
    });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');
    if (stored.revokedAt) {
      await this.revokeAll(stored.userId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');

    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // 동시에 같은 토큰으로 두 번 갱신하면 한쪽만 성공한다.
    if (count === 0) throw new UnauthorizedException('Refresh token already used');
    return this.issue(stored.user);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: userSelect });
    if (!user) throw new UnauthorizedException();
    return toUserDto(user);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token, { secret: this.config.jwtAccessSecret });
  }

  private async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issue(user: UserDto): Promise<IssuedTokens> {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, name: user.name };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.jwtAccessSecret,
      expiresIn: this.config.accessTokenTtlSec,
    });
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt },
    });
    return { accessToken, user: toUserDto(user), refreshToken, refreshExpiresAt };
  }
}

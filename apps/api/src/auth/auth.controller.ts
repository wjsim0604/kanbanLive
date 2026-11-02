import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthResponse, UserDto } from '@kanban/shared';
import { APP_CONFIG, type AppConfig } from '../config';
import { CurrentUser, type AuthUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { API_PREFIX } from '../common/setup-app';
import { SkipThrottle } from '@nestjs/throttler';
import { ACCOUNT_THROTTLER, AuthThrottlerGuard } from './auth-throttler.guard';
import { AuthService, type IssuedTokens } from './auth.service';
import { LoginDto, SignupDto } from './dto';
import { REFRESH_COOKIE } from './tokens';

/**
 * access token은 응답 본문으로 내려 메모리에만 보관하고,
 * refresh token은 httpOnly 쿠키(경로 /api/auth)로만 주고받아 XSS로 탈취되지 않게 한다.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('signup')
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.signup(dto));
  }

  @Public()
  @UseGuards(AuthThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.login(dto));
  }

  @Public()
  @ApiCookieAuth()
  @UseGuards(AuthThrottlerGuard)
  // 이메일이 없는 요청이라 계정 단위 제한은 IP 단위가 되어 버린다 → IP 제한만 적용
  @SkipThrottle({ [ACCOUNT_THROTTLER]: true })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    try {
      return this.respond(res, await this.auth.refresh(this.readCookie(req)));
    } catch (e) {
      this.clearCookie(res);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.readCookie(req));
    this.clearCookie(res);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.auth.me(user.id);
  }

  private readCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  private respond(res: Response, tokens: IssuedTokens): AuthResponse {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path: `/${API_PREFIX}/auth`,
      expires: tokens.refreshExpiresAt,
    });
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  private clearCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: `/${API_PREFIX}/auth` });
  }
}

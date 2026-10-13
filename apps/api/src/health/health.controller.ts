import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthResponse } from '@kanban/shared';
import { Public } from '../common/public.decorator';
import { HealthService } from './health.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // DB가 down이면 503을 돌려 로드밸런서/오케스트레이터가 인스턴스를 제외할 수 있게 한다.
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const result = await this.healthService.check();
    if (result.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}

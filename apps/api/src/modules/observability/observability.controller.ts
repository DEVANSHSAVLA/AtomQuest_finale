import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse as SwaggerResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { ObservabilityService } from './observability.service';

@ApiTags('Observability')
@Controller()
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Get('health')
  @ApiOperation({ summary: 'Basic endpoint health check' })
  @SwaggerResponse({ status: 200, description: 'Service is online' })
  async getHealth() {
    return { success: true, status: 'OK' };
  }

  @Get('health/live')
  @ApiOperation({ summary: 'Liveness check for container orchestration' })
  async getLiveness() {
    return { success: true, status: 'ALIVE' };
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe checking Neon DB and Upstash Redis connections' })
  async getReadiness(@Res() res: Response) {
    const dbOk = await this.observabilityService.runDatabaseCheck();
    const redisOk = await this.observabilityService.runRedisCheck();

    const isReady = dbOk && redisOk;

    if (!isReady) {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        success: false,
        status: 'UNREADY',
        checks: {
          database: dbOk ? 'UP' : 'DOWN',
          redis: redisOk ? 'UP' : 'DOWN',
        },
      });
    }

    return res.status(HttpStatus.OK).json({
      success: true,
      status: 'READY',
      checks: {
        database: 'UP',
        redis: 'UP',
      },
    });
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  async getMetrics(@Res() res: Response) {
    const metrics = await this.observabilityService.getMetrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    return res.status(HttpStatus.OK).send(metrics);
  }
}

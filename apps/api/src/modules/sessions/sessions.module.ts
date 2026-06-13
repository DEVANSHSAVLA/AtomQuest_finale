import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { AuthModule } from '../auth/auth.module';
import { AIService } from './ai.service';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [AuthModule],
  controllers: [SessionsController],
  providers: [SessionsService, AIService, IntegrationsService],
  exports: [SessionsService, AIService, IntegrationsService],
})
export class SessionsModule {}

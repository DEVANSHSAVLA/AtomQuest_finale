import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ChatModule } from './modules/chat/chat.module';
import { FilesModule } from './modules/files/files.module';
import { RecordingsModule } from './modules/recordings/recordings.module';
import { SignalingModule } from './modules/signaling/signaling.module';
import { ObservabilityModule } from './modules/observability/observability.module';

@Module({
  imports: [
    // Global Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    
    // Core Database Wrapper
    PrismaModule,
    
    // Feature Modules
    AuthModule,
    SessionsModule,
    ChatModule,
    FilesModule,
    RecordingsModule,
    SignalingModule,
    ObservabilityModule,
  ],
})
export class AppModule {}

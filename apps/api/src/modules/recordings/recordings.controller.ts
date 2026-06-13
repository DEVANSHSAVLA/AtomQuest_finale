import { Controller, Post, Get, Body, Param, UseGuards, UseInterceptors, UploadedFile, Query, Res, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse as SwaggerResponse } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { RecordingsService } from './recordings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Recordings')
@Controller('recordings')
export class RecordingsController {
  constructor(private readonly recordingsService: RecordingsService) {}

  @Post('start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Initialize recording session' })
  async start(@Body('sessionId') sessionId: string) {
    if (!sessionId) {
      throw new BadRequestException({
        success: false,
        error: { code: 'MISSING_SESSION_ID', message: 'sessionId is required' },
      });
    }
    return this.recordingsService.createRecording(sessionId);
  }

  @Post('stop')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'AGENT')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Finalize recording session details' })
  async stop(
    @Body('recordingId') recordingId: string,
    @Body('storageKey') storageKey: string,
    @Body('size') size: number,
    @Body('duration') duration: number,
  ) {
    if (!recordingId || !storageKey || size === undefined || duration === undefined) {
      throw new BadRequestException({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'recordingId, storageKey, size, and duration are required' },
      });
    }
    return this.recordingsService.updateRecording(recordingId, storageKey, size, duration);
  }

  @Post('upload-local')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload local mp4 file binary (Development fallback)' })
  async uploadLocal(
    @Query('recordingId') recordingId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!recordingId || !file) {
      throw new BadRequestException({
        success: false,
        error: { code: 'UPLOAD_FAILED', message: 'recordingId and file binary are required' },
      });
    }
    await this.recordingsService.saveLocalRecording(recordingId, file.buffer);
    return { success: true, data: { recordingId } };
  }

  @Get('download-local/:recordingId')
  @ApiOperation({ summary: 'Serves locally stored recording MP4 files statically' })
  async downloadLocal(@Param('recordingId') recordingId: string, @Res() res: Response) {
    const file = await this.recordingsService.getLocalRecordingPath(recordingId);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return res.sendFile(file.path);
  }
}

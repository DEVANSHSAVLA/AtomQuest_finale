import { Controller, Post, Get, Body, Param, UseGuards, UseInterceptors, UploadedFile, Query, Res, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse as SwaggerResponse } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserDecorator } from '../../common/decorators/user.decorator';
import { JwtPayload } from '@supportstream/shared-types';

@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('presign')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Request a presigned upload URL for Cloudflare R2 (or fallback to local)' })
  async presign(
    @Body('sessionId') sessionId: string,
    @Body('filename') filename: string,
    @Body('size') size: number,
    @Body('mimeType') mimeType: string,
    @UserDecorator() user: JwtPayload,
  ) {
    if (!sessionId || !filename || !size || !mimeType) {
      throw new BadRequestException({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'sessionId, filename, size, and mimeType are required' },
      });
    }

    // Capture user details for uploader logging
    const uploaderName = user.role === 'CUSTOMER' ? 'Customer' : `Agent ${user.sub.substring(0, 4)}`;
    return this.filesService.getPresignedUrl(sessionId, user.sub, uploaderName, filename, size, mimeType);
  }

  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Confirm file has uploaded successfully to trigger virus scan & indexing' })
  async confirm(@Body('fileId') fileId: string) {
    if (!fileId) {
      throw new BadRequestException({
        success: false,
        error: { code: 'MISSING_FILE_ID', message: 'fileId is required' },
      });
    }
    return this.filesService.confirmUpload(fileId);
  }

  @Post('upload-local')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload file directly to local server disk (Development fallback endpoint)' })
  async uploadLocal(
    @Query('fileId') fileId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!fileId || !file) {
      throw new BadRequestException({
        success: false,
        error: { code: 'UPLOAD_FAILED', message: 'fileId and file binary are required' },
      });
    }
    await this.filesService.saveLocalFile(fileId, file.buffer);
    return { success: true, data: { fileId } };
  }

  @Get('download-local/:fileId')
  @ApiOperation({ summary: 'Download locally stored file (Development fallback serving)' })
  async downloadLocal(@Param('fileId') fileId: string, @Res() res: Response) {
    const file = await this.filesService.getLocalFilePath(fileId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return res.sendFile(file.path);
  }
}

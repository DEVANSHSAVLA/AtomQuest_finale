import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiResponse } from '@supportstream/shared-types';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

@Injectable()
export class FilesService {
  private readonly allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.xlsx'];
  private readonly blockedExtensions = ['.exe', '.bat', '.cmd', '.sh', '.msi'];
  private readonly maxSizeBytes = 25 * 1024 * 1024; // 25 MB

  constructor(private readonly prisma: PrismaService) {}

  async getPresignedUrl(
    sessionId: string,
    uploaderId: string,
    uploaderName: string,
    originalName: string,
    sizeBytes: number,
    mimeType: string,
  ): Promise<ApiResponse<any>> {
    // 1. File Size Validation (Max 25 MB)
    if (sizeBytes > this.maxSizeBytes) {
      throw new BadRequestException({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'File size exceeds maximum allowed limit of 25 MB' },
      });
    }

    // 2. Extension Verification
    const ext = path.extname(originalName).toLowerCase();
    if (this.blockedExtensions.includes(ext) || !this.allowedExtensions.includes(ext)) {
      throw new BadRequestException({
        success: false,
        error: { code: 'INVALID_FILE_TYPE', message: `File extension '${ext}' is not permitted` },
      });
    }

    const storageKey = `files/${sessionId}/${crypto.randomUUID()}${ext}`;

    // Create database entry in pending state
    const fileRecord = await this.prisma.file.create({
      data: {
        sessionId,
        uploaderId,
        uploaderName,
        originalName,
        storageKey,
        mimeType,
        sizeBytes,
        isScanned: false,
        isSafe: true, // Will be scanned during confirmation
      },
    });

    const useR2 = process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY;
    if (useR2) {
      try {
        // Dynamic load of AWS S3 SDK to prevent runtime crashes if packages are not fully compiled
        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

        const s3 = new S3Client({
          region: 'auto',
          endpoint: process.env.R2_ENDPOINT,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
          },
        });

        const command = new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: storageKey,
          ContentType: mimeType,
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

        return {
          success: true,
          data: {
            fileId: fileRecord.id,
            uploadUrl,
            storageKey,
            method: 'PUT',
            isLocal: false,
          },
        };
      } catch (err: any) {
        console.error('R2 Presigning failed, falling back to local storage:', err);
      }
    }

    // Local Storage Fallback Endpoint
    const localUploadUrl = `/api/v1/files/upload-local?fileId=${fileRecord.id}`;

    return {
      success: true,
      data: {
        fileId: fileRecord.id,
        uploadUrl: localUploadUrl,
        storageKey,
        method: 'POST',
        isLocal: true,
      },
    };
  }

  async confirmUpload(fileId: string): Promise<ApiResponse<any>> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.deletedAt) {
      throw new NotFoundException({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: 'File reference not found' },
      });
    }

    // Mock Virus Scan (ClamAV logic hook placeholder)
    // Marks file as scanned & safe
    const updatedFile = await this.prisma.file.update({
      where: { id: fileId },
      data: { isScanned: true, isSafe: true },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        sessionId: file.sessionId,
        action: 'FILE_UPLOADED',
        payload: JSON.stringify({ fileId: file.id, originalName: file.originalName }),
      },
    });

    const publicUrl = process.env.R2_PUBLIC_URL 
      ? `${process.env.R2_PUBLIC_URL}/${file.storageKey}`
      : `/api/v1/files/download-local/${file.id}`;

    return {
      success: true,
      data: {
        file: updatedFile,
        downloadUrl: publicUrl,
      },
    };
  }

  async saveLocalFile(fileId: string, buffer: Buffer): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file) {
      throw new NotFoundException('File metadata not found');
    }

    const uploadDir = path.join(process.cwd(), 'uploads', file.sessionId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = path.basename(file.storageKey);
    const destination = path.join(uploadDir, filename);
    await fs.promises.writeFile(destination, buffer);
  }

  async getLocalFilePath(fileId: string): Promise<{ path: string; mimeType: string; filename: string }> {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.deletedAt) {
      throw new NotFoundException('File not found');
    }

    const uploadDir = path.join(process.cwd(), 'uploads', file.sessionId);
    const filename = path.basename(file.storageKey);
    const filePath = path.join(uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Physical file not found on local disk');
    }

    return {
      path: filePath,
      mimeType: file.mimeType,
      filename: file.originalName,
    };
  }
}

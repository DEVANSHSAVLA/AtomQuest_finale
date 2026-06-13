import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiResponse, RecordingStatus } from '@supportstream/shared-types';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class RecordingsService {
  constructor(private readonly prisma: PrismaService) {}

  async createRecording(sessionId: string): Promise<ApiResponse<any>> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.deletedAt) {
      throw new NotFoundException({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
      });
    }

    const recording = await this.prisma.recording.create({
      data: {
        sessionId,
        storageKey: '',
        playbackUrl: '',
        durationSeconds: 0,
        sizeBytes: 0,
        status: 'RECORDING',
        startedAt: new Date(),
      },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        sessionId,
        action: 'RECORDING_STARTED',
        payload: JSON.stringify({ recordingId: recording.id }),
      },
    });

    // Write session timeline event
    await this.prisma.timeline.create({
      data: {
        sessionId,
        event: 'Recording Started',
        participant: 'System',
      },
    });

    return {
      success: true,
      data: recording,
    };
  }

  async updateRecording(
    recordingId: string,
    storageKey: string,
    sizeBytes: number,
    durationSeconds: number,
    status: RecordingStatus = 'AVAILABLE',
  ): Promise<ApiResponse<any>> {
    const recording = await this.prisma.recording.findUnique({ where: { id: recordingId } });
    if (!recording || recording.deletedAt) {
      throw new NotFoundException({
        success: false,
        error: { code: 'RECORDING_NOT_FOUND', message: 'Recording not found' },
      });
    }

    const endedAt = new Date();
    const playbackUrl = process.env.R2_PUBLIC_URL 
      ? `${process.env.R2_PUBLIC_URL}/${storageKey}`
      : `/api/v1/recordings/download-local/${recordingId}`;

    const updated = await this.prisma.recording.update({
      where: { id: recordingId },
      data: {
        storageKey,
        playbackUrl,
        sizeBytes,
        durationSeconds,
        status,
        endedAt,
      },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        sessionId: recording.sessionId,
        action: 'RECORDING_STOPPED',
        payload: JSON.stringify({ recordingId, durationSeconds, sizeBytes }),
      },
    });

    // Write session timeline event
    await this.prisma.timeline.create({
      data: {
        sessionId: recording.sessionId,
        event: 'Recording Stopped',
        participant: 'System',
      },
    });

    return {
      success: true,
      data: updated,
    };
  }

  async saveLocalRecording(recordingId: string, buffer: Buffer): Promise<void> {
    const recording = await this.prisma.recording.findUnique({ where: { id: recordingId } });
    if (!recording) {
      throw new NotFoundException('Recording record not found');
    }

    const recordingsDir = path.join(process.cwd(), 'recordings');
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    const destination = path.join(recordingsDir, `${recordingId}.mp4`);
    await fs.promises.writeFile(destination, buffer);
  }

  async getLocalRecordingPath(recordingId: string): Promise<{ path: string; filename: string }> {
    const recording = await this.prisma.recording.findUnique({ where: { id: recordingId } });
    if (!recording || recording.deletedAt) {
      throw new NotFoundException('Recording not found');
    }

    const filePath = path.join(process.cwd(), 'recordings', `${recordingId}.mp4`);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Physical recording file not found on disk');
    }

    return {
      path: filePath,
      filename: `recording-${recordingId}.mp4`,
    };
  }
}

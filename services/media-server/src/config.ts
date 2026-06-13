import { RtpCodecCapability } from 'mediasoup/node/lib/types';
import * as os from 'os';

export const config = {
  // Number of worker processes to spawn (1 per CPU core is optimal)
  numWorkers: os.cpus().length,

  // Mediasoup Worker settings
  workerSettings: {
    logLevel: 'warn' as const,
    logTags: ['rtp', 'srtp', 'rtcp'] as any,
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  },

  // Router codec capabilities
  routerMediaCodecs: [
    {
      kind: 'audio' as const,
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: 'video' as const,
      mimeType: 'video/VP8',
      clockRate: 90000,
      parameters: {},
    },
    {
      kind: 'video' as const,
      mimeType: 'video/H264',
      clockRate: 90000,
      parameters: {
        'packetization-mode': 1,
        'profile-level-id': '42e01f', // Constrained Baseline Profile
        'level-asymmetry-allowed': 1,
      },
    },
  ] as RtpCodecCapability[],

  // WebRTC Transport settings
  webRtcTransportOptions: {
    listenIps: [
      {
        ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
      },
    ],
    enableTcp: true,
    enableUdp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000, // 1 Mbps
  },
};
export type Config = typeof config;

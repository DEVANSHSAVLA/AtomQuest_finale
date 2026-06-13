import * as mediasoupClient from 'mediasoup-client';
import { Device } from 'mediasoup-client';
import { Socket } from 'socket.io-client';

export class WebRTCClient {
  private device!: Device;
  private sendTransport: any = null;
  private recvTransport: any = null;
  
  private localVideoProducer: any = null;
  private localAudioProducer: any = null;
  private localScreenProducer: any = null;
  private remoteProducersMap = new Map<string, any>(); // producerId -> Consumer

  private localStream: MediaStream | null = null;

  // P2P Fallback States
  private useP2P: boolean = false;
  private peerConnection: RTCPeerConnection | null = null;
  private localScreenSender: RTCRtpSender | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(
    private readonly socket: Socket,
    private readonly sessionId: string,
    private readonly onRemoteStream: (track: MediaStreamTrack, kind: 'video' | 'audio', isScreenShare: boolean) => void,
    private readonly onTrackClosed: (producerId: string, isScreenShare: boolean) => void,
    private readonly onQualityUpdate: (quality: 'Excellent' | 'Good' | 'Poor', stats: any) => void,
  ) {}

  async initialize(): Promise<void> {
    try {
      // 1. Fetch router capabilities from NestJS API (proxied to media-server)
      const capabilities = await this.emitSignal('getRouterRtpCapabilities', {});
      
      // 2. Load Mediasoup client Device
      this.device = new mediasoupClient.Device();
      await this.device.load({ routerRtpCapabilities: capabilities });
      
      this.useP2P = false;
      console.log('Mediasoup client Device loaded successfully.');
    } catch (err) {
      console.warn('Mediasoup SFU initialization failed, falling back to P2P Mode:', err);
      this.useP2P = true;
      this.setupP2PSignaling();
    }
  }

  private setupP2PSignaling() {
    this.socket.off('p2p-signal');
    this.socket.on('p2p-signal', async (payload: { senderSocketId: string; action: string; data: any }) => {
      console.log(`Received P2P signal: ${payload.action}`, payload.data);
      if (payload.action === 'p2p-ready') {
        const isOfferer = this.socket.id ? (this.socket.id < payload.senderSocketId) : true;
        if (isOfferer) {
          console.log('P2P: We are the offerer, initiating RTCPeerConnection offer');
          const pc = this.getPeerConnection(true); // reset on new handshake
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await pc.setLocalDescription(offer);
          this.socket.emit('p2p-signal', {
            action: 'offer',
            data: offer
          });
        } else {
          console.log('P2P: We are the answerer, replying with p2p-ready-ack');
          this.socket.emit('p2p-signal', {
            action: 'p2p-ready-ack',
            data: {}
          });
        }
      } else if (payload.action === 'p2p-ready-ack') {
        const isOfferer = this.socket.id ? (this.socket.id < payload.senderSocketId) : true;
        if (isOfferer) {
          console.log('P2P: We are the offerer (received ack), initiating RTCPeerConnection offer');
          const pc = this.getPeerConnection(true); // reset on new handshake
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await pc.setLocalDescription(offer);
          this.socket.emit('p2p-signal', {
            action: 'offer',
            data: offer
          });
        }
      } else if (payload.action === 'offer') {
        await this.handleP2POffer(payload.senderSocketId, payload.data);
      } else if (payload.action === 'answer') {
        await this.handleP2PAnswer(payload.data);
      } else if (payload.action === 'ice-candidate') {
        await this.handleP2PIceCandidate(payload.data);
      }
    });
  }

  private getPeerConnection(reset: boolean = false): RTCPeerConnection {
    if (reset && this.peerConnection) {
      console.log('P2P: Resetting existing PeerConnection');
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
      this.pendingCandidates = [];
    }

    if (this.peerConnection) return this.peerConnection;

    const pc = new RTCPeerConnection({
      iceTransportPolicy: 'relay',
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:openrelay.metered.ca:80' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:3478?transport=udp',
            'turn:openrelay.metered.ca:3478?transport=tcp'
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('p2p-signal', {
          action: 'ice-candidate',
          data: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('P2P: Received remote track:', event.track.kind);
      this.onRemoteStream(event.track, event.track.kind as 'video' | 'audio', false);
    };

    if (this.localStream && this.localStream.getTracks().length > 0) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    } else {
      // Add transceivers to receive remote media even if local media is not available/blocked
      try {
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
      } catch (err) {
        console.warn('P2P: Failed to add receive-only transceivers:', err);
      }
    }

    this.peerConnection = pc;
    return pc;
  }

  private async handleP2POffer(senderSocketId: string, offer: RTCSessionDescriptionInit) {
    console.log('P2P: Handling incoming offer');
    const pc = this.getPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.socket.emit('p2p-signal', {
      action: 'answer',
      data: answer
    });
    await this.processPendingCandidates();
  }

  private async handleP2PAnswer(answer: RTCSessionDescriptionInit) {
    console.log('P2P: Handling incoming answer');
    const pc = this.getPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this.processPendingCandidates();
  }

  private async handleP2PIceCandidate(candidate: RTCIceCandidateInit) {
    console.log('P2P: Adding remote ICE candidate');
    const pc = this.getPeerConnection();
    if (pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('P2P: Failed to add ICE candidate:', err);
      }
    } else {
      console.log('P2P: Queuing ICE candidate because remoteDescription is not set yet');
      this.pendingCandidates.push(candidate);
    }
  }

  private async processPendingCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    console.log(`P2P: Processing ${this.pendingCandidates.length} queued ICE candidates`);
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      if (candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('P2P: Failed to add queued ICE candidate:', err);
        }
      }
    }
  }

  async setupLocalMedia(
    videoElement: HTMLVideoElement | null,
    audioDeviceId?: string,
    videoDeviceId?: string
  ): Promise<MediaStream> {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 }
    };
    if (videoDeviceId) {
      videoConstraints.deviceId = { exact: videoDeviceId };
    }

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true
    };
    if (audioDeviceId) {
      audioConstraints.deviceId = { exact: audioDeviceId };
    }

    let combinedStream: MediaStream | null = null;

    // Try to acquire both video and audio in a single prompt (avoids Safari double-prompt deadlock)
    try {
      combinedStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints
      });
      console.log('Successfully acquired both video and audio tracks simultaneously.');
    } catch (err) {
      console.warn('Failed to acquire both video and audio together, trying individual fallbacks...', err);
      
      // Fallback 1: Try video only
      let videoStream: MediaStream | null = null;
      try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
        console.log('Acquired video track only.');
      } catch (vErr) {
        console.warn('Failed to acquire video track:', vErr);
      }

      // Fallback 2: Try audio only
      let audioStream: MediaStream | null = null;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        console.log('Acquired audio track only.');
      } catch (aErr) {
        console.warn('Failed to acquire audio track:', aErr);
      }

      combinedStream = new MediaStream();
      if (videoStream) {
        videoStream.getVideoTracks().forEach(t => combinedStream?.addTrack(t));
      }
      if (audioStream) {
        audioStream.getAudioTracks().forEach(t => combinedStream?.addTrack(t));
      }
    }

    this.localStream = combinedStream || new MediaStream();

    if (videoElement && this.localStream.getVideoTracks().length > 0) {
      videoElement.srcObject = this.localStream;
      videoElement.play().catch(e => console.warn('Lobby video playback error:', e));
    }

    return this.localStream;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  async joinAndProduce(): Promise<void> {
    if (this.useP2P) {
      console.log('P2P: Resetting PeerConnection and emitting p2p-ready signal');
      this.getPeerConnection(true); // reset PC before emitting p2p-ready
      this.socket.emit('p2p-signal', { action: 'p2p-ready', data: {} });
      return;
    }

    if (!this.localStream) {
      this.localStream = new MediaStream();
    }

    // Clean up existing send transport and producers if reconnecting
    if (this.localVideoProducer) { try { this.localVideoProducer.close(); } catch (e) {} this.localVideoProducer = null; }
    if (this.localAudioProducer) { try { this.localAudioProducer.close(); } catch (e) {} this.localAudioProducer = null; }
    if (this.localScreenProducer) { try { this.localScreenProducer.close(); } catch (e) {} this.localScreenProducer = null; }
    if (this.sendTransport) { try { this.sendTransport.close(); } catch (e) {} this.sendTransport = null; }

    // Clean up recv transport and remote consumers to restart clean
    if (this.recvTransport) { try { this.recvTransport.close(); } catch (e) {} this.recvTransport = null; }
    this.remoteProducersMap.forEach(c => { try { c.close(); } catch (e) {} });
    this.remoteProducersMap.clear();

    // 1. Create Send Transport
    const transportInfo = await this.emitSignal('createWebRtcTransport', {});
    this.sendTransport = this.device.createSendTransport(transportInfo);

    this.sendTransport.on('connect', async (params: any, callback: any, errback: any) => {
      try {
        await this.emitSignal('connectWebRtcTransport', {
          transportId: this.sendTransport!.id,
          dtlsParameters: params.dtlsParameters,
        });
        callback();
      } catch (err: any) {
        errback(err);
      }
    });

    this.sendTransport.on('produce', async (params: any, callback: any, errback: any) => {
      try {
        const { id } = await this.emitSignal('produce', {
          transportId: this.sendTransport!.id,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
          isScreenShare: params.appData?.isScreenShare || false,
        });
        callback({ id });
      } catch (err: any) {
        errback(err);
      }
    });

    // 3. Produce Local Video & Audio Tracks
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      this.localVideoProducer = await this.sendTransport.produce({ track: videoTrack });
    }

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      this.localAudioProducer = await this.sendTransport.produce({ track: audioTrack });
    }

    // Start connection quality monitor loop
    this.startQualityMonitor();
  }

  async produceScreenShare(track: MediaStreamTrack): Promise<any> {
    if (this.useP2P) {
      console.log('P2P: Adding screen share track to RTCPeerConnection');
      const pc = this.getPeerConnection();
      const sender = pc.addTrack(track, new MediaStream([track]));
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('p2p-signal', {
        action: 'offer',
        data: offer
      });
      this.localScreenSender = sender;
      return sender;
    }

    if (!this.sendTransport) throw new Error('Send transport not initialized');
    this.localScreenProducer = await this.sendTransport.produce({
      track,
      appData: { isScreenShare: true }
    });
    return this.localScreenProducer;
  }

  async stopScreenShare(): Promise<void> {
    if (this.useP2P) {
      if (this.localScreenSender && this.peerConnection) {
        this.peerConnection.removeTrack(this.localScreenSender);
        this.localScreenSender = null;
        
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        this.socket.emit('p2p-signal', {
          action: 'offer',
          data: offer
        });
      }
      return;
    }

    if (this.localScreenProducer) {
      this.localScreenProducer.close();
      this.localScreenProducer = null;
    }
  }

  async setupReceiveAndConsume(remoteProducerId: string, isScreenShare: boolean = false): Promise<void> {
    if (this.useP2P) return;

    if (!this.recvTransport) {
      // Create Recv Transport if it doesn't exist yet
      const transportInfo = await this.emitSignal('createWebRtcTransport', {});
      this.recvTransport = this.device.createRecvTransport(transportInfo);

      this.recvTransport.on('connect', async (params: any, callback: any, errback: any) => {
        try {
          await this.emitSignal('connectWebRtcTransport', {
            transportId: this.recvTransport!.id,
            dtlsParameters: params.dtlsParameters,
          });
          callback();
        } catch (err: any) {
          errback(err);
        }
      });
    }

    // Consume track
    const consumerInfo = await this.emitSignal('consume', {
      transportId: this.recvTransport.id,
      producerId: remoteProducerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    const consumer = await this.recvTransport.consume(consumerInfo);
    this.remoteProducersMap.set(remoteProducerId, consumer);

    consumer.track.onended = () => {
      console.log(`Remote track ended: ${consumer.kind}`);
      this.onTrackClosed(remoteProducerId, isScreenShare);
    };

    // Request server to resume consumer (it was created paused)
    await this.emitSignal('resumeConsumer', { consumerId: consumer.id });

    // Emit track to video player handler callback
    this.onRemoteStream(consumer.track, consumer.kind as 'video' | 'audio', isScreenShare);
  }

  // Helper helper to wrap Socket.IO acknowledgments as promises
  private emitSignal(action: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.socket.emit('media-signal', { action, data }, (response: any) => {
        if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Media signaling error'));
        }
      });
    });
  }

  // Toggle local mute
  async setVideoEnabled(enabled: boolean, deviceId?: string): Promise<void> {
    if (!this.localStream) {
      this.localStream = new MediaStream();
    }

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (enabled) {
      if (!videoTrack) {
        try {
          const constraints: MediaStreamConstraints = {
            video: deviceId ? { deviceId: { exact: deviceId } } : { width: { ideal: 1280 }, height: { ideal: 720 } }
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const track = stream.getVideoTracks()[0];
          if (track) {
            this.localStream.addTrack(track);
            if (this.useP2P) {
              if (this.peerConnection) {
                const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                  await sender.replaceTrack(track);
                } else {
                  this.peerConnection.addTrack(track, this.localStream);
                  const offer = await this.peerConnection.createOffer();
                  await this.peerConnection.setLocalDescription(offer);
                  this.socket.emit('p2p-signal', { action: 'offer', data: offer });
                }
              }
            } else {
              if (this.sendTransport) {
                this.localVideoProducer = await this.sendTransport.produce({ track });
              }
            }
          }
        } catch (err) {
          console.error('Failed to enable video track:', err);
        }
      } else {
        videoTrack.enabled = true;
        if (!this.useP2P && this.localVideoProducer) {
          await this.localVideoProducer.resume();
        }
      }
    } else {
      if (videoTrack) {
        videoTrack.enabled = false;
        if (!this.useP2P && this.localVideoProducer) {
          await this.localVideoProducer.pause();
        }
      }
    }
  }

  async setAudioEnabled(enabled: boolean, deviceId?: string): Promise<void> {
    if (!this.localStream) {
      this.localStream = new MediaStream();
    }

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (enabled) {
      if (!audioTrack) {
        try {
          const constraints: MediaStreamConstraints = {
            audio: deviceId ? { deviceId: { exact: deviceId } } : { echoCancellation: true, noiseSuppression: true }
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const track = stream.getAudioTracks()[0];
          if (track) {
            this.localStream.addTrack(track);
            if (this.useP2P) {
              if (this.peerConnection) {
                const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'audio');
                if (sender) {
                  await sender.replaceTrack(track);
                } else {
                  this.peerConnection.addTrack(track, this.localStream);
                  const offer = await this.peerConnection.createOffer();
                  await this.peerConnection.setLocalDescription(offer);
                  this.socket.emit('p2p-signal', { action: 'offer', data: offer });
                }
              }
            } else {
              if (this.sendTransport) {
                this.localAudioProducer = await this.sendTransport.produce({ track });
              }
            }
          }
        } catch (err) {
          console.error('Failed to enable audio track:', err);
        }
      } else {
        audioTrack.enabled = true;
        if (!this.useP2P && this.localAudioProducer) {
          await this.localAudioProducer.resume();
        }
      }
    } else {
      if (audioTrack) {
        audioTrack.enabled = false;
        if (!this.useP2P && this.localAudioProducer) {
          await this.localAudioProducer.pause();
        }
      }
    }
  }

  toggleVideo(enabled: boolean) {
    this.setVideoEnabled(enabled).catch(err => console.error(err));
  }

  toggleAudio(enabled: boolean) {
    this.setAudioEnabled(enabled).catch(err => console.error(err));
  }

  async changeDevice(
    kind: 'video' | 'audio',
    deviceId: string,
    videoElement: HTMLVideoElement | null = null
  ): Promise<void> {
    if (!this.localStream) {
      this.localStream = new MediaStream();
    }

    const oldTracks = kind === 'video' ? this.localStream.getVideoTracks() : this.localStream.getAudioTracks();
    oldTracks.forEach(track => {
      track.stop();
      this.localStream?.removeTrack(track);
    });

    const constraints: MediaStreamConstraints = {};
    if (kind === 'video') {
      constraints.video = {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      };
    } else {
      constraints.audio = {
        deviceId: { exact: deviceId },
        echoCancellation: true,
        noiseSuppression: true
      };
    }

    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = kind === 'video' ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0];

    if (newTrack) {
      this.localStream.addTrack(newTrack);

      if (videoElement && kind === 'video') {
        videoElement.srcObject = this.localStream;
      }

      if (this.useP2P) {
        if (this.peerConnection) {
          const sender = this.peerConnection.getSenders().find(s => s.track?.kind === kind);
          if (sender) {
            await sender.replaceTrack(newTrack);
          } else {
            this.peerConnection.addTrack(newTrack, this.localStream);
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.socket.emit('p2p-signal', { action: 'offer', data: offer });
          }
        }
      } else {
        const producer = kind === 'video' ? this.localVideoProducer : this.localAudioProducer;
        if (producer) {
          await producer.replaceTrack({ track: newTrack });
        } else {
          if (this.sendTransport) {
            if (kind === 'video') {
              this.localVideoProducer = await this.sendTransport.produce({ track: newTrack });
            } else {
              this.localAudioProducer = await this.sendTransport.produce({ track: newTrack });
            }
          }
        }
      }
    }
  }

  // connection quality monitoring loop
  private startQualityMonitor() {
    const interval = setInterval(async () => {
      if (this.useP2P) {
        if (!this.peerConnection || this.peerConnection.connectionState === 'closed') {
          clearInterval(interval);
          return;
        }
        try {
          const stats = await this.peerConnection.getStats();
          let rtt = 0;
          let packetLoss = 0;
          stats.forEach((report: any) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              rtt = (report.currentRoundTripTime || 0) * 1000;
            }
          });
          let quality: 'Excellent' | 'Good' | 'Poor' = 'Excellent';
          if (rtt > 180) quality = 'Poor';
          else if (rtt > 80) quality = 'Good';

          this.onQualityUpdate(quality, { rtt, packetLoss, bitrate: 0 });
          this.socket.emit('connection-quality', { stats: { rtt, packetLoss, bitrate: 0 }, quality });
        } catch (e) {
          console.warn('Failed to calculate P2P WebRTC stats:', e);
        }
        return;
      }

      if (!this.sendTransport || this.sendTransport.closed) {
        clearInterval(interval);
        return;
      }

      try {
        // Evaluate RTCPeerConnection stats
        const stats = await this.sendTransport.getStats();
        let rtt = 0;
        let packetLoss = 0;
        let bitrate = 0;

        stats.forEach((report: any) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime * 1000; // ms
          }
          if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
            bitrate = report.bytesSent * 8; // simplified bps
          }
          if (report.type === 'inbound-rtp') {
            packetLoss = report.packetsLost / (report.packetsReceived + report.packetsLost || 1) * 100;
          }
        });

        // Cell-signal calculations matching V8 spec thresholds
        let quality: 'Excellent' | 'Good' | 'Poor' = 'Excellent';
        if (rtt > 180 || packetLoss > 5) {
          quality = 'Poor';
        } else if (rtt > 80 || packetLoss > 1) {
          quality = 'Good';
        }

        // Trigger callbacks
        this.onQualityUpdate(quality, { rtt, packetLoss, bitrate });
        
        // Emit quality stats to server so other room clients receive them
        this.socket.emit('connection-quality', { stats: { rtt, packetLoss, bitrate }, quality });
      } catch (err) {
        console.warn('Failed to calculate WebRTC statistics:', err);
      }
    }, 5000);
  }

  async close(): Promise<void> {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.localScreenSender = null;

    if (this.localVideoProducer) this.localVideoProducer.close();
    if (this.localAudioProducer) this.localAudioProducer.close();
    if (this.localScreenProducer) this.localScreenProducer.close();
    
    this.remoteProducersMap.forEach(c => c.close());
    this.remoteProducersMap.clear();

    if (this.sendTransport) this.sendTransport.close();
    if (this.recvTransport) this.recvTransport.close();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }

    if (this.useP2P) {
      this.socket.off('p2p-signal');
    } else {
      // Request media server cleanup
      this.socket.emit('media-signal', { action: 'cleanupSocket', data: {} });
    }
  }
}

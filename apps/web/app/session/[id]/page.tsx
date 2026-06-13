'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useAuthStore } from '../../../lib/store/useAuthStore';
import { socketManager } from '../../../lib/socket/socket-client';
import { WebRTCClient } from '../../../lib/webrtc/webrtc-client';
import { useEndSession, useSubmitFeedback, useSessionDetails } from '../../../lib/hooks/useSessions';
import {
  Mic, MicOff, Camera, CameraOff, PhoneOff, Send, Paperclip,
  Activity, Radio, Shield, Users, Clock, AlertCircle, FileText,
  Monitor, Star, Sparkles, BrainCircuit, Info, ChevronRight, X, Mail,
  Check, Copy, MessageSquare, Play, ChevronUp, Settings, Volume2, VolumeX
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface ChatMessage {
  id: string;
  senderName: string;
  senderRole: string;
  content: string;
  createdAt: string;
  isSystem?: boolean;
}

export default function ActiveSessionRoom() {
  const router = useRouter();
  const params = paramsHook();
  const searchParams = useSearchParams();
  const sessionId = params.id as string;
  
  const { token, user, isAuthenticated } = useAuthStore();
  const endSessionMutation = useEndSession();
  const submitFeedbackMutation = useSubmitFeedback();
  const { data: sessionDetails, refetch: refetchDetails } = useSessionDetails(sessionId);

  // WebRTC & Socket Refs
  const socketRef = useRef<any>(null);
  const rtcClientRef = useRef<WebRTCClient | null>(null);
  
  // Elements Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteScreenVideoRef = useRef<HTMLVideoElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pre-join Lobby States & Refs
  const [inLobby, setInLobby] = useState(true);
  const inLobbyRef = useRef(true);
  const lobbyVideoRef = useRef<HTMLVideoElement>(null);

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [permissionError, setPermissionError] = useState('');

  // Dropdown Popover States
  const [showMicMenu, setShowMicMenu] = useState(false);
  const [showCameraMenu, setShowCameraMenu] = useState(false);

  // Participant Media States mapping
  const [remoteMediaStates, setRemoteMediaStates] = useState<Record<string, { micEnabled: boolean; cameraEnabled: boolean }>>({});

  // Lobby audio analyser refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micAnimationRef = useRef<number | null>(null);

  const updateInLobby = (val: boolean) => {
    setInLobby(val);
    inLobbyRef.current = val;
  };

  const startLobbyAudioMeter = (stream: MediaStream) => {
    if (stream.getAudioTracks().length === 0) return;
    try {
      if (micAnimationRef.current) cancelAnimationFrame(micAnimationRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const percentage = Math.min(100, Math.floor((average / 128) * 100));
        setMicLevel(percentage);
        micAnimationRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
    } catch (err) {
      console.warn('Failed to start audio level meter:', err);
    }
  };

  const stopLobbyAudioMeter = () => {
    if (micAnimationRef.current) cancelAnimationFrame(micAnimationRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    setMicLevel(0);
  };

  const handleChangeVideoDevice = async (deviceId: string) => {
    setSelectedVideoId(deviceId);
    if (rtcClientRef.current) {
      await rtcClientRef.current.changeDevice(
        'video',
        deviceId,
        inLobby ? lobbyVideoRef.current : localVideoRef.current
      );
    }
  };

  const handleChangeAudioDevice = async (deviceId: string) => {
    setSelectedAudioId(deviceId);
    if (rtcClientRef.current) {
      await rtcClientRef.current.changeDevice('audio', deviceId);
    }
  };

  const handleJoinCall = async () => {
    updateInLobby(false);
    stopLobbyAudioMeter();
    
    if (socketRef.current) {
      const socket = socketRef.current;
      const rtcClient = rtcClientRef.current;
      if (!rtcClient) return;

      console.log('User clicked Join Call. Initiating joinRoom.');
      
      socket.emit('join-room', { 
        sessionId, 
        displayName: user?.displayName || searchParams.get('name') || 'Guest Customer', 
        role: user?.role || 'CUSTOMER' 
      }, async (ack: any) => {
        if (ack && ack.success) {
          await rtcClient.joinAndProduce();
          setJoined(true);
          
          if (ack.existingProducers) {
            for (const prod of ack.existingProducers) {
              await rtcClient.setupReceiveAndConsume(prod.producerId, prod.isScreenShare);
            }
          }

          const stream = rtcClient.getLocalStream();
          if (localVideoRef.current && stream) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.play().catch(e => console.log('Local video play failed:', e));
          }

          socket.emit('user-media-state', {
            micEnabled: micEnabled,
            cameraEnabled: cameraEnabled
          });
        }
      });
    }
  };

  // WebRTC Callback Refs & Streams
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const localVideoCallbackRef = (node: HTMLVideoElement | null) => {
    (localVideoRef as any).current = node;
    if (node) {
      const stream = rtcClientRef.current?.getLocalStream();
      if (stream) {
        node.srcObject = stream;
        node.play().catch(err => console.log('Mute autoplay check:', err));
      }
    }
  };

  const remoteVideoCallbackRef = (node: HTMLVideoElement | null) => {
    (remoteVideoRef as any).current = node;
    if (node && remoteStreamRef.current) {
      node.srcObject = remoteStreamRef.current;
      node.play().catch(err => {
        console.log('Remote autoplay check:', err);
        if (err.name === 'NotAllowedError') {
          setAutoplayBlocked(true);
        }
      });
    }
  };

  const remoteScreenVideoCallbackRef = (node: HTMLVideoElement | null) => {
    (remoteScreenVideoRef as any).current = node;
    if (node && remoteScreenTrack) {
      node.srcObject = new MediaStream([remoteScreenTrack]);
      node.play().catch(err => console.log('Remote screen autoplay check:', err));
    }
  };

  // Call States
  const [joined, setJoined] = useState(false);
  const [waitingRoom, setWaitingRoom] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  useEffect(() => {
    if (!autoplayBlocked) return;
    const handleInteraction = () => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.play()
          .then(() => setAutoplayBlocked(false))
          .catch(() => {});
      }
    };
    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [autoplayBlocked]);

  const handleUnblockAutoplay = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.play()
        .then(() => setAutoplayBlocked(false))
        .catch(err => console.error('Failed to unblock autoplay:', err));
    }
  };
  
  // Screen Share States
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteScreenTrack, setRemoteScreenTrack] = useState<MediaStreamTrack | null>(null);

  // Telemetry States
  const [quality, setQuality] = useState<'Excellent' | 'Good' | 'Poor'>('Excellent');
  const [qualityStats, setQualityStats] = useState<any>(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  // Chat States
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Recording States
  const [recording, setRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Post Call Summary Screen
  const [callEnded, setCallEnded] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);

  // Collapsible Panels
  const [sidebarOpen, setSidebarOpen] = useState<'crm' | 'kg' | null>(null);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [crmProfile, setCrmProfile] = useState<any>(null);
  const [crmCases, setCrmCases] = useState<any[]>([]);
  const [loadingCrm, setLoadingCrm] = useState(false);

  // Hangup / Resolution notes Form (Agent-only)
  const [hangupModalOpen, setHangupModalOpen] = useState(false);
  const [resolutionStatus, setResolutionStatus] = useState('RESOLVED');
  const [agentNotes, setAgentNotes] = useState('');
  
  // Support Copilot Generated States
  const [runningCopilot, setRunningCopilot] = useState(false);
  const [copilotSummary, setCopilotSummary] = useState('');
  const [copilotEmail, setCopilotEmail] = useState('');

  // Customer Feedback States (Customer-only on close)
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackResolved, setFeedbackResolved] = useState(true);
  const [feedbackComments, setFeedbackComments] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);

  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const API_URL = rawApiUrl.replace(/\/api\/v1\/?$/, '');

  function paramsHook() {
    return useParams();
  }

  // Load CRM Profile when customer email is discovered
  useEffect(() => {
    if (sessionDetails) {
      const customer = sessionDetails.participants?.find((p: any) => p.role === 'CUSTOMER');
      if (customer?.email) {
        setCustomerEmail(customer.email);
      }
    }
  }, [sessionDetails]);

  useEffect(() => {
    if (customerEmail && token && user?.role !== 'CUSTOMER') {
      setLoadingCrm(true);
      fetch(`${API_URL}/api/v1/sessions/customer-profile?email=${encodeURIComponent(customerEmail)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(resData => {
        if (resData.success) {
          setCrmProfile(resData.data.profile);
          setCrmCases(resData.data.cases);
        }
      })
      .catch(err => console.error('Failed to load customer history:', err))
      .finally(() => setLoadingCrm(false));
    }
  }, [customerEmail, token, user]);

  // Establish WebRTC room and signaling connection
  useEffect(() => {
    if (!isAuthenticated() || !token) {
      router.push('/');
      return;
    }

    const socket = socketManager.connect(token, sessionId);
    socketRef.current = socket;

    const rtcClient = new WebRTCClient(
      socket,
      sessionId,
      (track, kind, isScreenShare) => {
        console.log(`Received remote track: ${kind}, isScreenShare: ${isScreenShare}`);
        setWaitingRoom(false);
        
        if (isScreenShare) {
          if (kind === 'video') {
            setRemoteScreenTrack(track);
          }
        } else {
          if (!remoteStreamRef.current) {
            remoteStreamRef.current = new MediaStream();
          }
          // Remove duplicate track of same kind if exists
          remoteStreamRef.current.getTracks().forEach(t => {
            if (t.kind === track.kind) remoteStreamRef.current?.removeTrack(t);
          });
          remoteStreamRef.current.addTrack(track);
          
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStreamRef.current;
            remoteVideoRef.current.play().catch(err => console.log('Remote play check:', err));
          }
        }
      },
      (producerId, isScreenShare) => {
        console.log(`Track closed: ${producerId}, isScreenShare: ${isScreenShare}`);
        if (isScreenShare) {
          setRemoteScreenTrack(null);
        }
      },
      (newQuality, stats) => {
        setQuality(newQuality);
        setQualityStats(stats);
      }
    );
    rtcClientRef.current = rtcClient;

    socket.on('user-joined', (data: any) => {
      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        senderName: 'System',
        senderRole: 'System',
        content: `${data.displayName} (${data.role.toLowerCase()}) joined the room.`,
        createdAt: new Date().toISOString(),
        isSystem: true
      }]);
      setWaitingRoom(false);
      refetchDetails();

      // Send our own media state to the newly joined user
      socket.emit('user-media-state', { micEnabled, cameraEnabled });
    });

    socket.on('user-left', (data: any) => {
      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        senderName: 'System',
        senderRole: 'System',
        content: `${data.displayName} disconnected from the session.`,
        createdAt: new Date().toISOString(),
        isSystem: true
      }]);
      refetchDetails();
    });

    socket.on('chat-message', (msg: any) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('new-producer', async (data: any) => {
      console.log('Discovered new producer in room:', data);
      await rtcClient.setupReceiveAndConsume(data.producerId, data.isScreenShare);
    });

    socket.on('recording-started', (data: any) => {
      setRecording(true);
      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        senderName: 'System',
        senderRole: 'System',
        content: `🔴 Recording started by ${data.startedBy}`,
        createdAt: new Date().toISOString(),
        isSystem: true
      }]);
    });

    socket.on('recording-stopped', (data: any) => {
      setRecording(false);
      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        senderName: 'System',
        senderRole: 'System',
        content: `Recording stopped by ${data.stoppedBy}. Processing file...`,
        createdAt: new Date().toISOString(),
        isSystem: true
      }]);
    });

    socket.on('active-speaker', (data: any) => {
      if (data.volume > 0.05) {
        setActiveSpeakerId(data.participantId);
      } else {
        setActiveSpeakerId(null);
      }
    });

    socket.on('session-ended', (data: any) => {
      setCallEnded(true);
      setSummaryData({ endedReason: data.reason });
    });

    // Register user-media-state listener
    socket.on('user-media-state', (data: any) => {
      console.log('Received user-media-state:', data);
      const key = data.role === 'CUSTOMER' ? 'guest' : data.participantId;
      setRemoteMediaStates(prev => ({
        ...prev,
        [key]: { micEnabled: data.micEnabled, cameraEnabled: data.cameraEnabled }
      }));
    });

    let mediaInitialized = false;

    const joinRoom = async () => {
      if (inLobbyRef.current) {
        console.log('In lobby, skipping automatic join-room');
        return;
      }
      if (!mediaInitialized) {
        console.log('Media not initialized yet, delaying join-room');
        return;
      }
      console.log('Emitting join-room for session:', sessionId);
      socket.emit('join-room', { 
        sessionId, 
        displayName: user?.displayName || searchParams.get('name') || 'Guest Customer', 
        role: user?.role || 'CUSTOMER' 
      }, async (ack: any) => {
        if (ack && ack.success) {
          await rtcClient.joinAndProduce();
          setJoined(true);
          
          // Consume any existing producers in the room
          if (ack.existingProducers) {
            for (const prod of ack.existingProducers) {
              await rtcClient.setupReceiveAndConsume(prod.producerId, prod.isScreenShare);
            }
          }

          const stream = rtcClient.getLocalStream();
          if (localVideoRef.current && stream) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.play().catch(e => console.log('Local video play failed:', e));
          }

          socket.emit('user-media-state', {
            micEnabled: micEnabled,
            cameraEnabled: cameraEnabled
          });
        }
      });
    };

    const handleConnect = () => {
      console.log('Socket connect/reconnect event. Joining room.');
      joinRoom();
    };

    socket.on('connect', handleConnect);

    if (socket.connected) {
      handleConnect();
    }

    async function startMedia() {
      try {
        await rtcClient.initialize();
        try {
          const stream = await rtcClient.setupLocalMedia(
            lobbyVideoRef.current,
            selectedAudioId || undefined,
            selectedVideoId || undefined
          );
          setPermissionError('');
          startLobbyAudioMeter(stream);
        } catch (mediaErr) {
          console.warn('Failed to access camera/mic media hardware:', mediaErr);
          setPermissionError('Camera/Microphone access was denied. You can still join the call without sharing media.');
        }

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const video = devices.filter(d => d.kind === 'videoinput');
          const audio = devices.filter(d => d.kind === 'audioinput');
          const speaker = devices.filter(d => d.kind === 'audiooutput');
          
          setVideoDevices(video);
          setAudioDevices(audio);
          setSpeakerDevices(speaker);

          if (video.length > 0 && !selectedVideoId) setSelectedVideoId(video[0].deviceId);
          if (audio.length > 0 && !selectedAudioId) setSelectedAudioId(audio[0].deviceId);
          if (speaker.length > 0 && !selectedSpeakerId) setSelectedSpeakerId(speaker[0].deviceId);
        } catch (enumErr) {
          console.warn('Failed to enumerate devices:', enumErr);
        }
        mediaInitialized = true;
      } catch (err) {
        console.error('Failed to initialize media client:', err);
        mediaInitialized = true;
      }
    }
    startMedia();

    return () => {
      rtcClient.close();
      socket.off('connect', handleConnect);
      socketManager.disconnect();
    };
  }, [sessionId, token]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Bind screen share video element
  useEffect(() => {
    if (remoteScreenTrack && remoteScreenVideoRef.current) {
      const stream = new MediaStream([remoteScreenTrack]);
      remoteScreenVideoRef.current.srcObject = stream;
    }
  }, [remoteScreenTrack]);

  // Render Knowledge Graph node network visualization on Canvas
  useEffect(() => {
    if (sidebarOpen === 'kg' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = canvas.parentElement?.clientWidth || 300;
      canvas.height = 360;

      let animationFrameId: number;
      let angle = 0;

      const nodes = [
        { label: sessionDetails?.ticketRef || 'Active Case', isCenter: true },
        { label: 'Category: ' + (sessionDetails?.category || 'General'), radius: 80, nodeAngle: 0 },
        { label: 'Router SS-X1 Firmware', radius: 80, nodeAngle: (Math.PI * 2) / 4 },
        { label: 'Network Diagnostic Steps', radius: 80, nodeAngle: ((Math.PI * 2) / 4) * 2 },
        { label: 'Escalation Logs', radius: 80, nodeAngle: ((Math.PI * 2) / 4) * 3 }
      ];

      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // Draw Links
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.15)';
        ctx.lineWidth = 1.5;
        
        nodes.forEach(n => {
          if (!n.isCenter) {
            const curAngle = angle + n.nodeAngle!;
            const nx = cx + Math.cos(curAngle) * n.radius!;
            const ny = cy + Math.sin(curAngle) * n.radius!;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(nx, ny);
            ctx.stroke();
          }
        });

        // Draw satellite nodes
        nodes.forEach(n => {
          if (!n.isCenter) {
            const curAngle = angle + n.nodeAngle!;
            const nx = cx + Math.cos(curAngle) * n.radius!;
            const ny = cy + Math.sin(curAngle) * n.radius!;

            // Circle
            ctx.fillStyle = '#6366f1';
            ctx.shadowColor = '#6366f1';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(nx, ny, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0; // reset

            // Text Label
            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText(n.label.substring(0, 24), nx + 12, ny + 3);
          }
        });

        // Center Node
        ctx.fillStyle = '#8b5cf6';
        ctx.shadowColor = '#8b5cf6';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 15, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('ACTIVE', cx - 18, cy - 22);

        angle += 0.003;
        animationFrameId = requestAnimationFrame(draw);
      };

      draw();
      return () => cancelAnimationFrame(animationFrameId);
    }
  }, [sidebarOpen, sessionDetails]);

  // Calculate live customer sentiment from chat timeline
  const calculateLiveSentiment = (chatMessages: ChatMessage[]) => {
    const positiveKeywords = ['thank', 'perfect', 'resolved', 'great', 'happy', 'solved', 'works', 'appreciate', 'awesome', 'excellent'];
    const negativeKeywords = ['broken', 'fail', 'error', 'frustrated', 'slow', 'angry', 'terrible', 'worst', 'stuck', 'issue', 'crash'];

    let score = 0;
    for (const msg of chatMessages) {
      if (msg.isSystem) continue;
      const text = msg.content.toLowerCase();
      positiveKeywords.forEach(w => { if (text.includes(w)) score += 1; });
      negativeKeywords.forEach(w => { if (text.includes(w)) score -= 1; });
    }
    if (score > 1) return 'POSITIVE';
    if (score < -1) return 'NEGATIVE';
    return 'NEUTRAL';
  };

  const liveSentiment = calculateLiveSentiment(messages);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current) return;

    socketRef.current.emit('chat-message', { content: chatInput });
    setChatInput('');
  };

  const handleToggleCamera = async () => {
    const newState = !cameraEnabled;
    setCameraEnabled(newState);
    if (rtcClientRef.current) {
      await rtcClientRef.current.setVideoEnabled(newState, selectedVideoId || undefined);
    }
    if (socketRef.current) {
      socketRef.current.emit('user-media-state', { micEnabled, cameraEnabled: newState });
    }
  };

  const handleToggleMic = async () => {
    const newState = !micEnabled;
    setMicEnabled(newState);
    if (rtcClientRef.current) {
      await rtcClientRef.current.setAudioEnabled(newState, selectedAudioId || undefined);
    }
    if (socketRef.current) {
      socketRef.current.emit('user-media-state', { micEnabled: newState, cameraEnabled });
    }
  };

  // Local Screen Sharing controls
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      await rtcClientRef.current?.stopScreenShare();
      if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
      }
      setScreenStream(null);
      setIsScreenSharing(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        setScreenStream(stream);
        setIsScreenSharing(true);
        
        const videoTrack = stream.getVideoTracks()[0];
        if (rtcClientRef.current) {
          await rtcClientRef.current.produceScreenShare(videoTrack);
        }
        
        videoTrack.onended = () => {
          handleStopScreenShareDirectly();
        };
      } catch (err) {
        console.error('Failed to stream display media:', err);
      }
    }
  };

  const handleStopScreenShareDirectly = async () => {
    if (rtcClientRef.current) {
      await rtcClientRef.current.stopScreenShare();
    }
    setScreenStream(prev => {
      if (prev) prev.getTracks().forEach(t => t.stop());
      return null;
    });
    setIsScreenSharing(false);
  };

  // Recording pipeline triggers
  const startLocalRecording = async () => {
    if (user?.role === 'CUSTOMER') return;
    
    try {
      const startRes = await fetch(`${API_URL}/api/v1/recordings/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sessionId })
      });
      const startData = await startRes.json();
      if (!startData.success) throw new Error('Start failed');
      
      const recordId = startData.data.id;
      setRecordingId(recordId);

      const remoteStream = remoteStreamRef.current;
      if (!remoteStream) {
        alert('Cannot start recording: Remote customer video stream is not active.');
        return;
      }

      recordedChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(remoteStream, { mimeType: 'video/webm;codecs=vp8,opus' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
        const sizeBytes = blob.size;
        const durationSec = 15; 

        const formData = new FormData();
        formData.append('file', blob, `${recordId}.mp4`);

        await fetch(`${API_URL}/api/v1/recordings/upload-local?recordingId=${recordId}`, {
          method: 'POST',
          body: formData
        });

        await fetch(`${API_URL}/api/v1/recordings/stop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            recordingId: recordId,
            storageKey: `recordings/${recordId}.mp4`,
            size: sizeBytes,
            duration: durationSec
          })
        });
      };

      mediaRecorder.start();
      socketRef.current.emit('recording-control', { action: 'start' });
    } catch (err) {
      console.error('Failed to trigger recording pipeline:', err);
    }
  };

  const stopLocalRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      socketRef.current.emit('recording-control', { action: 'stop', recordingId });
    }
  };

  // Upload attachments
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const presignRes = await fetch(`${API_URL}/api/v1/files/presign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId,
          filename: file.name,
          size: file.size,
          mimeType: file.type
        })
      });
      const presignData = await presignRes.json();
      if (!presignData.success) throw new Error(presignData.error?.message || 'Presign failed');

      const { fileId, uploadUrl, isLocal } = presignData.data;

      if (isLocal) {
        const formData = new FormData();
        formData.append('file', file);
        await fetch(`${API_URL}${uploadUrl}`, { method: 'POST', body: formData });
      } else {
        await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      }

      const confirmRes = await fetch(`${API_URL}/api/v1/files/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fileId })
      });
      const confirmData = await confirmRes.json();
      if (!confirmData.success) throw new Error('Confirmation failed');

      const downloadLink = confirmData.data.downloadUrl;
      const absoluteDownloadLink = downloadLink.startsWith('/') 
        ? `${API_URL}${downloadLink}` 
        : downloadLink;
      socketRef.current.emit('chat-message', {
        content: `[File Shared] ${file.name} - Download: ${absoluteDownloadLink}`
      });
    } catch (err: any) {
      alert(err.message || 'File upload failed');
    } finally {
      setUploadingFile(false);
    }
  };

  // End support session (opens modal first for agents)
  const handleEndCallClick = () => {
    if (user?.role === 'CUSTOMER') {
      router.push('/');
      return;
    }
    setHangupModalOpen(true);
  };

  const executeSupportCopilot = async () => {
    setRunningCopilot(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/sessions/${sessionId}/ai-copilot`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await res.json();
      if (result.success) {
        setCopilotSummary(result.data.summary);
        setAgentNotes(result.data.suggestedNotes);
        setCopilotEmail(result.data.followUpEmail);
      }
    } catch (err) {
      console.error('Support Copilot execution failed:', err);
    } finally {
      setRunningCopilot(false);
    }
  };

  const handleConfirmEndSession = () => {
    endSessionMutation.mutate(
      { sessionId, resolutionStatus, agentNotes },
      {
        onSuccess: (data) => {
          setSummaryData(data.summary);
          setCallEnded(true);
          setHangupModalOpen(false);

          confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
        }
      }
    );
  };

  // Customer satisfaction feedback submission
  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitFeedbackMutation.mutate(
      { sessionId, rating: feedbackRating, resolved: feedbackResolved, comments: feedbackComments },
      {
        onSuccess: () => {
          setFeedbackSubmitted(true);
          confetti({ particleCount: 100, spread: 60, origin: { y: 0.6 } });
          setTimeout(() => {
            router.push('/');
          }, 3000);
        }
      }
    );
  };

  // Renders the satisfaction ratings form or final summary screen
  if (callEnded) {
    if (user?.role === 'CUSTOMER') {
      return (
        <div className="flex-1 min-h-screen bg-slate-950 flex flex-col justify-center items-center px-6 py-12 relative overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-violet-900/10 rounded-full blur-[120px] pointer-events-none" />
          
          <div className="w-full max-w-md p-8 rounded-3xl glass-panel border border-slate-800 shadow-2xl relative z-10 text-center">
            {!feedbackSubmitted ? (
              <>
                <div className="p-3 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-full w-fit mx-auto mb-6">
                  <Star className="w-10 h-10 fill-violet-400/20" />
                </div>
                <h1 className="font-['Outfit'] text-3xl font-extrabold text-slate-100 mb-2">Customer Feedback</h1>
                <p className="text-slate-400 text-sm mb-6">Please take a moment to rate your support experience.</p>

                <form onSubmit={handleFeedbackSubmit} className="space-y-6 text-left">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Was your support issue resolved?
                    </label>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setFeedbackResolved(true)}
                        className={`flex-1 py-3 rounded-xl border text-sm font-bold transition ${
                          feedbackResolved 
                            ? 'bg-emerald-600 border-emerald-500 text-slate-100' 
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        Yes, Resolved
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeedbackResolved(false)}
                        className={`flex-1 py-3 rounded-xl border text-sm font-bold transition ${
                          !feedbackResolved 
                            ? 'bg-red-600 border-red-500 text-slate-100' 
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Satisfaction Rating
                    </label>
                    <div className="flex justify-between px-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFeedbackRating(star)}
                          className="p-1 focus:outline-none transition hover:scale-110"
                        >
                          <Star className={`w-8 h-8 ${
                            star <= feedbackRating ? 'fill-yellow-400 text-yellow-400' : 'text-slate-600'
                          }`} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Comments / Feedback (Optional)
                    </label>
                    <textarea
                      value={feedbackComments}
                      onChange={(e) => setFeedbackComments(e.target.value)}
                      placeholder="Help us improve. Share your support experience..."
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition resize-none text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitFeedbackMutation.isPending}
                    className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 font-bold transition"
                  >
                    {submitFeedbackMutation.isPending ? 'Submitting...' : 'Submit Satisfaction Rating'}
                  </button>
                </form>
              </>
            ) : (
              <div className="py-8">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full w-fit mx-auto mb-6">
                  <Check className="w-10 h-10" />
                </div>
                <h1 className="font-['Outfit'] text-3xl font-extrabold text-slate-100 mb-2">Thank You!</h1>
                <p className="text-slate-400 text-sm">Your feedback and satisfaction rating have been saved.</p>
                <p className="text-slate-600 text-xs mt-6">Redirecting to home screen...</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Agent Post-Call Dashboard details
    return (
      <div className="flex-1 min-h-screen bg-slate-950 flex flex-col items-center px-6 py-12 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-violet-900/10 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="w-full max-w-4xl p-8 rounded-3xl glass-panel border border-slate-800 shadow-2xl relative z-10">
          <div className="flex justify-between items-center mb-6 border-b border-slate-950 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-['Outfit'] text-2xl font-extrabold text-slate-100">Session Closed</h1>
                <p className="text-slate-500 text-xs mt-0.5">Ticket successfully archived on standard logs.</p>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Ticket ID</span>
              <span className="text-sm font-mono font-bold text-violet-400">{sessionDetails?.ticketRef}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Stats */}
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-900/60 flex flex-col gap-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Telemetry Summary</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Duration:</span><span className="text-slate-200 font-semibold">{formatDuration(summaryData?.durationSec || 0)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Chat Messages:</span><span className="text-slate-200 font-semibold">{summaryData?.totalMessages || 0}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Files Transferred:</span><span className="text-slate-200 font-semibold">{summaryData?.totalFiles || 0}</span></div>
                {summaryData?.recordingUrl && (
                  <div className="pt-2 border-t border-slate-800 mt-2 flex items-center justify-between">
                    <span className="text-slate-500">Recording:</span>
                    <a href={`${API_URL}${summaryData.recordingUrl}`} target="_blank" rel="noreferrer" className="text-violet-400 hover:underline font-bold">Play Recording</a>
                  </div>
                )}
              </div>
            </div>

            {/* Resolution Details */}
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-900/60 flex flex-col gap-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Outcome Details</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Resolution Status:</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-600/10 border border-violet-500/20 text-violet-400 uppercase">
                    {resolutionStatus}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Sentiment Gauge:</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 border border-slate-800 text-slate-300">
                    {liveSentiment === 'POSITIVE' ? '😊 Positive' : liveSentiment === 'NEGATIVE' ? '😠 Negative' : '😐 Neutral'}
                  </span>
                </div>
                {agentNotes && (
                  <div className="pt-2 border-t border-slate-800 mt-1">
                    <span className="text-slate-500 block mb-1">Agent Notes:</span>
                    <p className="text-slate-400 leading-normal line-clamp-3 italic">"{agentNotes}"</p>
                  </div>
                )}
              </div>
            </div>

            {/* Copilot summary */}
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-900/60 flex flex-col gap-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Support Copilot Summary</h3>
              {copilotSummary ? (
                <div className="text-xs text-slate-400 space-y-1.5 overflow-y-auto max-h-[140px] pr-1 leading-relaxed">
                  {copilotSummary.split('\n').map((b, i) => <div key={i}>{b}</div>)}
                </div>
              ) : (
                <div className="text-xs text-slate-600 italic">No copilot summary requested.</div>
              )}
            </div>
          </div>

          {/* Follow up Email draft box */}
          {copilotEmail && (
            <div className="p-5 rounded-2xl border border-slate-900 bg-white/[0.01] mb-8">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <Mail className="w-4 h-4 text-violet-400" /> Generated Customer Follow-Up Email
              </h3>
              <pre className="text-xs text-slate-300 bg-slate-950 p-4 rounded-xl border border-slate-900 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                {copilotEmail}
              </pre>
            </div>
          )}

          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 font-bold transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (inLobby) {
    return (
      <div className="flex-1 min-h-screen bg-slate-950 flex flex-col justify-center items-center px-6 py-12 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-violet-900/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10 font-sans">
          {/* Left Panel: Camera & Mic Preview */}
          <div className="p-6 rounded-3xl glass-panel shadow-2xl flex flex-col justify-between relative overflow-hidden min-h-[360px] border border-slate-800">
            <div className="absolute inset-0 bg-slate-950 flex items-center justify-center">
              {cameraEnabled && !permissionError ? (
                <video
                  ref={lobbyVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <div className="p-5 rounded-full bg-slate-900 border border-slate-800">
                    <CameraOff className="w-8 h-8 text-slate-600" />
                  </div>
                  <span className="text-xs font-semibold">Camera is off</span>
                </div>
              )}
            </div>

            {/* Visual Mic Indicator overlay */}
            {micEnabled && !permissionError && (
              <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 bg-slate-950/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/5">
                <Mic className="w-3.5 h-3.5 text-violet-400" />
                <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden flex items-center">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-all duration-75"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
              </div>
            )}

            {permissionError && (
              <div className="absolute inset-x-4 top-4 z-20 p-3 bg-red-950/70 backdrop-blur-md border border-red-500/20 text-red-400 text-xs rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{permissionError}</span>
              </div>
            )}

            {/* Lobby Media Toggles */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 z-20 bg-slate-950/65 backdrop-blur-md p-2 rounded-2xl border border-white/5">
              <button
                onClick={() => {
                  const state = !micEnabled;
                  setMicEnabled(state);
                  rtcClientRef.current?.setAudioEnabled(state, selectedAudioId || undefined);
                }}
                className={`p-3 rounded-xl border transition ${
                  micEnabled 
                    ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' 
                    : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                }`}
              >
                {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  const state = !cameraEnabled;
                  setCameraEnabled(state);
                  rtcClientRef.current?.setVideoEnabled(state, selectedVideoId || undefined);
                }}
                className={`p-3 rounded-xl border transition ${
                  cameraEnabled 
                    ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' 
                    : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                }`}
              >
                {cameraEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Right Panel: Details & Join button */}
          <div className="p-8 rounded-3xl glass-panel shadow-2xl flex flex-col justify-between border border-slate-800">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-violet-400" />
                <span className="font-['Outfit'] font-extrabold text-slate-200 text-sm uppercase tracking-wider">Lobby Setup</span>
              </div>
              <h2 className="font-['Outfit'] text-2xl font-black text-slate-100 mb-1">
                {user?.role === 'CUSTOMER' ? 'Connect with Support' : 'Ready to Start Session?'}
              </h2>
              <p className="text-slate-400 text-xs leading-relaxed mb-6">
                Choose your camera and microphone, check your voice volume level, and join when ready.
              </p>

              {/* Hardware Selection Dropdowns */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Microphone Input</label>
                  <select
                    value={selectedAudioId}
                    onChange={(e) => handleChangeAudioDevice(e.target.value)}
                    disabled={audioDevices.length === 0}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-violet-500 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {audioDevices.length === 0 ? (
                      <option value="">No microphone detected or blocked</option>
                    ) : (
                      audioDevices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microphone ${d.deviceId.substring(0, 5)}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Camera Video Input</label>
                  <select
                    value={selectedVideoId}
                    onChange={(e) => handleChangeVideoDevice(e.target.value)}
                    disabled={videoDevices.length === 0}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-violet-500 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {videoDevices.length === 0 ? (
                      <option value="">No camera detected or blocked</option>
                    ) : (
                      videoDevices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${d.deviceId.substring(0, 5)}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {speakerDevices.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Audio Output Speaker</label>
                    <select
                      value={selectedSpeakerId}
                      onChange={(e) => {
                        setSelectedSpeakerId(e.target.value);
                        if (lobbyVideoRef.current && (lobbyVideoRef.current as any).setSinkId) {
                          (lobbyVideoRef.current as any).setSinkId(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-violet-500 transition font-medium"
                    >
                      {speakerDevices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Speaker ${d.deviceId.substring(0, 5)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-900 mt-6">
              <button
                onClick={handleJoinCall}
                className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 font-extrabold text-sm transition duration-200 shadow-lg shadow-violet-600/20 flex justify-center items-center gap-2"
              >
                <Play className="w-4 h-4 fill-current animate-pulse" /> Join Call Now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Double video aspect-ratio calculations
  const hasScreenShareActive = (remoteScreenTrack !== null) || isScreenSharing;

  return (
    <div className="flex-1 bg-slate-950 flex flex-col h-screen overflow-hidden relative">
      {/* Header bar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md px-6 py-3 flex justify-between items-center shrink-0 z-10">
        <div className="flex items-center gap-3">
          <span className="font-['Outfit'] font-bold text-slate-200">Support Room</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 border border-slate-800 text-slate-500">
            {sessionDetails?.ticketRef}
          </span>
          {recording && (
            <span className="px-2.5 py-1 bg-red-500/10 border border-red-500/20 text-red-400 font-semibold text-[10px] rounded-full flex items-center gap-1.5 animate-pulse">
              <span className="w-1.5 h-1.5 bg-red-400 rounded-full" /> 🔴 Recording
            </span>
          )}

          {/* Conversation Sentiment Indicator Gauge */}
          <span className={`px-2.5 py-1 border text-[10px] font-bold rounded-full flex items-center gap-1.5 ${
            liveSentiment === 'POSITIVE' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
            liveSentiment === 'NEGATIVE' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
            'bg-slate-900 border-slate-800 text-slate-400'
          }`} title="Conversation Sentiment Indicator">
            Sentiment: {liveSentiment === 'POSITIVE' ? '😊 Positive' : liveSentiment === 'NEGATIVE' ? '😠 Negative' : '😐 Neutral'}
          </span>
        </div>

        {/* Quality indicator stats bubble */}
        <div className="flex items-center gap-4">
          {qualityStats && (
            <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-4 border-r border-slate-900 pr-4">
              <span className="flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 text-slate-600" /> RTT: <span className="text-slate-300 font-semibold">{qualityStats.rtt}ms</span>
              </span>
              <span>
                Loss: <span className="text-slate-300 font-semibold">{qualityStats.packetLoss.toFixed(1)}%</span>
              </span>
              <span className={`px-2 py-0.5 rounded font-bold uppercase text-[9px] border ${
                quality === 'Excellent' ? 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10' :
                quality === 'Good' ? 'text-yellow-400 bg-yellow-500/5 border-yellow-500/10' :
                'text-red-400 bg-red-500/5 border-red-500/10'
              }`}>
                {quality} Link
              </span>
            </div>
          )}

          <div className="flex gap-2">
            {user?.role !== 'CUSTOMER' && (
              <>
                <button
                  onClick={() => setSidebarOpen(prev => prev === 'crm' ? null : 'crm')}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 ${
                    sidebarOpen === 'crm' ? 'bg-violet-600 border-violet-500 text-slate-100' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Customer Profile</span>
                </button>
                <button
                  onClick={() => setSidebarOpen(prev => prev === 'kg' ? null : 'kg')}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 ${
                    sidebarOpen === 'kg' ? 'bg-violet-600 border-violet-500 text-slate-100' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <BrainCircuit className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Knowledge Graph</span>
                </button>
              </>
            )}
            <button
              onClick={() => setChatOpen(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition flex items-center gap-1.5 ${
                chatOpen ? 'bg-violet-600 border-violet-500 text-slate-100' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chat</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main room flex grid */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative z-0">
        
        {/* Left Column: Video Feeds Container */}
        <div className="flex-1 bg-slate-950 p-6 flex flex-col gap-6 overflow-y-auto min-w-0">
          
          {waitingRoom ? (
            <div className="flex-1 rounded-3xl border border-dashed border-slate-900 bg-white/[0.003] flex flex-col justify-center items-center p-8">
              <Activity className="w-10 h-10 text-violet-400/35 animate-spin mb-4" />
              <p className="text-slate-300 font-bold text-lg">Waiting for Customer...</p>
              <p className="text-slate-600 text-sm max-w-xs text-center mt-1">Send the invite link to the customer. When they join, call feeds will sync automatically.</p>
              
              {sessionDetails?.invites && sessionDetails.invites.find((i: any) => !i.isRevoked) && (
                <div className="mt-6 flex flex-col items-center gap-2">
                  <button
                    onClick={() => {
                      const activeInvite = sessionDetails.invites.find((i: any) => !i.isRevoked);
                      if (activeInvite) {
                        const inviteUrl = `${window.location.origin}/join/${encodeURIComponent(activeInvite.token)}`;
                        navigator.clipboard.writeText(inviteUrl);
                        setCopiedInvite(true);
                        setTimeout(() => setCopiedInvite(false), 2000);
                      }
                    }}
                    className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 font-bold text-xs transition duration-200 flex items-center gap-1.5 shadow-lg shadow-violet-600/20 animate-bounce"
                  >
                    {copiedInvite ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Invite Link
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-6 min-h-0">
              
              {/* Dynamic Screen Share focus display layout */}
              {hasScreenShareActive ? (
                <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-0">
                  {/* Screen Share panel (Large) */}
                  <div className="flex-[3] relative rounded-3xl border border-slate-900 overflow-hidden bg-slate-900/40 aspect-video xl:aspect-auto min-h-[300px]">
                    {isScreenSharing ? (
                      <div className="absolute inset-0 bg-violet-600/10 flex flex-col justify-center items-center text-center p-4">
                        <Monitor className="w-12 h-12 text-violet-400 animate-pulse mb-3" />
                        <p className="text-slate-200 font-bold text-lg">You are sharing your screen</p>
                        <button
                          onClick={handleStopScreenShareDirectly}
                          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 text-slate-100 font-bold text-xs rounded-lg transition"
                        >
                          Stop Sharing
                        </button>
                      </div>
                    ) : (
                      <video
                        ref={remoteScreenVideoCallbackRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-contain bg-slate-950"
                      />
                    )}
                    <span className="absolute bottom-4 left-4 px-3 py-1 rounded-xl bg-slate-950/70 backdrop-blur-md text-[10px] font-bold uppercase tracking-wider text-violet-400 border border-violet-500/20">
                      {isScreenSharing ? 'Your Presentation' : 'Customer Screen Share'}
                    </span>
                  </div>

                  {/* Sidebar Participant Feeds (Smaller) */}
                  <div className="flex-[1] xl:w-[260px] flex flex-row xl:flex-col gap-4 shrink-0 min-h-0">
                    {/* Remote Customer stream */}
                    <div className={`flex-1 relative rounded-2xl border overflow-hidden aspect-video xl:aspect-auto xl:h-[180px] bg-slate-900/60 ${
                      activeSpeakerId === 'guest' ? 'active-speaker-glow' : 'border-slate-900'
                    }`}>
                      {remoteMediaStates['guest']?.cameraEnabled === false ? (
                        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-violet-600/15 border border-violet-500/20 flex items-center justify-center font-extrabold text-slate-300 text-lg shadow-2xl">
                            {(user?.role === 'CUSTOMER' ? 'Agent' : 'Customer').substring(0, 1)}
                          </div>
                          <span className="text-[10px] text-slate-500 font-semibold mt-2">Camera is off</span>
                        </div>
                      ) : (
                        <video
                          ref={remoteVideoCallbackRef}
                          autoPlay
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      )}
                      {autoplayBlocked && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-sm z-30 p-2 text-center cursor-pointer" onClick={handleUnblockAutoplay}>
                          <Play className="w-6 h-6 text-violet-400 animate-pulse mb-1" />
                          <span className="text-slate-200 font-bold text-[10px]">Tap to Unmute</span>
                        </div>
                      )}
                      {remoteMediaStates['guest']?.micEnabled === false && (
                        <div className="absolute top-2.5 right-2.5 p-1.5 bg-red-600/90 border border-red-500/25 text-slate-100 rounded-lg z-20 shadow-lg">
                          <MicOff className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded-lg bg-slate-950/60 backdrop-blur-md text-[10px] font-semibold text-slate-300 border border-white/5">
                        {user?.role === 'CUSTOMER' ? 'Agent' : 'Customer'}
                      </span>
                    </div>

                    {/* Local Agent stream */}
                    <div className={`flex-1 relative rounded-2xl border overflow-hidden aspect-video xl:aspect-auto xl:h-[180px] bg-slate-900/60 ${
                      activeSpeakerId === user?.id ? 'active-speaker-glow' : 'border-slate-900'
                    }`}>
                      {!cameraEnabled ? (
                        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-violet-600/15 border border-violet-500/20 flex items-center justify-center font-extrabold text-slate-300 text-lg shadow-2xl">
                            Y
                          </div>
                          <span className="text-[10px] text-slate-500 font-semibold mt-2">Your camera is off</span>
                        </div>
                      ) : (
                        <video
                          ref={localVideoCallbackRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover scale-x-[-1]"
                        />
                      )}
                      {!micEnabled && (
                        <div className="absolute top-2.5 right-2.5 p-1.5 bg-red-600/90 border border-red-500/25 text-slate-100 rounded-lg z-20 shadow-lg">
                          <MicOff className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded-lg bg-slate-950/60 backdrop-blur-md text-[10px] font-semibold text-slate-300 border border-white/5">
                        You
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Side-by-side normal video layouts */
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center min-h-0">
                  {/* Remote Customer stream */}
                  <div className={`relative rounded-3xl border overflow-hidden aspect-video bg-slate-900/60 h-full ${
                    activeSpeakerId === 'guest' ? 'active-speaker-glow' : 'border-slate-900'
                  }`}>
                    {remoteMediaStates['guest']?.cameraEnabled === false ? (
                      <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center">
                        <div className="w-20 h-20 rounded-full bg-violet-600/10 border border-violet-500/25 flex items-center justify-center font-extrabold text-slate-300 text-3xl shadow-2xl">
                          {(user?.role === 'CUSTOMER' ? 'Agent' : 'Customer').substring(0, 1)}
                        </div>
                        <span className="text-xs text-slate-500 font-semibold mt-3">Camera is off</span>
                      </div>
                    ) : (
                      <video
                        ref={remoteVideoCallbackRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover bg-slate-950"
                      />
                    )}
                    {autoplayBlocked && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 backdrop-blur-sm z-30 p-4 text-center cursor-pointer" onClick={handleUnblockAutoplay}>
                        <div className="p-3 bg-violet-600/20 rounded-full text-violet-400 mb-2 animate-bounce">
                          <Play className="w-6 h-6 fill-current" />
                        </div>
                        <h4 className="text-slate-200 font-bold text-sm mb-1">Click to Start Call Audio/Video</h4>
                        <p className="text-slate-400 text-[10px] max-w-[200px]">
                          Browser blocked auto playback. Click to connect feeds.
                        </p>
                      </div>
                    )}
                    {remoteMediaStates['guest']?.micEnabled === false && (
                      <div className="absolute top-4 right-4 p-2 bg-red-600/90 border border-red-500/25 text-slate-100 rounded-xl z-20 shadow-lg">
                        <MicOff className="w-4 h-4" />
                      </div>
                    )}
                    <span className="absolute bottom-4 left-4 px-3 py-1 rounded-xl bg-slate-950/60 backdrop-blur-md text-xs font-semibold text-slate-300 border border-white/5">
                      {user?.role === 'CUSTOMER' ? 'Agent' : 'Customer'}
                    </span>
                  </div>

                  {/* Local Agent stream */}
                  <div className={`relative rounded-3xl border overflow-hidden aspect-video bg-slate-900/60 h-full ${
                    activeSpeakerId === user?.id ? 'active-speaker-glow' : 'border-slate-900'
                  }`}>
                    {!cameraEnabled ? (
                      <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center">
                        <div className="w-20 h-20 rounded-full bg-violet-600/10 border border-violet-500/25 flex items-center justify-center font-extrabold text-slate-300 text-3xl shadow-2xl">
                          Y
                        </div>
                        <span className="text-xs text-slate-500 font-semibold mt-3">Your camera is off</span>
                      </div>
                    ) : (
                      <video
                        ref={localVideoCallbackRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1] bg-slate-950"
                      />
                    )}
                    {!micEnabled && (
                      <div className="absolute top-4 right-4 p-2 bg-red-600/90 border border-red-500/25 text-slate-100 rounded-xl z-20 shadow-lg">
                        <MicOff className="w-4 h-4" />
                      </div>
                    )}
                    <span className="absolute bottom-4 left-4 px-3 py-1 rounded-xl bg-slate-950/60 backdrop-blur-md text-xs font-semibold text-slate-300 border border-white/5">
                      You ({user?.displayName || 'Agent'})
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Media Command Bar */}
          <div className="flex justify-center items-center gap-4 bg-slate-950/90 border border-slate-900 p-4 rounded-3xl w-fit mx-auto shadow-2xl relative z-30 shrink-0 font-sans">
            {/* Mic Toggle + Menu */}
            <div className="relative flex items-center">
              <button
                onClick={handleToggleMic}
                className={`p-4 rounded-l-2xl border-y border-l transition ${
                  micEnabled 
                    ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' 
                    : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                }`}
                title={micEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
              >
                {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              <button
                onClick={() => {
                  setShowMicMenu(!showMicMenu);
                  setShowCameraMenu(false);
                }}
                className="p-4 rounded-r-2xl border transition bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              
              {showMicMenu && (
                <div className="absolute bottom-16 left-0 w-64 p-4 rounded-2xl glass-panel border border-slate-800 shadow-2xl z-50 space-y-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Select Microphone</span>
                    {audioDevices.length === 0 ? (
                      <div className="text-slate-500 text-[10px] px-2.5 py-1.5 font-medium">No microphone detected</div>
                    ) : (
                      audioDevices.map(d => (
                        <button
                          key={d.deviceId}
                          onClick={async () => {
                            await handleChangeAudioDevice(d.deviceId);
                            setShowMicMenu(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex justify-between items-center ${
                            selectedAudioId === d.deviceId ? 'bg-violet-600/20 text-violet-400 font-bold' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                          }`}
                        >
                          <span className="truncate pr-2">{d.label || `Microphone ${d.deviceId.substring(0, 5)}`}</span>
                          {selectedAudioId === d.deviceId && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      ))
                    )}
                  </div>
                  {speakerDevices.length > 0 && (
                    <div className="pt-2 border-t border-slate-900/60">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Select Speaker</span>
                      {speakerDevices.map(d => (
                        <button
                          key={d.deviceId}
                          onClick={() => {
                            setSelectedSpeakerId(d.deviceId);
                            if (remoteVideoRef.current && (remoteVideoRef.current as any).setSinkId) {
                              (remoteVideoRef.current as any).setSinkId(d.deviceId)
                                .catch((e: any) => console.warn('Failed to set speaker output sink ID:', e));
                            }
                            setShowMicMenu(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex justify-between items-center ${
                            selectedSpeakerId === d.deviceId ? 'bg-violet-600/20 text-violet-400 font-bold' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                          }`}
                        >
                          <span className="truncate pr-2">{d.label || `Speaker ${d.deviceId.substring(0, 5)}`}</span>
                          {selectedSpeakerId === d.deviceId && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Camera Toggle + Menu */}
            <div className="relative flex items-center">
              <button
                onClick={handleToggleCamera}
                className={`p-4 rounded-l-2xl border-y border-l transition ${
                  cameraEnabled 
                    ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800' 
                    : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                }`}
                title={cameraEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
              >
                {cameraEnabled ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
              </button>
              <button
                onClick={() => {
                  setShowCameraMenu(!showCameraMenu);
                  setShowMicMenu(false);
                }}
                className="p-4 rounded-r-2xl border transition bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              
              {showCameraMenu && (
                <div className="absolute bottom-16 left-0 w-64 p-4 rounded-2xl glass-panel border border-slate-800 shadow-2xl z-50 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Select Camera</span>
                  {videoDevices.length === 0 ? (
                    <div className="text-slate-500 text-[10px] px-2.5 py-1.5 font-medium">No camera detected</div>
                  ) : (
                    videoDevices.map(d => (
                      <button
                        key={d.deviceId}
                        onClick={async () => {
                          await handleChangeVideoDevice(d.deviceId);
                          setShowCameraMenu(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition flex justify-between items-center ${
                          selectedVideoId === d.deviceId ? 'bg-violet-600/20 text-violet-400 font-bold' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                        }`}
                      >
                        <span className="truncate pr-2">{d.label || `Camera ${d.deviceId.substring(0, 5)}`}</span>
                        {selectedVideoId === d.deviceId && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Screen Share */}
            <button
              onClick={handleToggleScreenShare}
              disabled={waitingRoom}
              className={`p-4 rounded-2xl border transition ${
                isScreenSharing 
                  ? 'bg-violet-600 border-violet-500 text-slate-100 hover:bg-violet-500' 
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
              title="Share Screen"
            >
              <Monitor className="w-5 h-5" />
            </button>

            {/* Recording (Agent Only) */}
            {user?.role !== 'CUSTOMER' && (
              <button
                onClick={recording ? stopLocalRecording : startLocalRecording}
                disabled={waitingRoom}
                className={`p-4 rounded-2xl border transition ${
                  recording 
                    ? 'bg-red-500/20 border-red-500/30 text-red-400 animate-pulse' 
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
                title={recording ? 'Stop Recording' : 'Start Recording'}
              >
                <Radio className="w-5 h-5" />
              </button>
            )}

            {/* Hang Up */}
            <button
              onClick={handleEndCallClick}
              className="p-4 rounded-2xl bg-red-600 hover:bg-red-500 text-slate-100 transition shadow-lg shadow-red-600/20 animate-pulse-slow"
              title="Hang Up Session"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Collapsible Customer CRM History Sidebar */}
        {sidebarOpen === 'crm' && (
          <aside className="fixed md:relative inset-y-0 right-0 z-50 w-full sm:w-[320px] border-l border-slate-900 bg-slate-950 flex flex-col shrink-0 overflow-hidden shadow-2xl md:shadow-none">
            <div className="p-4 border-b border-slate-900 flex items-center justify-between shrink-0">
              <span className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
                <Users className="w-4 h-4 text-violet-400" /> Customer CRM History
              </span>
              <button onClick={() => setSidebarOpen(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-5">
              {loadingCrm ? (
                <div className="text-center text-slate-500 text-xs py-8">Loading CRM details...</div>
              ) : !crmProfile ? (
                <div className="text-center text-slate-600 text-xs py-8">No customer profile discovered yet.</div>
              ) : (
                <>
                  {/* Profile Info */}
                  <div className="space-y-3 p-4 rounded-xl border border-slate-900 bg-slate-950/60">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Customer Profile</h3>
                    <div className="space-y-1 text-xs">
                      <div><span className="text-slate-500">Name:</span> <span className="text-slate-200 font-semibold">{crmProfile.displayName}</span></div>
                      <div><span className="text-slate-500">Email:</span> <span className="text-slate-200 font-mono font-semibold">{crmProfile.email}</span></div>
                      {crmProfile.company && <div><span className="text-slate-500">Company:</span> <span className="text-slate-200 font-semibold">{crmProfile.company}</span></div>}
                      {crmProfile.phone && <div><span className="text-slate-500">Phone:</span> <span className="text-slate-200 font-semibold">{crmProfile.phone}</span></div>}
                      {crmProfile.notes && (
                        <div className="pt-2 border-t border-slate-900/60 mt-1">
                          <span className="text-slate-500 block mb-1">CRM Notes:</span>
                          <p className="text-slate-400 leading-normal">{crmProfile.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Salesforce / HubSpot Badges */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Connected Adapters</h4>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className={`p-2.5 rounded-lg border text-center font-bold uppercase transition ${
                        crmProfile.salesforceId ? 'border-sky-500/20 text-sky-400 bg-sky-500/5' : 'border-slate-900 text-slate-700'
                      }`}>
                        Salesforce
                      </div>
                      <div className={`p-2.5 rounded-lg border text-center font-bold uppercase transition ${
                        crmProfile.hubspotId ? 'border-orange-500/20 text-orange-400 bg-orange-500/5' : 'border-slate-900 text-slate-700'
                      }`}>
                        HubSpot
                      </div>
                    </div>
                  </div>

                  {/* Previous Support Cases */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Previous Support Cases</h3>
                    {crmCases.length === 0 ? (
                      <div className="text-slate-600 text-xs italic">No prior cases recorded.</div>
                    ) : (
                      <div className="space-y-3">
                        {crmCases.map((c, idx) => (
                          <div key={idx} className="p-3 rounded-xl border border-slate-900 bg-slate-950/20 text-xs flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-slate-300 truncate max-w-[150px]">{c.title}</span>
                              <span className="text-[9px] font-mono text-violet-400 font-bold">{c.ticketRef}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1">
                              <span>Outcome: <span className="text-slate-400 font-semibold">{c.resolutionStatus || 'Unknown'}</span></span>
                              <span>{new Date(c.endedAt || c.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </aside>
        )}

        {/* Collapsible Knowledge Graph Sidebar */}
        {sidebarOpen === 'kg' && (
          <aside className="fixed md:relative inset-y-0 right-0 z-50 w-full sm:w-[320px] border-l border-slate-900 bg-slate-950 flex flex-col shrink-0 overflow-hidden shadow-2xl md:shadow-none">
            <div className="p-4 border-b border-slate-900 flex items-center justify-between shrink-0">
              <span className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
                <BrainCircuit className="w-4 h-4 text-violet-400" /> Interactive Knowledge Graph
              </span>
              <button onClick={() => setSidebarOpen(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-2 overflow-hidden shrink-0 flex justify-center items-center">
                <canvas ref={canvasRef} className="w-full aspect-[4/5] bg-slate-950" />
              </div>
              <div className="p-4 rounded-xl border border-slate-900 bg-slate-950/20 text-xs space-y-3 leading-relaxed text-slate-400">
                <div className="flex items-start gap-2 text-slate-300 font-semibold">
                  <Info className="w-4 h-4 shrink-0 text-violet-400 mt-0.5" />
                  <span>Case Relationship Diagram</span>
                </div>
                <p>The canvas visualizes glowing nodes depicting related support vectors, category codes, and linked technical articles. Agents can audit related tickets to speed up diagnosis.</p>
              </div>
            </div>
          </aside>
        )}

        {/* Right Column: Chat & File Sharing Sidebar */}
        {chatOpen && (
          <div className="fixed md:relative inset-y-0 right-0 z-40 w-full sm:w-[380px] border-t md:border-t-0 md:border-l border-slate-900 bg-slate-950 flex flex-col overflow-hidden shrink-0 shadow-2xl md:shadow-none h-full md:h-auto">
            <div className="p-4 border-b border-slate-900 flex items-center justify-between shrink-0">
              <span className="font-bold text-slate-200 text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-violet-400" /> Session Messages
              </span>
              <button onClick={() => setChatOpen(false)} className="md:hidden text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

          {/* Chat log messages list */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 min-h-0">
            {messages.length === 0 ? (
              <div className="text-center text-slate-600 text-xs py-8">
                No chat messages exchanged yet.
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.isSystem) {
                  return (
                    <div key={msg.id} className="text-center text-[10px] text-slate-600 py-1 bg-white/[0.005] border border-white/[0.02] rounded-lg">
                      {msg.content}
                    </div>
                  );
                }

                const isMe = msg.senderName === user?.displayName;

                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-slate-600 font-bold mb-1 uppercase">
                      {msg.senderName} ({msg.senderRole.toLowerCase()})
                    </span>
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm max-w-[85%] leading-relaxed ${
                      isMe 
                        ? 'bg-violet-600 text-slate-100 rounded-tr-none' 
                        : 'bg-slate-900 text-slate-300 rounded-tl-none border border-slate-800/60'
                    }`}>
                      {msg.content.startsWith('[File Shared]') ? (
                        <span className="flex items-center gap-1.5 text-sky-400 font-semibold underline">
                          <Paperclip className="w-3.5 h-3.5 shrink-0" />
                          <a 
                            href={(() => {
                              const rawUrl = msg.content.split('Download: ')[1] || '';
                              return rawUrl.startsWith('/') ? `${API_URL}${rawUrl}` : rawUrl;
                            })()} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="truncate max-w-[200px]"
                          >
                            {msg.content.split(' - Download:')[0].replace('[File Shared] ', '')}
                          </a>
                        </span>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Inputs */}
          <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-900 shrink-0 flex gap-2">
            <label className="p-3 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 cursor-pointer transition flex items-center justify-center shrink-0">
              <input
                type="file"
                className="hidden"
                disabled={uploadingFile}
                onChange={handleFileUpload}
              />
              <Paperclip className="w-4 h-4" />
            </label>
            
            <input
              type="text"
              required
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={uploadingFile ? 'Uploading file...' : 'Enter message...'}
              disabled={uploadingFile}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 text-sm transition"
            />
            
            <button
              type="submit"
              disabled={uploadingFile || !chatInput.trim()}
              className="p-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 font-bold transition shrink-0"
            >
              <Send className="w-4 h-4 fill-current" />
            </button>
          </form>

          </div>
        )}

      </div>

      {/* Agent Notes / Hangup Resolution Form Modal */}
      {hangupModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-lg p-6 rounded-2xl glass-panel shadow-2xl border border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-violet-400" />
              <h3 className="font-['Outfit'] text-xl font-bold text-slate-100">End Support Session Form</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Resolution Status</label>
                <select
                  value={resolutionStatus}
                  onChange={(e) => setResolutionStatus(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-violet-500 transition text-sm font-semibold"
                >
                  <option value="RESOLVED">Resolved</option>
                  <option value="PARTIALLY_RESOLVED">Partially Resolved</option>
                  <option value="ESCALATED">Escalated</option>
                  <option value="NO_RESPONSE">No Response</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Resolution Notes</label>
                  <button
                    type="button"
                    onClick={executeSupportCopilot}
                    disabled={runningCopilot}
                    className="px-2.5 py-1 bg-violet-600/10 border border-violet-500/20 text-violet-400 rounded-lg text-[10px] font-bold hover:bg-violet-600/20 transition flex items-center gap-1 shadow-inner shadow-violet-500/5"
                  >
                    <Sparkles className="w-3 h-3 text-violet-400 animate-pulse" />
                    {runningCopilot ? 'Summarizing...' : 'Generate Support Copilot Summary'}
                  </button>
                </div>
                <textarea
                  value={agentNotes}
                  onChange={(e) => setAgentNotes(e.target.value)}
                  placeholder="Summarize the issue diagnosed, actions taken, and final troubleshooting notes..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition resize-none text-sm"
                />
              </div>

              {copilotSummary && (
                <div className="p-4 rounded-xl border border-slate-900 bg-slate-950/40 space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Summary Bullets Generated</h4>
                  <div className="text-[11px] text-slate-400 space-y-1 pl-1">
                    {copilotSummary.split('\n').map((b, idx) => (
                      <div key={idx}>{b}</div>
                    ))}
                  </div>
                </div>
              )}

              {copilotEmail && (
                <div className="p-4 rounded-xl border border-slate-900 bg-slate-950/40 space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Generated Customer Follow-Up Email</h4>
                  <div className="text-[11px] text-slate-400 truncate max-w-full font-mono bg-slate-950/80 p-2.5 rounded-lg border border-slate-900 whitespace-pre-wrap max-h-[100px] overflow-y-auto">
                    {copilotEmail}
                  </div>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-900 mt-4">
                <button
                  type="button"
                  onClick={() => setHangupModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmEndSession}
                  disabled={endSessionMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-slate-100 text-sm font-bold transition"
                >
                  {endSessionMutation.isPending ? 'Closing...' : 'Submit & Close Session'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivitySpinner() {
  return (
    <div className="w-5 h-5 border-2 border-violet-500/25 border-t-violet-500 rounded-full animate-spin" />
  );
}

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const remainder = sec % 60;
  return `${mins}m ${remainder}s`;
}

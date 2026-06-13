'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useJoinInvite } from '../../../lib/hooks/useSessions';
import { useAuthStore } from '../../../lib/store/useAuthStore';
import { Video, Camera, Mic, Play, AlertTriangle } from 'lucide-react';

export default function CustomerJoinPage() {
  const router = useRouter();
  const params = useParams();
  const token = decodeURIComponent(params.token as string);

  const { setAuth } = useAuthStore();
  const joinMutation = useJoinInvite();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [deviceStream, setDeviceStream] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);

  // Setup preview camera stream on mount
  useEffect(() => {
    async function startPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setDeviceStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        console.warn('Camera/Mic permission denied or missing devices:', err);
        setErrorMsg('Camera and Microphone access is required to join this call.');
      }
    }
    startPreview();

    return () => {
      if (deviceStream) {
        deviceStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    // Stop preview stream before moving to the call room
    if (deviceStream) {
      deviceStream.getTracks().forEach((track) => track.stop());
    }

    joinMutation.mutate({ token, displayName, email, company, phone, notes }, {
      onSuccess: (resData) => {
        // Scoped guest credentials mapping
        const guestUser = {
          id: 'guest',
          email,
          displayName,
          role: 'CUSTOMER' as const,
        };
        
        // Store guest access token and route to room
        setAuth(resData.accessToken, guestUser);
        router.push(`/session/${resData.session.id}?name=${encodeURIComponent(displayName)}`);
      },
      onError: (err: any) => {
        setErrorMsg(err.message || 'This invite link has expired or is invalid.');
      },
    });
  };

  const togglePreviewVideo = () => {
    if (deviceStream) {
      const videoTrack = deviceStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !cameraEnabled;
        setCameraEnabled(!cameraEnabled);
      }
    }
  };

  const togglePreviewAudio = () => {
    if (deviceStream) {
      const audioTrack = deviceStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !micEnabled;
        setMicEnabled(!micEnabled);
      }
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-slate-950 flex flex-col justify-center items-center px-6 py-12 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-violet-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
        
        {/* Left Card: Camera / Device preview */}
        <div className="p-6 rounded-3xl glass-panel shadow-2xl flex flex-col justify-between items-center relative overflow-hidden aspect-video md:aspect-auto min-h-[300px]">
          <div className="absolute inset-0 bg-slate-950 flex items-center justify-center">
            {cameraEnabled ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="p-4 rounded-full bg-slate-900 text-slate-700">
                <Camera className="w-10 h-10" />
              </div>
            )}
          </div>

          {/* Floating Device Controls */}
          <div className="absolute bottom-4 flex gap-3 z-20">
            <button
              onClick={togglePreviewAudio}
              className={`p-3 rounded-xl border transition ${
                micEnabled 
                  ? 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-slate-900' 
                  : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
              }`}
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              onClick={togglePreviewVideo}
              className={`p-3 rounded-xl border transition ${
                cameraEnabled 
                  ? 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-slate-900' 
                  : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
              }`}
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Card: Name Entry Form */}
        <div className="p-8 rounded-3xl glass-panel shadow-2xl flex flex-col justify-center">
          <div className="flex items-center gap-2.5 mb-4">
            <Video className="w-5 h-5 text-violet-400" />
            <span className="font-['Outfit'] font-bold text-slate-200">SupportStream Room Access</span>
          </div>

          <h2 className="font-['Outfit'] text-2xl font-bold text-slate-100 mb-2">Connect to Support</h2>
          <p className="text-slate-400 text-sm mb-6">Enter your display name to start the secure video session with your agent.</p>

          <form onSubmit={handleJoin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Your Display Name *</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Sam Customer"
                className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. sam@company.com"
                className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Company (Optional)</label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Phone (Optional)</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +1 555-0199"
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Issue Description / Notes (Optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Briefly describe what you need help with..."
                rows={2}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition resize-none"
              />
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-950/35 border border-red-500/20 text-red-400 text-sm rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={joinMutation.isPending || !displayName.trim()}
              className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 font-bold transition duration-200 shadow-lg shadow-violet-600/20 flex justify-center items-center gap-2"
            >
              {joinMutation.isPending ? 'Connecting...' : (
                <>
                  <Play className="w-4 h-4 fill-current" /> Join Video Support Call
                </>
              )}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

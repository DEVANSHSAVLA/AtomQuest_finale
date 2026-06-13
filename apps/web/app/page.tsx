'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '../lib/store/useAuthStore';
import { Monitor, Shield, Video, Zap, Activity } from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const { setAuth, isAuthenticated } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Customer Support Request States
  const [activeTab, setActiveTab] = useState<'SUPPORT' | 'AGENT'>('SUPPORT');
  const [displayName, setDisplayName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [supportCategory, setSupportCategory] = useState('TECHNICAL_SUPPORT');
  const [issueDescription, setIssueDescription] = useState('');

  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const API_URL = rawApiUrl.replace(/\/api\/v1\/?$/, '');

  const handleRequestSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !customerEmail.trim() || !issueTitle.trim()) return;

    setLoading(true);
    setErrorMsg('');

    try {
      const response = await fetch(`${API_URL}/api/v1/sessions/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          email: customerEmail,
          title: issueTitle,
          category: supportCategory,
          description: issueDescription,
        }),
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Failed to submit support request');
      }

      const { accessToken, session } = resData.data;

      const customerUser = {
        id: 'guest',
        email: customerEmail,
        displayName,
        role: 'CUSTOMER' as const,
      };

      setAuth(accessToken, customerUser);
      router.push(`/session/${session.id}?name=${encodeURIComponent(displayName)}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect to support server');
    } finally {
      setLoading(false);
    }
  };

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated()) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  // Initialize Google Sign-in client
  useEffect(() => {
    const initGoogle = () => {
      const google = (window as any).google;
      if (google?.accounts?.id) {
        google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '732541478239-rfbelahs37p07rprpqtjbrjlt6uqu0di.apps.googleusercontent.com',
          callback: handleGoogleCredentialResponse,
        });

        const btnContainer = document.getElementById('google-signin-btn');
        if (btnContainer) {
          google.accounts.id.renderButton(btnContainer, {
            theme: 'filled_dark',
            size: 'large',
            width: '384',
            shape: 'rectangular',
          });
        }
      }
    };

    if ((window as any).google) {
      initGoogle();
    } else {
      const initInterval = setInterval(() => {
        if ((window as any).google) {
          initGoogle();
          clearInterval(initInterval);
        }
      }, 500);
      return () => clearInterval(initInterval);
    }
  }, [activeTab]);

  const handleGoogleCredentialResponse = async (response: any) => {
    setLoading(true);
    setErrorMsg('');

    try {
      const apiRes = await fetch(`${API_URL}/api/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential }),
      });

      const resData = await apiRes.json();

      if (!apiRes.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Google authentication failed');
      }

      const { token, user } = resData.data;
      setAuth(token, user);
      router.push('/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message || 'Google Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Login failed');
      }

      const { token, user } = resData.data;
      setAuth(token, user);
      router.push('/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message || 'Connection to authentication server failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-slate-950 flex flex-col lg:flex-row relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-violet-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Left Column: Hero & Specs */}
      <div className="flex-1 flex flex-col justify-start px-8 sm:px-16 lg:px-24 pt-12 lg:pt-16 pb-12 max-w-4xl relative z-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2.5 bg-violet-600/10 rounded-xl border border-violet-500/20 text-violet-400">
            <Video className="w-7 h-7 animate-pulse" />
          </div>
          <span className="font-['Outfit'] text-2xl font-bold tracking-tight bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            SupportStream
          </span>
        </div>

        <h1 className="font-['Outfit'] text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-none mb-6">
          Enterprise Video <br />
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">
            Support Platform
          </span>
        </h1>

        <p className="text-slate-400 text-lg sm:text-xl font-normal leading-relaxed mb-12 max-w-xl">
          Conduct secure, server-routed support calls without peer-to-peer leaks. Build trust, record audits, and resolve defects with a premium WebRTC SFU experience.
        </p>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
          <div className="flex gap-4 p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04]">
            <Shield className="w-6 h-6 text-violet-400 shrink-0" />
            <div>
              <h3 className="font-semibold text-slate-200 mb-1 text-sm sm:text-base">Media Sovereignty</h3>
              <p className="text-slate-400 text-xs sm:text-sm">Server-routed SFU streams bypass P2P connections to guarantee enterprise compliance audits.</p>
            </div>
          </div>
          <div className="flex gap-4 p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04]">
            <Zap className="w-6 h-6 text-indigo-400 shrink-0" />
            <div>
              <h3 className="font-semibold text-slate-200 mb-1 text-sm sm:text-base">Ultra Low Latency</h3>
              <p className="text-slate-400 text-xs sm:text-sm">Mediasoup worker-forwarded media streams deliver packet routing under 100ms.</p>
            </div>
          </div>
          <div className="flex gap-4 p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04]">
            <Activity className="w-6 h-6 text-fuchsia-400 shrink-0" />
            <div>
              <h3 className="font-semibold text-slate-200 mb-1 text-sm sm:text-base">Full Auditing</h3>
              <p className="text-slate-400 text-xs sm:text-sm">Track user join actions, recording state switches, and files shared in Neon database logs.</p>
            </div>
          </div>
          <div className="flex gap-4 p-4 rounded-2xl bg-white/[0.01] border border-white/[0.04]">
            <Monitor className="w-6 h-6 text-sky-400 shrink-0" />
            <div>
              <h3 className="font-semibold text-slate-200 mb-1 text-sm sm:text-base">Operations Dashboard</h3>
              <p className="text-slate-400 text-xs sm:text-sm">Monitor active concurrent calls, review packet drops, and inspect Prometheus telemetry charts.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Glassmorphic Tabbed Action Card */}
      <div className="flex-1 flex items-center justify-center px-8 py-12 relative z-10">
        <div className="w-full max-w-md p-8 rounded-3xl glass-panel shadow-2xl relative">
          
          {/* Tab Selection */}
          <div className="flex border-b border-slate-900 mb-6 gap-2">
            <button
              onClick={() => { setActiveTab('SUPPORT'); setErrorMsg(''); }}
              className={`flex-1 pb-3 text-sm font-bold border-b-2 transition ${
                activeTab === 'SUPPORT' 
                  ? 'border-violet-500 text-slate-100' 
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Request Support
            </button>
            <button
              onClick={() => { setActiveTab('AGENT'); setErrorMsg(''); }}
              className={`flex-1 pb-3 text-sm font-bold border-b-2 transition ${
                activeTab === 'AGENT' 
                  ? 'border-violet-500 text-slate-100' 
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Agent Portal
            </button>
          </div>

          {activeTab === 'SUPPORT' ? (
            <>
              <h2 className="font-['Outfit'] text-2xl font-bold text-slate-100 mb-2">Connect to Agent</h2>
              <p className="text-slate-400 text-xs mb-6">Request a direct video support session and queue up.</p>

              <form onSubmit={handleRequestSupport} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Your Name *</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Sam Customer"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="e.g. sam@company.com"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Support Category *</label>
                  <select
                    value={supportCategory}
                    onChange={(e) => setSupportCategory(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-violet-500 transition text-sm cursor-pointer"
                  >
                    <option value="TECHNICAL_SUPPORT">Technical Support</option>
                    <option value="BILLING">Billing & Invoices</option>
                    <option value="ACCOUNT_RECOVERY">Account Recovery</option>
                    <option value="PRODUCT_DEMO">Sales & Demo</option>
                    <option value="ESCALATION">Escalated Priority</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Issue Title *</label>
                  <input
                    type="text"
                    required
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    placeholder="e.g. Cannot configure router"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Description (Optional)</label>
                  <textarea
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    placeholder="Provide detail on your technical issue..."
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition resize-none text-sm"
                  />
                </div>

                {errorMsg && (
                  <div className="p-3 bg-red-950/35 border border-red-500/20 text-red-400 text-sm rounded-xl">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 font-bold transition duration-200 shadow-lg shadow-violet-600/20 flex justify-center items-center gap-2 text-sm"
                >
                  {loading ? 'Initializing Call...' : 'Initialize Support Call'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="font-['Outfit'] text-2xl font-bold text-slate-100 mb-2">Agent Login</h2>
              <p className="text-slate-400 text-sm mb-6">Sign in to your corporate support account.</p>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="agent@supportstream.com"
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition"
                  />
                </div>

                {errorMsg && (
                  <div className="p-3 bg-red-950/35 border border-red-500/20 text-red-400 text-sm rounded-xl">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 font-bold transition duration-200 shadow-lg shadow-violet-600/20 flex justify-center items-center gap-2"
                >
                  {loading ? 'Authenticating...' : 'Sign In'}
                </button>
              </form>

              <div className="relative flex items-center justify-center my-6">
                <span className="absolute px-3 bg-slate-950 text-xs text-slate-500 uppercase tracking-wider">Or</span>
                <div className="w-full border-t border-slate-900" />
              </div>

              <div className="flex justify-center min-h-[44px]">
                <div id="google-signin-btn" className="w-full" />
              </div>

              <div className="mt-8 text-center text-sm text-slate-400 border-t border-slate-900 pt-6">
                New to the platform?{' '}
                <Link href="/register" className="text-violet-400 hover:underline font-semibold">
                  Create Agent Account
                </Link>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

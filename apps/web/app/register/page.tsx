'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Video } from 'lucide-react';
import { useAuthStore } from '../../lib/store/useAuthStore';

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'AGENT' | 'ADMIN'>('AGENT');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const API_URL = rawApiUrl.replace(/\/api\/v1\/?$/, '');

  // Initialize Google Sign-in client
  useEffect(() => {
    const initGoogle = () => {
      const google = (window as any).google;
      if (google?.accounts?.id) {
        google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '732541478239-rfbelahs37p07rprpqtjbrjlt6uqu0di.apps.googleusercontent.com',
          callback: handleGoogleCredentialResponse,
        });

        const btnContainer = document.getElementById('google-signup-btn');
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
  }, []);

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
        throw new Error(resData.error?.message || 'Google registration failed');
      }

      const { token, user } = resData.data;
      setAuth(token, user);
      router.push('/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message || 'Google Sign-Up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccess(false);

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName, role }),
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        throw new Error(resData.error?.message || 'Registration failed');
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Connection to database failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-slate-950 flex items-center justify-center relative overflow-hidden px-6 py-12">
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-violet-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md p-8 rounded-3xl glass-panel shadow-2xl relative z-10">
        <div className="flex justify-center items-center gap-2 mb-6">
          <Video className="w-6 h-6 text-violet-400" />
          <span className="font-['Outfit'] text-xl font-bold tracking-tight text-slate-100">
            SupportStream
          </span>
        </div>

        <h2 className="font-['Outfit'] text-2xl font-bold text-slate-100 text-center mb-1">Create Account</h2>
        <p className="text-slate-400 text-sm text-center mb-6">Sign up to get access to the agent dashboard.</p>

        {success ? (
          <div className="p-4 bg-emerald-950/35 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl text-center">
            Registration successful! Redirecting to login...
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Full Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Smith"
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@supportstream.com"
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Account Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'AGENT' | 'ADMIN')}
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-violet-500 transition"
              >
                <option value="AGENT">Support Agent</option>
                <option value="ADMIN">Operations Admin</option>
              </select>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-950/35 border border-red-500/20 text-red-400 text-sm rounded-xl">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-slate-100 font-bold transition duration-200 shadow-lg shadow-violet-600/20"
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>
        )}

        {!success && (
          <>
            <div className="relative flex items-center justify-center my-6">
              <span className="absolute px-3 bg-slate-950 text-xs text-slate-500 uppercase tracking-wider">Or</span>
              <div className="w-full border-t border-slate-900" />
            </div>

            <div className="flex justify-center min-h-[44px]">
              <div id="google-signup-btn" className="w-full" />
            </div>
          </>
        )}

        <div className="mt-6 text-center text-sm text-slate-400 border-t border-slate-900 pt-4">
          Already have an account?{' '}
          <Link href="/" className="text-violet-400 hover:underline font-semibold">
            Log In
          </Link>
        </div>
      </div>
    </div>
  );
}

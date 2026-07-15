'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Shield, UserCheck, Edit3, Eye, FileText, ArrowRight, Activity, Cloud } from 'lucide-react';

export default function EntryPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123'); // Default password for easy demo
  const [roleSelection, setRoleSelection] = useState<'OWNER' | 'EDITOR' | 'VIEWER'>('OWNER');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-login helper function
  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customRole?: 'OWNER' | 'EDITOR' | 'VIEWER') => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const targetEmail = customEmail || email || 'owner@edtech.com';
    const targetRole = customRole || roleSelection;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail.trim(),
          password: password,
          role: targetRole,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Save JWT token
        localStorage.setItem('token', data.token);
        // Save cookie for Next.js Middleware route guard
        document.cookie = `token=${data.token}; path=/; max-age=2592000`; // 30 days
        
        // Redirect to default workspace document
        router.push('/documents/default-doc');
      } else {
        setErrorMsg(data.message || 'Login failed');
      }
    } catch (err: any) {
      setErrorMsg('Could not connect to authentication services.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[#050507]">
      {/* Decorative background glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-4xl w-full flex flex-col items-center gap-10 z-10 animate-fade-in-up">
        
        {/* Branding header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/20 bg-blue-950/20 text-blue-400 text-xs font-semibold animate-glow">
            <Activity className="h-3.5 w-3.5 animate-pulse" />
            <span>Local-First Sync Engine</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
            Edtech <span className="bg-gradient-to-r from-blue-500 via-indigo-400 to-violet-400 bg-clip-text text-transparent">Collaborative Studio</span>
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            Edit documents with zero network lag, save local checkpoints, and automatically synchronize changes when online.
          </p>
        </div>

        {/* Action Panel Split Grid */}
        <div className="w-full grid grid-cols-1 md:grid-cols-5 gap-6">
          
          {/* Quick Access Card Selection Column */}
          <div className="md:col-span-3 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider pl-1">
              Select an Evaluation Profile:
            </h2>

            {/* Owner Role Card */}
            <button
              onClick={() => handleLogin(undefined, 'owner@edtech.com', 'OWNER')}
              className="flex items-start gap-4 p-4 rounded-xl border border-white/5 bg-white/2 bg-opacity-10 hover:bg-white/5 hover:border-blue-500/30 transition-all duration-300 ease-out text-left group cursor-pointer hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-[1px] active:scale-[0.99]"
            >
              <div className="bg-blue-600/20 border border-blue-500/20 p-2.5 rounded-lg text-blue-400 group-hover:bg-blue-600/30 group-hover:text-blue-300 transition-colors group-hover:scale-105 duration-200">
                <Shield className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Owner Account</h3>
                  <ArrowRight className="h-4 w-4 text-neutral-500 group-hover:text-white group-hover:translate-x-1 transition-all duration-200" />
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Full controls. Create version snapshots, edit document text, and perform version restorations.
                </p>
                <span className="text-[10px] text-blue-400 font-mono mt-2 block">owner@edtech.com</span>
              </div>
            </button>

            {/* Editor Role Card */}
            <button
              onClick={() => handleLogin(undefined, 'editor@edtech.com', 'EDITOR')}
              className="flex items-start gap-4 p-4 rounded-xl border border-white/5 bg-white/2 bg-opacity-10 hover:bg-white/5 hover:border-indigo-500/30 transition-all duration-300 ease-out text-left group cursor-pointer hover:shadow-lg hover:shadow-indigo-500/5 hover:-translate-y-[1px] active:scale-[0.99]"
            >
              <div className="bg-indigo-600/20 border border-indigo-500/20 p-2.5 rounded-lg text-indigo-400 group-hover:bg-indigo-600/30 group-hover:text-indigo-300 transition-colors group-hover:scale-105 duration-200">
                <Edit3 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Editor Account</h3>
                  <ArrowRight className="h-4 w-4 text-neutral-500 group-hover:text-white group-hover:translate-x-1 transition-all duration-200" />
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Standard editor rights. Can edit text and capture version snapshots. Cannot restore old versions.
                </p>
                <span className="text-[10px] text-indigo-400 font-mono mt-2 block">editor@edtech.com</span>
              </div>
            </button>

            {/* Viewer Role Card */}
            <button
              onClick={() => handleLogin(undefined, 'viewer@edtech.com', 'VIEWER')}
              className="flex items-start gap-4 p-4 rounded-xl border border-white/5 bg-white/2 bg-opacity-10 hover:bg-white/5 hover:border-neutral-500/30 transition-all duration-300 ease-out text-left group cursor-pointer hover:shadow-lg hover:shadow-neutral-500/5 hover:-translate-y-[1px] active:scale-[0.99]"
            >
              <div className="bg-neutral-800 border border-neutral-700 p-2.5 rounded-lg text-neutral-400 group-hover:bg-neutral-700 group-hover:text-neutral-300 transition-colors group-hover:scale-105 duration-200">
                <Eye className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Viewer Account</h3>
                  <ArrowRight className="h-4 w-4 text-neutral-500 group-hover:text-white group-hover:translate-x-1 transition-all duration-200" />
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Read-only access. Strictly blocked by the API and database levels from pushing updates.
                </p>
                <span className="text-[10px] text-neutral-400 font-mono mt-2 block">viewer@edtech.com</span>
              </div>
            </button>
          </div>

          {/* Form Login Column */}
          <div className="md:col-span-2 flex flex-col hover:translate-y-[-1px] transition-transform duration-300">
            <div className="flex-1 p-5 rounded-2xl border border-white/5 bg-black/40 backdrop-blur-lg flex flex-col justify-between shadow-xl">
              <div>
                <h3 className="font-semibold text-white text-base mb-1">Custom Login</h3>
                <p className="text-xs text-neutral-400 mb-4">Register or sign-in with your own credentials.</p>

                {errorMsg && (
                  <div className="bg-red-950/30 border border-red-500/20 text-red-400 rounded p-2 text-xs mb-3">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={(e) => handleLogin(e)} className="space-y-3">
                  <div>
                    <label className="text-[10px] text-neutral-500 font-semibold block mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="you@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-500 font-semibold block mb-1">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-neutral-500 font-semibold block mb-1">Default Role</label>
                    <select
                      value={roleSelection}
                      onChange={(e) => setRoleSelection(e.target.value as any)}
                      className="w-full bg-neutral-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="OWNER">Owner</option>
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-4 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold py-2.5 cursor-pointer shadow-lg shadow-blue-500/10"
                  >
                    {loading ? 'Authenticating...' : 'Sign In / Register'}
                  </button>
                </form>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 text-[10px] text-neutral-500 leading-normal flex items-center gap-1.5 justify-center">
                <Cloud className="h-3 w-3 text-blue-500" />
                <span>Connected to Local-First storage sync engine.</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

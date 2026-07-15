'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Edit3, Eye, ArrowRight, Activity, Cloud, Sun, Moon } from 'lucide-react';

export default function EntryPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [roleSelection, setRoleSelection] = useState<'OWNER' | 'EDITOR' | 'VIEWER'>('OWNER');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const initial = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

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
          password,
          role: targetRole,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('token', data.token);
        document.cookie = `token=${data.token}; path=/; max-age=2592000`;
        router.push('/documents/default-doc');
      } else {
        setErrorMsg(data.message || 'Login failed');
      }
    } catch (err) {
      setErrorMsg('Authentication service unavailable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden bg-background text-foreground transition-colors duration-300">
      <div className="absolute top-0 right-0 p-6 z-20">
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-all duration-200 cursor-pointer"
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-500" />}
        </button>
      </div>

      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-blue-600/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-violet-600/5 rounded-full blur-[140px] pointer-events-none" />
      
      <div className="max-w-4xl w-full flex flex-col items-center gap-12 z-10 animate-fade-in-up">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/10 bg-blue-500/5 text-blue-500 dark:text-blue-400 text-[11px] font-medium tracking-wide">
            <Activity className="h-3.5 w-3.5 animate-pulse" />
            <span>Local-First Sync Engine</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Edtech <span className="bg-gradient-to-r from-blue-500 via-indigo-400 to-violet-500 bg-clip-text text-transparent">Collaborative Studio</span>
          </h1>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto leading-relaxed">
            Zero network lag, local document check-pointing, and automatic cloud synchronization.
          </p>
        </div>

        <div className="w-full grid grid-cols-1 md:grid-cols-5 gap-8">
          <div className="md:col-span-3 flex flex-col gap-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1">
              Select Workspace Profile
            </h2>

            <button
              onClick={() => handleLogin(undefined, 'owner@edtech.com', 'OWNER')}
              className="flex items-start gap-4 p-5 rounded-xl border border-border bg-card hover:bg-muted text-card-foreground transition-all duration-300 ease-out text-left group cursor-pointer hover:shadow-[0_0_20px_rgba(59,130,246,0.04)] active:scale-[0.99]"
            >
              <div className="bg-blue-600/10 border border-blue-500/20 p-3 rounded-lg text-blue-500 dark:text-blue-400 group-hover:bg-blue-600/20 transition-colors duration-300">
                <Shield className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Owner Account</h3>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all duration-300" />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 leading-normal">
                  Administrative access. Restore version snapshots and write modifications.
                </p>
                <span className="text-[10px] text-blue-500 dark:text-blue-400 font-mono mt-2.5 block font-medium">owner@edtech.com</span>
              </div>
            </button>

            <button
              onClick={() => handleLogin(undefined, 'editor@edtech.com', 'EDITOR')}
              className="flex items-start gap-4 p-5 rounded-xl border border-border bg-card hover:bg-muted text-card-foreground transition-all duration-300 ease-out text-left group cursor-pointer hover:shadow-[0_0_20px_rgba(99,102,241,0.04)] active:scale-[0.99]"
            >
              <div className="bg-indigo-600/10 border border-indigo-500/20 p-3 rounded-lg text-indigo-500 dark:text-indigo-400 group-hover:bg-indigo-600/20 transition-colors duration-300">
                <Edit3 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Editor Account</h3>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all duration-300" />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 leading-normal">
                  Standard edit access. Write document content and capture version snapshots.
                </p>
                <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-mono mt-2.5 block font-medium">editor@edtech.com</span>
              </div>
            </button>

            <button
              onClick={() => handleLogin(undefined, 'viewer@edtech.com', 'VIEWER')}
              className="flex items-start gap-4 p-5 rounded-xl border border-border bg-card hover:bg-muted text-card-foreground transition-all duration-300 ease-out text-left group cursor-pointer hover:shadow-[0_0_20px_rgba(163,163,163,0.04)] active:scale-[0.99]"
            >
              <div className="bg-neutral-500/10 border border-neutral-500/20 p-3 rounded-lg text-neutral-500 dark:text-neutral-400 group-hover:bg-neutral-500/20 transition-colors duration-300">
                <Eye className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Viewer Account</h3>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all duration-300" />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 leading-normal">
                  Read-only view. Prevented from submitting any document modifications.
                </p>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono mt-2.5 block font-medium">viewer@edtech.com</span>
              </div>
            </button>
          </div>

          <div className="md:col-span-2 flex flex-col hover:translate-y-[-1px] transition-transform duration-300">
            <div className="flex-1 p-6 rounded-2xl border border-border bg-card flex flex-col justify-between shadow-lg">
              <div>
                <h3 className="font-semibold text-base mb-1">Custom Portal</h3>
                <p className="text-xs text-muted-foreground mb-6">Authenticate via custom workspace credentials.</p>

                {errorMsg && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 rounded-lg px-3 py-2 text-xs mb-4">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={(e) => handleLogin(e)} className="space-y-4">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-semibold block mb-1.5 tracking-wider uppercase">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="you@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-xs text-foreground focus:outline-none focus:border-primary transition-colors placeholder-neutral-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-semibold block mb-1.5 tracking-wider uppercase">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-xs text-foreground focus:outline-none focus:border-primary transition-colors placeholder-neutral-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-semibold block mb-1.5 tracking-wider uppercase">Session Role</label>
                    <select
                      value={roleSelection}
                      onChange={(e) => setRoleSelection(e.target.value as any)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-xs text-foreground focus:outline-none focus:border-primary transition-colors cursor-pointer"
                    >
                      <option value="OWNER">Owner</option>
                      <option value="EDITOR">Editor</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-6 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-semibold py-3 cursor-pointer shadow-md transition-all duration-300"
                  >
                    {loading ? 'Authenticating...' : 'Sign In / Register'}
                  </button>
                </form>
              </div>

              <div className="mt-8 pt-4 border-t border-border text-[10px] text-muted-foreground leading-normal flex items-center gap-2 justify-center">
                <Cloud className="h-3 w-3 text-blue-500" />
                <span>Synchronized connection active.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



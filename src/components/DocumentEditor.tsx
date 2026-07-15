'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getLocalDocument as getLocalDoc, saveLocalDocument, queueMutation } from '@/lib/indexedDb';
import { syncEngine } from '@/lib/syncEngine';
import NetworkStatus from './NetworkStatus';
import VersionHistory from './VersionHistory';
import Footer from './Footer';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sparkles, 
  Wifi, 
  WifiOff, 
  ChevronRight, 
  Save, 
  BookOpen, 
  FileText,
  User,
  RotateCcw,
  History
} from 'lucide-react';

interface DocumentEditorProps {
  documentId: string;
}

interface UserSession {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
}

export default function DocumentEditor({ documentId }: DocumentEditorProps) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [version, setVersion] = useState(1);
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [mockOffline, setMockOffline] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(window.atob(token.split('.')[1]));
        setUser({
          id: payload.id,
          name: payload.name,
          email: payload.email,
          role: payload.role,
        });
      } catch (err) {
        console.error('Session parse failed', err);
      }
    }

    const storedOffline = localStorage.getItem('mock-offline') === 'true';
    setMockOffline(storedOffline);

    const loadDoc = async () => {
      const local = await getLocalDoc(documentId);
      if (local) {
        setTitle(local.title);
        setContent(local.content);
        setVersion(local.version);
        setUpdatedAt(local.updatedAt);
      } else {
        const defaultDoc = {
          id: documentId,
          title: 'Untitled Document',
          content: 'Start typing here...',
          version: 1,
          updatedAt: Date.now(),
          isDirty: 1,
        };
        await saveLocalDocument(defaultDoc);
        setTitle(defaultDoc.title);
        setContent(defaultDoc.content);
        setVersion(defaultDoc.version);
        setUpdatedAt(defaultDoc.updatedAt);
        
        await queueMutation(documentId, 'create', {
          title: defaultDoc.title,
          content: defaultDoc.content,
          version: defaultDoc.version,
          updatedAt: defaultDoc.updatedAt,
        });
      }
      syncEngine.setActiveDocument(documentId);
    };

    loadDoc();
  }, [documentId]);

  const handleOfflineToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setMockOffline(val);
    localStorage.setItem('mock-offline', val ? 'true' : 'false');
    window.dispatchEvent(new Event(val ? 'offline' : 'online'));
  };

  const handleRoleSwitch = async (newRole: 'OWNER' | 'EDITOR' | 'VIEWER') => {
    if (!user) return;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: 'password123',
          role: newRole
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('token', data.token);
          document.cookie = `token=${data.token}; path=/; max-age=2592000`;
          setUser({ ...user, role: newRole });
          syncEngine.triggerSync();
        }
      }
    } catch (err) {
      console.error('Role switch failed', err);
    }
  };

  const persistChanges = (updatedTitle: string, updatedContent: string) => {
    if (user?.role === 'VIEWER') return;
    setIsSavingLocal(true);
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const nextUpdatedAt = Date.now();
      await queueMutation(documentId, 'update', {
        title: updatedTitle,
        content: updatedContent,
        version,
        updatedAt: nextUpdatedAt,
      });

      setUpdatedAt(nextUpdatedAt);
      setIsSavingLocal(false);
      syncEngine.triggerSync();
    }, 400);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    persistChanges(val, content);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    persistChanges(title, val);
  };

  const handleRestoreVersion = async (restoredContent: string, restoredTitle: string) => {
    if (user?.role === 'VIEWER') return;
    const nextVersion = version + 1;
    const nextUpdatedAt = Date.now();

    setTitle(restoredTitle);
    setContent(restoredContent);
    setVersion(nextVersion);
    setUpdatedAt(nextUpdatedAt);

    await queueMutation(documentId, 'restore', {
      title: restoredTitle,
      content: restoredContent,
      version: nextVersion,
      updatedAt: nextUpdatedAt,
    });

    syncEngine.triggerSync();
  };

  const handlePreviewVersion = (c: string, ver: number | null) => {
    setPreviewContent(ver !== null ? c : null);
    setPreviewVersion(ver);
  };

  const triggerInlineAi = async () => {
    if (user?.role === 'VIEWER') return;
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursor = textarea.selectionStart;
    const contextText = content.substring(0, cursor);
    
    if (!contextText.trim()) return;
    setIsAiLoading(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/ai/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: contextText }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.text) {
          const aiText = data.text;
          const newContent = content.substring(0, cursor) + aiText + content.substring(cursor);
          setContent(newContent);
          persistChanges(title, newContent);

          setTimeout(() => {
            textarea.focus();
            textarea.selectionStart = cursor + aiText.length;
            textarea.selectionEnd = cursor + aiText.length;
          }, 50);
        }
      }
    } catch (err) {
      console.error('AI Completion failed', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        triggerInlineAi();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, title, user]);

  const isReadOnly = user?.role === 'VIEWER' || previewVersion !== null;

  return (
    <div className="flex flex-col flex-1 h-screen bg-[#020204] overflow-hidden">
      <header className="glass-panel w-full flex flex-col md:flex-row md:items-center justify-between px-6 py-4 gap-4 z-10 border-b border-white/[0.04]">
        <div className="flex items-center gap-3.5">
          <div className="bg-blue-500/10 border border-blue-500/20 p-2.5 rounded-lg text-blue-400 shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            {isReadOnly ? (
              <h1 className="text-base sm:text-lg font-semibold text-neutral-200 flex items-center gap-2 flex-wrap">
                <span>{title}</span>
                {previewVersion !== null && (
                  <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/25 px-2.5 py-0.5 rounded-full font-medium">
                    Previewing v{previewVersion}
                  </span>
                )}
                {user?.role === 'VIEWER' && previewVersion === null && (
                  <span className="text-[10px] bg-neutral-800 text-neutral-400 border border-neutral-700/50 px-2.5 py-0.5 rounded-full font-medium">
                    Read Only
                  </span>
                )}
              </h1>
            ) : (
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                placeholder="Untitled Document"
                className="bg-transparent text-base sm:text-lg font-semibold text-white focus:outline-none border-b border-transparent focus:border-white/20 px-1 py-0.5 transition-all w-full max-w-[200px] sm:max-w-xs"
              />
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 mt-1">
              <span>Version: {version}</span>
              <ChevronRight className="h-3 w-3" />
              <span>Synced: {mounted ? new Date(updatedAt).toLocaleTimeString() : ''}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto md:justify-end">
          <div className="flex items-center gap-2.5">
            <NetworkStatus />
            <label className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-white/5 bg-white/[0.02] text-xs font-medium cursor-pointer text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-all select-none">
              {mockOffline ? (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-500" />
                  <span className="hidden sm:inline">Offline Mode</span>
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5 text-neutral-400" />
                  <span className="hidden sm:inline">Simulate Offline</span>
                </>
              )}
              <input
                type="checkbox"
                checked={mockOffline}
                onChange={handleOfflineToggle}
                className="hidden"
              />
            </label>
          </div>

          {user && (
            <div className="flex items-center gap-3 border-l border-white/10 pl-4">
              <div className="flex items-center gap-2 text-xs bg-black/35 border border-white/5 rounded-lg px-3 py-2">
                <User className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-neutral-300 font-medium hidden md:inline">{user.name}</span>
                <span className="text-neutral-500 text-[10px] uppercase font-semibold">[{user.role}]</span>
              </div>
              <Select
                value={user.role}
                onValueChange={(val: string) => handleRoleSwitch(val as any)}
              >
                <SelectTrigger className="w-[105px] sm:w-[120px] bg-[#0d0d0f] border-white/10">
                  <SelectValue placeholder="Select Role" />
                </SelectTrigger>
                <SelectContent className="bg-[#0f0f12] border-white/10 text-white">
                  <SelectItem value="OWNER">Owner</SelectItem>
                  <SelectItem value="EDITOR">Editor</SelectItem>
                  <SelectItem value="VIEWER">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSidebar(!showSidebar)}
            className="flex items-center gap-2 lg:hidden text-xs border border-white/10 hover:bg-white/5 px-3 py-2 cursor-pointer bg-transparent text-white"
            title="Toggle Version History"
          >
            <History className="h-4 w-4 text-neutral-400" />
            <span className="hidden sm:inline">Versions</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <main className="flex-1 flex flex-col p-6 overflow-y-auto relative bg-[#030304]">
          {previewVersion !== null && (
            <div className="w-full flex items-center justify-between mb-5 px-5 py-3.5 rounded-xl border border-blue-500/20 bg-blue-950/15 text-sm text-blue-200 animate-slide-in">
              <div className="flex items-center gap-2.5">
                <BookOpen className="h-4 w-4 text-blue-400" />
                <span>Viewing history checkpoint version **{previewVersion}**. Current editor state is preserved.</span>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handlePreviewVersion('', null)}
                  className="text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  Exit Preview
                </Button>
                {user?.role !== 'VIEWER' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (previewContent) handleRestoreVersion(previewContent, title);
                    }}
                    className="flex items-center gap-1.5 cursor-pointer bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-lg"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Restore Version</span>
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 glass-card rounded-2xl border border-white/5 p-6 flex flex-col relative focus-within:border-indigo-500/20 transition-all duration-300">
            <textarea
              ref={textareaRef}
              value={previewContent !== null ? previewContent : content}
              onChange={handleContentChange}
              disabled={isReadOnly}
              placeholder={isReadOnly ? 'Viewing only...' : 'Write your code and thoughts here...'}
              className="flex-1 bg-transparent resize-none focus:outline-none text-neutral-200 placeholder-neutral-700 font-mono text-sm leading-relaxed"
            />

            <div className="absolute bottom-5 right-5 flex items-center gap-4">
              {isSavingLocal && (
                <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 bg-black/40 border border-white/5 px-3 py-1 rounded-full animate-pulse">
                  <Save className="h-3 w-3" />
                  <span>Syncing locally...</span>
                </div>
              )}
              {user?.role !== 'VIEWER' && previewVersion === null && (
                <Button
                  onClick={triggerInlineAi}
                  disabled={isAiLoading || !content.trim()}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 bg-indigo-950/20 hover:bg-indigo-900/30 text-indigo-400 border border-indigo-500/25 rounded-full shadow-lg hover:shadow-indigo-500/10 cursor-pointer text-xs px-4 py-2 transition-all duration-300"
                  title="Autocomplete text at cursor (Ctrl+Space)"
                >
                  <Sparkles className={`h-3.5 w-3.5 ${isAiLoading ? 'animate-bounce text-indigo-300' : ''}`} />
                  <span>{isAiLoading ? 'Autocompleting...' : 'Autocomplete'}</span>
                </Button>
              )}
            </div>
          </div>
        </main>

        {showSidebar && (
          <div 
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-20 lg:hidden transition-all duration-300"
            onClick={() => setShowSidebar(false)}
          />
        )}

        <aside className={`
          fixed inset-y-0 right-0 z-30 lg:relative lg:inset-auto lg:z-10
          transition-transform duration-300 ease-in-out transform
          ${showSidebar ? 'translate-x-0 shadow-2xl' : 'translate-x-full lg:translate-x-0'}
          h-full lg:h-auto lg:block shrink-0
        `}>
          <VersionHistory
            documentId={documentId}
            currentContent={content}
            currentTitle={title}
            currentVersion={version}
            onPreviewVersion={handlePreviewVersion}
            onRestoreVersion={handleRestoreVersion}
            userRole={user?.role || 'VIEWER'}
            onClose={() => setShowSidebar(false)}
          />
        </aside>
      </div>

      <Footer />
    </div>
  );
}


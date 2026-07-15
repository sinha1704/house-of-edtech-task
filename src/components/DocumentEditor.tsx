'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { getLocalDocument as getLocalDoc, saveLocalDocument, queueMutation, localDb, type LocalDocument } from '@/lib/indexedDb';
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
  ShieldCheck, 
  ChevronRight, 
  Save, 
  BookOpen, 
  FileText,
  User,
  ArrowRight,
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
  
  // Preview state (Time travel)
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);

  // Status indicators
  const [isSavingLocal, setIsSavingLocal] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [mockOffline, setMockOffline] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [, startTransition] = useTransition();

  // 1. Initial login verification & Document loading
  useEffect(() => {
    // Parse JWT token from localStorage
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payloadBase64 = token.split('.')[1];
        const payload = JSON.parse(window.atob(payloadBase64));
        setUser({
          id: payload.id,
          name: payload.name,
          email: payload.email,
          role: payload.role,
        });
      } catch (err) {
        console.error('Failed to parse user session token', err);
      }
    }

    // Set mock offline state from storage
    const storedOffline = localStorage.getItem('mock-offline') === 'true';
    setMockOffline(storedOffline);

    // Load document from local IndexedDB
    const loadDoc = async () => {
      const local = await getLocalDoc(documentId);
      if (local) {
        setTitle(local.title);
        setContent(local.content);
        setVersion(local.version);
        setUpdatedAt(local.updatedAt);
      } else {
        // Create initial default document locally
        const defaultDoc: LocalDocument = {
          id: documentId,
          title: 'Unfinished Masterpiece',
          content: 'Start writing your next revolution here...',
          version: 1,
          updatedAt: Date.now(),
          isDirty: 1,
        };
        await saveLocalDocument(defaultDoc);
        setTitle(defaultDoc.title);
        setContent(defaultDoc.content);
        setVersion(defaultDoc.version);
        setUpdatedAt(defaultDoc.updatedAt);
        
        // Queue create mutation
        await queueMutation(documentId, 'create', {
          title: defaultDoc.title,
          content: defaultDoc.content,
          version: defaultDoc.version,
          updatedAt: defaultDoc.updatedAt,
        });
      }

      // Hook document up to sync engine
      syncEngine.setActiveDocument(documentId);
    };

    loadDoc();
  }, [documentId]);

  // 2. Mock Offline network toggle handler
  const handleOfflineToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setMockOffline(val);
    localStorage.setItem('mock-offline', val ? 'true' : 'false');
    
    if (val) {
      window.dispatchEvent(new Event('offline'));
    } else {
      window.dispatchEvent(new Event('online'));
    }
  };

  // 3. User Role Switcher for RBAC evaluation
  const handleRoleSwitch = async (newRole: 'OWNER' | 'EDITOR' | 'VIEWER') => {
    if (!user) return;
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: 'password123', // constant pass for evaluation login
          role: newRole
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('token', data.token);
          // Set cookie for middleware
          document.cookie = `token=${data.token}; path=/; max-age=2592000`;
          setUser({
            ...user,
            role: newRole
          });
          console.log(`[Auth] Role switched to ${newRole}`);
          
          // Re-trigger sync to update authorization state
          syncEngine.triggerSync();
        }
      }
    } catch (err) {
      console.error('Role switch failed', err);
    }
  };

  // 4. Debounced Local DB Mutation Queue writer (Ensures 0ms typing lag)
  const persistChanges = (updatedTitle: string, updatedContent: string) => {
    if (user?.role === 'VIEWER') return; // Viewers cannot persist changes

    setIsSavingLocal(true);
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const nextVersion = version;
      const nextUpdatedAt = Date.now();

      await queueMutation(documentId, 'update', {
        title: updatedTitle,
        content: updatedContent,
        version: nextVersion,
        updatedAt: nextUpdatedAt,
      });

      setUpdatedAt(nextUpdatedAt);
      setIsSavingLocal(false);

      // Notify sync engine
      syncEngine.triggerSync();
    }, 400); // 400ms debounce
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

  // 5. Version History Restoration / Time-travel implementation
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

  const handlePreviewVersion = (content: string, ver: number | null) => {
    setPreviewContent(ver !== null ? content : null);
    setPreviewVersion(ver);
  };

  // 6. AI Completion triggered inline
  const triggerInlineAi = async () => {
    if (user?.role === 'VIEWER') return;
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = content.substring(0, cursorPosition);
    
    if (!textBeforeCursor.trim()) return;

    setIsAiLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/ai/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: textBeforeCursor }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.text) {
          const aiText = data.text;
          const newContent = 
            content.substring(0, cursorPosition) + 
            aiText + 
            content.substring(cursorPosition);
          
          setContent(newContent);
          persistChanges(title, newContent);

          // Return focus and move selection cursor
          setTimeout(() => {
            textarea.focus();
            textarea.selectionStart = cursorPosition + aiText.length;
            textarea.selectionEnd = cursorPosition + aiText.length;
          }, 50);
        }
      }
    } catch (err) {
      console.error('[AI Complete] Request failed', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Listen to keyboard shortcut (Ctrl+Space) for AI Autocomplete
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
    <div className="flex flex-col flex-1 h-screen bg-[#070709] overflow-hidden">
      {/* Upper Navigation Glass Panel */}
      <header className="glass-panel w-full flex flex-col md:flex-row md:items-center justify-between px-4 sm:px-6 py-3 sm:py-4 gap-3 sm:gap-4 z-10 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600/20 border border-blue-500/30 p-2 rounded-lg text-blue-400 shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            {isReadOnly ? (
              <h1 className="text-base sm:text-lg font-bold text-neutral-300 flex items-center gap-2 flex-wrap">
                <span>{title}</span>
                {previewVersion !== null && (
                  <span className="text-[10px] sm:text-xs bg-blue-900/40 text-blue-300 border border-blue-800/40 px-2 py-0.5 rounded-full">
                    Previewing v{previewVersion}
                  </span>
                )}
                {user?.role === 'VIEWER' && previewVersion === null && (
                  <span className="text-[10px] sm:text-xs bg-neutral-800 text-neutral-400 border border-neutral-700 px-2 py-0.5 rounded-full">
                    View Only
                  </span>
                )}
              </h1>
            ) : (
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                placeholder="Untitled Document"
                className="bg-transparent text-base sm:text-lg font-bold text-white focus:outline-none border-b border-transparent focus:border-white/20 px-1 py-0.5 transition-all w-full max-w-[200px] sm:max-w-xs"
              />
            )}
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-neutral-500 mt-0.5">
              <span>Local version: {version}</span>
              <ChevronRight className="h-3 w-3" />
              <span>Last updated: {new Date(updatedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full md:w-auto md:justify-end">
          {/* Network Indicators */}
          <div className="flex items-center gap-2">
            <NetworkStatus />
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/5 bg-white/5 text-xs font-medium cursor-pointer text-neutral-300 hover:text-white transition-all select-none">
              {mockOffline ? (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-500" />
                  <span className="hidden sm:inline">Simulate Offline</span>
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

          {/* RBAC Role Switcher */}
          {user && (
            <div className="flex items-center gap-2 border-l border-white/10 pl-3 sm:pl-4">
              <div className="flex items-center gap-1.5 text-xs bg-black/40 border border-white/5 rounded-lg px-2.5 py-1.5">
                <User className="h-3.5 w-3.5 text-neutral-400 animate-pulse" />
                <span className="text-neutral-300 font-semibold hidden md:inline">{user.name}</span>
                <span className="text-neutral-500">({user.role.toLowerCase()})</span>
              </div>
              <Select
                value={user.role}
                onValueChange={(val: string) => handleRoleSwitch(val as any)}
              >
                <SelectTrigger className="w-[105px] sm:w-[120px]">
                  <SelectValue placeholder="Select Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">Role: Owner</SelectItem>
                  <SelectItem value="EDITOR">Role: Editor</SelectItem>
                  <SelectItem value="VIEWER">Role: Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Sidebar Toggle (Only visible on small devices) */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSidebar(!showSidebar)}
            className="flex items-center gap-1.5 lg:hidden text-xs border border-white/10 hover:bg-white/5 px-2.5 py-1.5 cursor-pointer"
            title="Toggle Version History"
          >
            <History className="h-4 w-4 text-neutral-400" />
            <span className="hidden sm:inline">Versions</span>
          </Button>
        </div>
      </header>

      {/* Main Workspace Grid */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Core Editor Column */}
        <main className="flex-1 flex flex-col p-6 overflow-y-auto relative">
          
          {/* Snapshots Preview alert banner */}
          {previewVersion !== null && (
            <div className="w-full flex items-center justify-between mb-4 px-4 py-3 rounded-lg border border-blue-500/30 bg-blue-950/20 text-sm text-blue-200 animate-slide-in">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                <span>You are previewing document state **version {previewVersion}**. Your current session remains safe.</span>
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
                    className="flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Restore this Version</span>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Text Area */}
          <div className="flex-1 glass-card rounded-2xl border border-white/5 p-6 flex flex-col relative">
            <textarea
              ref={textareaRef}
              value={previewContent !== null ? previewContent : content}
              onChange={handleContentChange}
              disabled={isReadOnly}
              placeholder={isReadOnly ? 'Viewing only...' : 'Unfetter your coding thoughts...'}
              className="flex-1 bg-transparent resize-none focus:outline-none text-neutral-200 placeholder-neutral-600 font-mono text-sm leading-relaxed"
            />

            {/* Micro status floating bar */}
            <div className="absolute bottom-4 right-4 flex items-center gap-3">
              {isSavingLocal && (
                <div className="flex items-center gap-1 text-[10px] text-neutral-500 bg-black/40 border border-white/5 px-2.5 py-1 rounded-full animate-pulse">
                  <Save className="h-3 w-3" />
                  <span>Saving local index...</span>
                </div>
              )}
              {user?.role !== 'VIEWER' && previewVersion === null && (
                <Button
                  onClick={triggerInlineAi}
                  disabled={isAiLoading || !content.trim()}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5 bg-[#0f172a] hover:bg-indigo-950 text-indigo-400 border border-indigo-500/20 rounded-full shadow-lg hover:shadow-indigo-500/10 cursor-pointer"
                  title="Generate completion at cursor (Ctrl+Space)"
                >
                  <Sparkles className={`h-3.5 w-3.5 ${isAiLoading ? 'animate-bounce text-violet-400' : ''}`} />
                  <span>{isAiLoading ? 'AI Autocompleting...' : 'Autocomplete'}</span>
                </Button>
              )}
            </div>
          </div>
        </main>

        {/* Responsive Drawer Backdrop overlay for mobile */}
        {showSidebar && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden transition-all duration-300"
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Sidebar Component with responsive slide-over drawer layout */}
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

      {/* Global Application Footer */}
      <Footer />
    </div>
  );
}

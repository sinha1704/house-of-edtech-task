'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { History, Plus, RotateCcw, BrainCircuit, RefreshCw, Eye, X } from 'lucide-react';

interface Snapshot {
  id: string;
  version: number;
  title: string;
  content: string;
  comment: string;
  createdAt: string;
  createdBy: {
    name: string;
    role: string;
  };
}

interface VersionHistoryProps {
  documentId: string;
  currentContent: string;
  currentTitle: string;
  currentVersion: number;
  onPreviewVersion: (content: string, version: number | null) => void;
  onRestoreVersion: (content: string, title: string) => Promise<void>;
  userRole: 'OWNER' | 'EDITOR' | 'VIEWER';
  onClose?: () => void;
}

export default function VersionHistory({
  documentId,
  currentContent,
  currentTitle,
  currentVersion,
  onPreviewVersion,
  onRestoreVersion,
  userRole,
  onClose,
}: VersionHistoryProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [creating, setCreating] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  
  // AI summary states
  const [aiSummary, setAiSummary] = useState<string>('');
  const [summarizing, setSummarizing] = useState(false);

  const fetchSnapshots = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/snapshot`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSnapshots(data.snapshots);
        }
      }
    } catch (err) {
      console.error('[VersionHistory] Error loading snapshots:', err);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole === 'VIEWER') return;
    if (!comment.trim()) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    setCreating(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/snapshot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: currentTitle,
          content: currentContent,
          version: currentVersion,
          comment: comment.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setComment('');
          fetchSnapshots();
        }
      }
    } catch (err) {
      console.error('[VersionHistory] Error creating snapshot:', err);
    } finally {
      setCreating(false);
    }
  };

  const handlePreview = (snap: Snapshot) => {
    if (previewingId === snap.id) {
      // Clear preview
      setPreviewingId(null);
      onPreviewVersion('', null);
    } else {
      setPreviewingId(snap.id);
      onPreviewVersion(snap.content, snap.version);
    }
  };

  const handleRestore = async (snap: Snapshot) => {
    if (userRole === 'VIEWER') return;
    await onRestoreVersion(snap.content, snap.title);
    setPreviewingId(null);
    onPreviewVersion('', null);
    // Refresh snapshot timeline
    setTimeout(fetchSnapshots, 800);
  };

  const generateAiSummary = async () => {
    if (snapshots.length === 0) {
      setAiSummary('Create some version snapshots first to generate a summary!');
      return;
    }

    setSummarizing(true);
    setAiSummary('');
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          snapshots: snapshots.map((s) => ({
            version: s.version,
            comment: s.comment,
            content: s.content.substring(0, 1000), // pass a snippet to save context budget
            createdAt: s.createdAt,
            createdBy: s.createdBy.name,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAiSummary(data.summary);
        } else {
          setAiSummary('Failed to generate summary: ' + (data.message || 'Unknown error'));
        }
      } else {
        setAiSummary('Failed to reach AI Summarization endpoint.');
      }
    } catch (err: any) {
      setAiSummary('Error generating summary: ' + err.message);
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-80 bg-neutral-900/60 border-l border-white/5 backdrop-blur-lg text-white">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <History className="h-4 w-4 text-primary" />
          <span>Version Snapshots</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchSnapshots}
            disabled={loading}
            className="text-neutral-400 hover:text-white transition-colors p-1"
            title="Refresh history"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden text-neutral-400 hover:text-white p-1"
              title="Close history"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Snapshot List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {userRole !== 'VIEWER' && (
          <form onSubmit={handleCreateSnapshot} className="space-y-2">
            <input
              type="text"
              placeholder="Save checkpoint comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={creating}
              className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/30 placeholder-neutral-500"
            />
            <button
              type="submit"
              disabled={creating || !comment.trim()}
              className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white rounded text-xs py-1.5 font-medium transition-colors cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              <span>Capture Snapshot</span>
            </button>
          </form>
        )}

        {/* Timeline */}
        <div className="relative border-l border-white/10 ml-2.5 pl-4 space-y-5 pt-2">
          {snapshots.length === 0 ? (
            <div className="text-neutral-500 text-xs py-4">No snapshots saved yet.</div>
          ) : (
            snapshots.map((snap) => {
              const isPreviewing = previewingId === snap.id;
              return (
                <div key={snap.id} className="relative group">
                  {/* Timeline bullet */}
                  <span className={`absolute -left-[21px] mt-1.5 h-2.5 w-2.5 rounded-full border transition-all duration-300 ${
                    isPreviewing 
                      ? 'bg-blue-500 border-blue-400 ring-4 ring-blue-900/30' 
                      : 'bg-neutral-800 border-neutral-700 group-hover:border-white/40'
                  }`} />
                  
                  <div className={`p-3 rounded-lg border transition-all duration-300 bg-[#0f0f13]/60 hover:bg-[#13131a]/85 ${
                    isPreviewing 
                      ? 'border-blue-500/40 bg-blue-950/10 shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)] scale-[1.01]' 
                      : 'border-white/5 hover:border-white/10 hover:translate-y-[-1px]'
                  }`}>
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
                      <span className="font-semibold text-neutral-300">v{snap.version}</span>
                      <span>{new Date(snap.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-xs text-neutral-200 break-words mb-2">{snap.comment}</p>
                    
                    <div className="flex items-center justify-between text-[9px] text-neutral-500 border-t border-white/5 pt-1.5">
                      <span>By: {snap.createdBy.name} ({snap.createdBy.role.toLowerCase()})</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handlePreview(snap)}
                          className="flex items-center gap-0.5 text-neutral-400 hover:text-white transition-colors"
                          title="Preview past version"
                        >
                          <Eye className="h-3 w-3" />
                          <span>{isPreviewing ? 'Close' : 'View'}</span>
                        </button>
                        {userRole !== 'VIEWER' && (
                          <button
                            onClick={() => handleRestore(snap)}
                            className="flex items-center gap-0.5 text-blue-400 hover:text-blue-300 transition-colors"
                            title="Restore this version"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Restore</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* AI Summary Panel */}
      <div className="p-4 border-t border-white/5 bg-black/30">
        <button
          onClick={generateAiSummary}
          disabled={summarizing}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-neutral-800 disabled:to-neutral-800 text-white rounded text-xs py-2 font-medium transition-all shadow-md cursor-pointer border border-violet-500/30"
        >
          {summarizing ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <BrainCircuit className="h-3.5 w-3.5" />
          )}
          <span>{summarizing ? 'Analyzing versions...' : 'AI Version Summary'}</span>
        </button>

        {aiSummary && (
          <div className="mt-3 p-2.5 rounded bg-violet-950/20 border border-violet-500/20 text-[11px] text-neutral-300 max-h-40 overflow-y-auto leading-relaxed">
            <span className="font-semibold text-violet-400 block mb-1">AI Snapshot Analysis:</span>
            <div className="whitespace-pre-wrap">{aiSummary}</div>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [aiSummary, setAiSummary] = useState<string>('');
  const [summarizing, setSummarizing] = useState(false);

  const fetchSnapshots = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/snapshot`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSnapshots(data.snapshots);
        }
      }
    } catch (err) {
      console.error('Error loading snapshots', err);
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
      console.error('Error creating snapshot', err);
    } finally {
      setCreating(false);
    }
  };

  const handlePreview = (snap: Snapshot) => {
    if (previewingId === snap.id) {
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
    setTimeout(fetchSnapshots, 800);
  };

  const generateAiSummary = async () => {
    if (snapshots.length === 0) {
      setAiSummary('Create checkpoints to analyze.');
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
            content: s.content.substring(0, 1000),
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
          setAiSummary('Failed: ' + (data.message || 'Error'));
        }
      } else {
        setAiSummary('Service unreachable.');
      }
    } catch (err) {
      setAiSummary('Error generating summary.');
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-80 bg-[#0b0b0e] border-l border-white/[0.04] backdrop-blur-lg text-white">
      <div className="p-4 border-b border-white/[0.04] flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium text-sm text-neutral-300">
          <History className="h-4 w-4 text-blue-400" />
          <span>Checkpoint Timeline</span>
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

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {userRole !== 'VIEWER' && (
          <form onSubmit={handleCreateSnapshot} className="space-y-2">
            <input
              type="text"
              placeholder="Snapshot description..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={creating}
              className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors placeholder-neutral-600"
            />
            <button
              type="submit"
              disabled={creating || !comment.trim()}
              className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-900 disabled:text-neutral-600 text-white rounded-lg text-xs py-2 font-semibold transition-colors cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              <span>Capture Snapshot</span>
            </button>
          </form>
        )}

        <div className="relative border-l border-white/5 ml-2.5 pl-4 space-y-4 pt-1">
          {snapshots.length === 0 ? (
            <div className="text-neutral-600 text-xs py-4">No checkpoints recorded yet.</div>
          ) : (
            snapshots.map((snap) => {
              const isPreviewing = previewingId === snap.id;
              return (
                <div key={snap.id} className="relative group">
                  <span className={`absolute -left-[21px] mt-2 h-2 w-2 rounded-full border transition-all duration-300 ${
                    isPreviewing 
                      ? 'bg-blue-500 border-blue-400 ring-4 ring-blue-900/30' 
                      : 'bg-neutral-800 border-neutral-700 group-hover:border-white/30'
                  }`} />
                  
                  <div className={`p-3.5 rounded-xl border transition-all duration-300 bg-white/[0.01] hover:bg-white/[0.03] ${
                    isPreviewing 
                      ? 'border-blue-500/25 bg-blue-950/5 shadow-[0_0_15px_-3px_rgba(59,130,246,0.1)]' 
                      : 'border-white/5 hover:border-white/10'
                  }`}>
                    <div className="flex items-center justify-between text-[10px] text-neutral-500 mb-1.5">
                      <span className="font-semibold text-neutral-400">v{snap.version}</span>
                      <span>{new Date(snap.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-xs text-neutral-300 break-words mb-3 leading-relaxed">{snap.comment}</p>
                    
                    <div className="flex items-center justify-between text-[9px] text-neutral-500 border-t border-white/5 pt-2">
                      <span>By: {snap.createdBy.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePreview(snap)}
                          className="flex items-center gap-0.5 text-neutral-400 hover:text-white transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>{isPreviewing ? 'Close' : 'View'}</span>
                        </button>
                        {userRole !== 'VIEWER' && (
                          <button
                            onClick={() => handleRestore(snap)}
                            className="flex items-center gap-0.5 text-blue-400 hover:text-blue-300 transition-colors font-medium"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
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

      <div className="p-4 border-t border-white/[0.04] bg-black/20">
        <button
          onClick={generateAiSummary}
          disabled={summarizing}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600/20 to-indigo-600/20 hover:from-violet-600/35 hover:to-indigo-600/35 text-indigo-300 rounded-lg text-xs py-2.5 font-semibold transition-all border border-indigo-500/20 cursor-pointer"
        >
          {summarizing ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <BrainCircuit className="h-3.5 w-3.5 text-indigo-400" />
          )}
          <span>Analyze Checkpoints</span>
        </button>

        {aiSummary && (
          <div className="mt-3 p-3 rounded-lg bg-indigo-950/10 border border-indigo-500/15 text-[11px] text-neutral-400 max-h-40 overflow-y-auto leading-relaxed">
            <span className="font-semibold text-indigo-400 block mb-1.5">AI Analysis:</span>
            <div className="whitespace-pre-wrap">{aiSummary}</div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { History, Plus, RotateCcw, Layers, RefreshCw, Eye, X, Trash2 } from 'lucide-react';

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
  const [timelineSummary, setTimelineSummary] = useState<string>('');
  const [analyzingTimeline, setAnalyzingTimeline] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

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

  const executeDelete = async (snapshotId: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const res = await fetch(`/api/documents/${documentId}/snapshot?snapshotId=${snapshotId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (previewingId === snapshotId) {
            onPreviewVersion('', null);
            setPreviewingId(null);
          }
          fetchSnapshots();
        } else {
          alert(data.message || 'Failed to delete snapshot');
        }
      } else {
        alert('Failed to delete snapshot');
      }
    } catch (err) {
      console.error('Error deleting snapshot', err);
      alert('Error deleting snapshot');
    }
  };

  const generateTimelineSummary = async () => {
    if (snapshots.length === 0) {
      setTimelineSummary('Create checkpoints to analyze.');
      return;
    }

    setAnalyzingTimeline(true);
    setTimelineSummary('');
    
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
          setTimelineSummary(data.summary);
        } else {
          setTimelineSummary('Failed: ' + (data.message || 'Error'));
        }
      } else {
        setTimelineSummary('Service unreachable.');
      }
    } catch (err) {
      setTimelineSummary('Error generating summary.');
    } finally {
      setAnalyzingTimeline(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-80 bg-card border-l border-border text-foreground">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium text-sm text-foreground">
          <History className="h-4 w-4 text-blue-500" />
          <span>Checkpoint Timeline</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchSnapshots}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 cursor-pointer"
            title="Refresh history"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden text-muted-foreground hover:text-foreground p-1 cursor-pointer"
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
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary transition-colors placeholder-neutral-500"
            />
            <button
              type="submit"
              disabled={creating || !comment.trim()}
              className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-muted disabled:text-neutral-500 text-white rounded-lg text-xs py-2 font-semibold transition-colors cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              <span>Capture Snapshot</span>
            </button>
          </form>
        )}

        <div className="relative border-l border-border ml-2.5 pl-4 space-y-4 pt-1">
          {snapshots.length === 0 ? (
            <div className="text-muted-foreground text-xs py-4">No checkpoints recorded yet.</div>
          ) : (
            snapshots.map((snap) => {
              const isPreviewing = previewingId === snap.id;
              return (
                <div key={snap.id} className="relative group">
                  <span className={`absolute -left-[21px] mt-2 h-2 w-2 rounded-full border transition-all duration-300 ${
                    isPreviewing 
                      ? 'bg-blue-500 border-blue-400 ring-4 ring-blue-500/20' 
                      : 'bg-muted border-border group-hover:border-foreground/35'
                  }`} />
                  
                  <div className={`p-3.5 rounded-xl border transition-all duration-300 bg-background/50 hover:bg-background ${
                    isPreviewing 
                      ? 'border-blue-500/30 bg-blue-500/[0.03] shadow-[0_0_15px_-3px_rgba(59,130,246,0.06)]' 
                      : 'border-border'
                  }`}>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                      <span className="font-semibold">v{snap.version}</span>
                      <span>{new Date(snap.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-xs text-foreground break-words mb-3 leading-relaxed">{snap.comment}</p>
                    
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground border-t border-border pt-2">
                      <span>By: {snap.createdBy.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePreview(snap)}
                          className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>{isPreviewing ? 'Close' : 'View'}</span>
                        </button>
                        {userRole !== 'VIEWER' && (
                          <button
                            onClick={() => handleRestore(snap)}
                            className="flex items-center gap-0.5 text-blue-500 hover:text-blue-600 transition-colors font-medium cursor-pointer"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Restore</span>
                          </button>
                        )}
                        {userRole === 'OWNER' && (
                          <button
                            onClick={() => setDeleteTargetId(snap.id)}
                            className="flex items-center gap-0.5 text-red-500 hover:text-red-650 transition-colors font-medium cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
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

      <div className="p-4 border-t border-border bg-background/30">
        <button
          onClick={generateTimelineSummary}
          disabled={analyzingTimeline}
          className="w-full flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/15 text-primary rounded-lg text-xs py-2.5 font-semibold transition-all border border-primary/20 cursor-pointer"
        >
          {analyzingTimeline ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Layers className="h-3.5 w-3.5" />
          )}
          <span>Analyze Checkpoints</span>
        </button>

        {timelineSummary && (
          <div className="mt-3 p-3 rounded-lg bg-primary/[0.03] border border-primary/15 text-[11px] text-muted-foreground max-h-40 overflow-y-auto leading-relaxed">
            <span className="font-semibold text-primary block mb-1.5">Checkpoint Summary:</span>
            <div className="whitespace-pre-wrap">{timelineSummary}</div>
          </div>
        )}
      </div>

      {deleteTargetId !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl text-foreground animate-scale-in">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-500" />
              <span>Delete Checkpoint</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
              Are you sure you want to delete this checkpoint? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-muted hover:bg-neutral-200 dark:hover:bg-neutral-800 text-foreground transition-all border border-border cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const targetId = deleteTargetId;
                  setDeleteTargetId(null);
                  await executeDelete(targetId);
                }}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

}

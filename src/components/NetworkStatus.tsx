'use client';

import React, { useEffect, useState } from 'react';
import { syncEngine, type SyncState } from '@/lib/syncEngine';
import { Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';

export default function NetworkStatus() {
  const [state, setState] = useState<SyncState>('idle');

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  const getStatusConfig = () => {
    switch (state) {
      case 'syncing':
        return {
          bg: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
          icon: <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />,
          label: 'Syncing changes...',
        };
      case 'offline':
        return {
          bg: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
          icon: <CloudOff className="h-4 w-4 text-amber-400 animate-pulse" />,
          label: 'Offline (Saving locally)',
        };
      case 'error':
        return {
          bg: 'bg-red-900/40 text-red-300 border-red-700/50',
          icon: <AlertTriangle className="h-4 w-4 text-red-400" />,
          label: 'Sync Error (Retrying...)',
        };
      case 'idle':
      default:
        return {
          bg: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
          icon: <Cloud className="h-4 w-4 text-emerald-400" />,
          label: 'Synced with Cloud',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium backdrop-blur-md transition-all duration-300 ${config.bg}`}>
      {config.icon}
      <span>{config.label}</span>
    </div>
  );
}

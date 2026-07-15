'use client';

import React, { useEffect, useState } from 'react';
import { syncEngine, type SyncState } from '@/lib/syncEngine';
import { Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';

export default function NetworkStatus() {
  const [state, setState] = useState<SyncState>('idle');

  useEffect(() => {
    return syncEngine.subscribe((newState) => {
      setState(newState);
    });
  }, []);

  const getStatusConfig = () => {
    switch (state) {
      case 'syncing':
        return {
          bg: 'bg-blue-950/20 text-blue-400 border-blue-500/20',
          icon: <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />,
          label: 'Syncing',
        };
      case 'offline':
        return {
          bg: 'bg-amber-950/20 text-amber-400 border-amber-500/20',
          icon: <CloudOff className="h-3.5 w-3.5 text-amber-400 animate-pulse" />,
          label: 'Offline (Local-First)',
        };
      case 'error':
        return {
          bg: 'bg-red-950/20 text-red-400 border-red-500/20',
          icon: <AlertTriangle className="h-3.5 w-3.5 text-red-400" />,
          label: 'Sync Error',
        };
      case 'idle':
      default:
        return {
          bg: 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20',
          icon: <Cloud className="h-3.5 w-3.5 text-emerald-400" />,
          label: 'Synced',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-medium backdrop-blur-md transition-all duration-300 ${config.bg}`}>
      {config.icon}
      <span>{config.label}</span>
    </div>
  );
}


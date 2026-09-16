import React, { useState, useEffect } from 'react';
import { Play, CheckCircle, Pause, AlertOctagon, Flame, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import { CommitmentCard } from '../types.js';

interface ActiveBarProps {
  activeCard?: CommitmentCard;
  onComplete: (card: CommitmentCard) => void;
  onPause: (card: CommitmentCard) => void;
  onBlock: (card: CommitmentCard) => void;
  onViewCard: (card: CommitmentCard) => void;
}

export const ActiveBar: React.FC<ActiveBarProps> = ({
  activeCard,
  onComplete,
  onPause,
  onBlock,
  onViewCard,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    if (!activeCard || !activeCard.actual_start) {
      setElapsedSeconds(0);
      return;
    }

    const startTimestamp = new Date(activeCard.actual_start).getTime();
    const updateElapsed = () => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((now - startTimestamp) / 1000));
      setElapsedSeconds(diffSec);
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [activeCard?.id, activeCard?.actual_start]);

  const formatTimer = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;
    if (hours > 0) {
      return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  if (!activeCard) {
    return (
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-slate-300"></span>
              <span className="font-semibold text-slate-700">Single-Active Law:</span>
              <span>Currently Idle. Only one commitment can be in Active state at any given moment.</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              Zero Context-Switching Protocol
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-300/40 text-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Active Card Info */}
          <div className="flex items-start sm:items-center space-x-3 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500 text-slate-950 uppercase tracking-wider">
                ACTIVE
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold text-slate-800">
                  {activeCard.id}
                </span>
                <button
                  onClick={() => onViewCard(activeCard)}
                  className="text-sm font-bold text-slate-900 truncate hover:underline text-left"
                >
                  {activeCard.name}
                </button>
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-600 mt-0.5 truncate">
                <span className="font-medium text-slate-800">Next Action:</span>
                <span className="truncate italic">{activeCard.next_physical_action || 'None specified'}</span>
              </div>
            </div>
          </div>

          {/* Stopwatch & Action Buttons */}
          <div className="flex items-center justify-between sm:justify-end space-x-3 shrink-0">
            {/* Live Stopwatch */}
            <div className="flex items-center space-x-1.5 bg-white border border-amber-300/50 px-2.5 py-1 rounded-md shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
              <span className="text-xs font-mono font-bold text-slate-900">
                {formatTimer(elapsedSeconds)}
              </span>
            </div>

            {/* Complete (with Proof) */}
            <button
              onClick={() => onComplete(activeCard)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-2xs"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Complete (Proof)</span>
            </button>

            {/* Pause */}
            <button
              onClick={() => onPause(activeCard)}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors"
              title="Pause commitment and record what happened"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>

            {/* Block */}
            <button
              onClick={() => onBlock(activeCard)}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
              title="Record blocker and review date"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Block</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

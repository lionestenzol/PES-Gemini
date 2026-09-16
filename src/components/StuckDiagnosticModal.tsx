import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  Zap,
  Sparkles,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Layers,
  ListTree,
  RotateCcw,
  Inbox,
  HelpCircle,
} from 'lucide-react';
import { CommitmentCard } from '../types.js';

interface StuckDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCard?: CommitmentCard | null;
  initialBlockerText?: string;
  onApplyReroute: (plan: {
    target: 'DropList' | 'TheLine' | 'V2_Engine' | 'Breakdown_Checklist';
    actionTitle: string;
    actionDetails: string;
  }) => void;
}

export const StuckDiagnosticModal: React.FC<StuckDiagnosticModalProps> = ({
  isOpen,
  onClose,
  activeCard,
  initialBlockerText = '',
  onApplyReroute,
}) => {
  const [blockerText, setBlockerText] = useState(initialBlockerText);
  const [blockerPreset, setBlockerPreset] = useState<string>('Need tool / credential');
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    rootCauseAnalysis: string;
    blockerType: string;
    immediateNextSteps: string[];
    reroutePlan: {
      target: 'DropList' | 'TheLine' | 'V2_Engine' | 'Breakdown_Checklist';
      actionTitle: string;
      actionDetails: string;
    };
  } | null>(null);

  if (!isOpen) return null;

  const handleRunDiagnosis = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = blockerText.trim() || blockerPreset;
    setIsDiagnosing(true);

    try {
      const res = await fetch('/api/agent/stuck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockerDescription: prompt,
          currentContext: activeCard
            ? {
                taskName: activeCard.name,
                currentState: activeCard.current_state_desc,
                desiredState: activeCard.desired_state_desc,
                nextAction: activeCard.next_physical_action,
              }
            : null,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setDiagnosticResult(json.data);
        }
      }
    } catch (err) {
      console.error('Failed to run stuck diagnosis:', err);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleExecuteReroute = () => {
    if (!diagnosticResult) return;
    onApplyReroute(diagnosticResult.reroutePlan);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-amber-900/50 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-amber-900/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-950/80 border border-amber-800/80 flex items-center justify-center text-amber-400 shadow-xs">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>The Stuck Feature</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800">
                  AI DIAGNOSTIC & REROUTER
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Overcome cognitive friction, missing affordances, or execution deadlocks.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Active Context Card */}
          {activeCard && (
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-xs">
              <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">
                Active Commitment Being Diagnosed
              </div>
              <div className="font-semibold text-white">{activeCard.name}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Next action: {activeCard.next_physical_action || 'None stated'}
              </div>
            </div>
          )}

          {/* Form */}
          {!diagnosticResult ? (
            <form onSubmit={handleRunDiagnosis} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  What is blocking you right now?
                </label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    'Need tool / credential',
                    'Scope feels too massive',
                    'Unclear acceptance criteria',
                    'Waiting on third-party response',
                    'Technical compiler/test failure',
                    'Cognitive exhaustion / paralysis',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setBlockerPreset(preset);
                        if (!blockerText) setBlockerText(preset);
                      }}
                      className={`px-3 py-2 rounded-lg border text-left text-xs transition-colors ${
                        blockerPreset === preset
                          ? 'border-amber-500/80 bg-amber-950/30 text-amber-200'
                          : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  value={blockerText}
                  onChange={(e) => setBlockerText(e.target.value)}
                  placeholder="Describe the exact friction point, confusion, or error in your own words..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDiagnosing}
                  className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 rounded-lg text-xs font-bold shadow-xs transition-colors"
                >
                  {isDiagnosing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Diagnosing Bottleneck...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Diagnose & Reroute</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Diagnostic Output & Reroute Plan */
            <div className="space-y-4">
              <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-900/60 text-amber-200">
                    DIAGNOSIS: {diagnosticResult.blockerType.toUpperCase().replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-amber-100 leading-relaxed font-medium">
                  {diagnosticResult.rootCauseAnalysis}
                </p>
              </div>

              {/* 3 Immediate Actions */}
              <div>
                <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>3 Micro-Unblocking Steps:</span>
                </h4>
                <div className="space-y-2">
                  {diagnosticResult.immediateNextSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 flex items-start gap-2"
                    >
                      <span className="font-mono text-emerald-400 font-bold">{idx + 1}.</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reroute Proposal */}
              <div className="p-4 bg-indigo-950/30 border border-indigo-800/60 rounded-xl space-y-2">
                <div className="text-[10px] font-mono text-indigo-300 uppercase">
                  Automated Reroute Target: <strong>{diagnosticResult.reroutePlan.target}</strong>
                </div>
                <div className="text-xs font-bold text-white">
                  {diagnosticResult.reroutePlan.actionTitle}
                </div>
                <div className="text-xs text-slate-300">
                  {diagnosticResult.reroutePlan.actionDetails}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 flex items-center justify-between border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDiagnosticResult(null)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  ← Change Blocker
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteReroute}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                  >
                    <span>Execute Reroute Plan</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

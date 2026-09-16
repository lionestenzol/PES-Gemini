import React, { useState } from 'react';
import { V2BpmnElement, V2Ticket } from '../types.js';
import {
  GitBranch,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Flag,
  Cpu,
  User,
  Bot,
  Wrench,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
} from 'lucide-react';

interface VisualBpmnDiagramProps {
  bpmnElements: V2BpmnElement[];
  tickets: V2Ticket[];
  onSelectElement?: (elementId: string) => void;
}

export const VisualBpmnDiagram: React.FC<VisualBpmnDiagramProps> = ({
  bpmnElements,
  tickets,
  onSelectElement,
}) => {
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const getTicketForBpmn = (label: string): V2Ticket | undefined => {
    const match = label.match(/T-\d+/);
    if (!match) return undefined;
    return tickets.find((t) => t.id === match[0]);
  };

  return (
    <div className="flex flex-col bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-md">
      {/* BPMN Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-950 text-purple-300 border border-purple-800 font-semibold text-[11px]">
            <GitBranch className="w-3.5 h-3.5" /> BPMN 2.0 PROCESS FLOW
          </span>
          <span className="text-slate-400 text-[11px]">
            Standard Operational Routing & Exception Gateways
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.7, Number((z - 0.1).toFixed(1))))}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] w-10 text-center">{Math.round(zoomLevel * 100)}%</span>
          <button
            onClick={() => setZoomLevel((z) => Math.min(1.4, Number((z + 0.1).toFixed(1))))}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel(1)}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Reset Zoom"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* BPMN SVG & Node Layout Canvas */}
      <div className="p-8 overflow-x-auto min-h-[440px] flex justify-center items-center bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
        <div
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
          className="transition-transform duration-200 flex flex-col items-center select-none"
        >
          {/* Legend Banner */}
          <div className="flex items-center gap-4 text-[10px] font-mono text-slate-400 mb-6 bg-slate-950/60 px-3 py-1.5 rounded-full border border-slate-800">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Start Event
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2 rounded-xs bg-indigo-500 inline-block" /> Activity Task
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rotate-45 bg-amber-500 inline-block" /> Gateway (XOR)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-purple-400 inline-block" /> End Event
            </span>
          </div>

          {/* BPMN Main Sequence Pipeline */}
          <div className="flex items-center gap-6 relative">
            {/* 1. START EVENT (B-01) */}
            <div className="flex flex-col items-center">
              <div
                onClick={() => setSelectedElementId('B-01')}
                className={`w-14 h-14 rounded-full border-2 border-emerald-400 bg-emerald-950/60 flex items-center justify-center cursor-pointer transition-all shadow-md ${
                  selectedElementId === 'B-01' ? 'ring-4 ring-emerald-400/40 scale-105' : 'hover:scale-105'
                }`}
                title="Start Event: Intent Validated"
              >
                <Play className="w-5 h-5 text-emerald-400 fill-emerald-400 ml-0.5" />
              </div>
              <span className="text-[10px] font-mono text-emerald-300 font-semibold mt-2 text-center w-20">
                Start: Validated
              </span>
            </div>

            {/* Sequence Flow Connector Arrow */}
            <div className="w-8 h-0.5 bg-slate-500 relative flex items-center justify-end">
              <div className="w-2 h-2 border-t-2 border-r-2 border-slate-400 rotate-45 -mr-1" />
            </div>

            {/* 2. TASK: T-101 (B-02) */}
            <div className="flex flex-col items-center">
              <div
                onClick={() => setSelectedElementId('B-02')}
                className={`w-40 p-3 rounded-lg border-2 transition-all cursor-pointer shadow-md bg-slate-800/90 ${
                  selectedElementId === 'B-02'
                    ? 'border-indigo-400 ring-2 ring-indigo-500/40'
                    : 'border-indigo-500/50 hover:border-indigo-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono text-indigo-400 font-bold">B-02 / T-101</span>
                  <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-emerald-900/60 text-emerald-300">
                    DONE
                  </span>
                </div>
                <div className="text-xs font-bold text-white leading-snug">Apply Partition Tables</div>
                <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-400 font-mono">
                  <Cpu className="w-2.5 h-2.5 text-purple-400" /> System Executor
                </div>
              </div>
            </div>

            {/* Sequence Flow Connector Arrow */}
            <div className="w-8 h-0.5 bg-slate-500 relative flex items-center justify-end">
              <div className="w-2 h-2 border-t-2 border-r-2 border-slate-400 rotate-45 -mr-1" />
            </div>

            {/* 3. TASK: T-102 (B-03) */}
            <div className="flex flex-col items-center">
              <div
                onClick={() => setSelectedElementId('B-03')}
                className={`w-40 p-3 rounded-lg border-2 transition-all cursor-pointer shadow-md bg-slate-800/90 ${
                  selectedElementId === 'B-03'
                    ? 'border-indigo-400 ring-2 ring-indigo-500/40'
                    : 'border-indigo-500/50 hover:border-indigo-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono text-indigo-400 font-bold">B-03 / T-102</span>
                  <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-emerald-900/60 text-emerald-300">
                    DONE
                  </span>
                </div>
                <div className="text-xs font-bold text-white leading-snug">Build Isolation Indices</div>
                <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-400 font-mono">
                  <Wrench className="w-2.5 h-2.5 text-blue-400" /> Tool Executor
                </div>
              </div>
            </div>

            {/* Sequence Flow Connector Arrow */}
            <div className="w-8 h-0.5 bg-slate-500 relative flex items-center justify-end">
              <div className="w-2 h-2 border-t-2 border-r-2 border-slate-400 rotate-45 -mr-1" />
            </div>

            {/* 4. GATEWAY 1: B-04 (Exclusive XOR) */}
            <div className="flex flex-col items-center relative">
              <div
                onClick={() => setSelectedElementId('B-04')}
                className={`w-12 h-12 rotate-45 border-2 border-amber-400 bg-amber-950/70 flex items-center justify-center cursor-pointer transition-all shadow-md ${
                  selectedElementId === 'B-04' ? 'ring-4 ring-amber-400/40 scale-105' : 'hover:scale-105'
                }`}
                title="Exclusive Gateway: ExitCode == 0"
              >
                <span className="-rotate-45 text-sm font-bold text-amber-300 font-mono">✕</span>
              </div>
              <span className="text-[10px] font-mono text-amber-300 font-semibold mt-3 text-center w-24">
                Indices Valid?
              </span>

              {/* Exception Branch drop down */}
              <div className="absolute top-14 left-1/2 -translate-x-1/2 w-0.5 h-12 bg-rose-500" />
              <div className="absolute top-26 left-1/2 -translate-x-1/2 text-[8px] font-mono text-rose-400 bg-rose-950 px-1 py-0.5 rounded whitespace-nowrap">
                [ExitCode != 0]
              </div>
            </div>

            {/* Sequence Flow Connector Arrow with Condition Label */}
            <div className="w-14 h-0.5 bg-emerald-500 relative flex items-center justify-end">
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-mono text-emerald-400 bg-emerald-950 px-1 py-0.5 rounded whitespace-nowrap">
                [ExitCode == 0]
              </span>
              <div className="w-2 h-2 border-t-2 border-r-2 border-emerald-400 rotate-45 -mr-1" />
            </div>

            {/* 5. TASK: T-103 (B-05) */}
            <div className="flex flex-col items-center">
              <div
                onClick={() => setSelectedElementId('B-05')}
                className={`w-40 p-3 rounded-lg border-2 transition-all cursor-pointer shadow-md bg-slate-800/90 ${
                  selectedElementId === 'B-05'
                    ? 'border-indigo-400 ring-2 ring-indigo-500/40'
                    : 'border-indigo-500/50 hover:border-indigo-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono text-indigo-400 font-bold">B-05 / T-103</span>
                  <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-amber-900/60 text-amber-300">
                    READY
                  </span>
                </div>
                <div className="text-xs font-bold text-white leading-snug">Implement PKCE Engine</div>
                <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-400 font-mono">
                  <Bot className="w-2.5 h-2.5 text-cyan-400" /> AI Executor
                </div>
              </div>
            </div>

            {/* Sequence Flow Connector Arrow */}
            <div className="w-8 h-0.5 bg-slate-500 relative flex items-center justify-end">
              <div className="w-2 h-2 border-t-2 border-r-2 border-slate-400 rotate-45 -mr-1" />
            </div>

            {/* 6. TASK: T-104 (B-06) */}
            <div className="flex flex-col items-center">
              <div
                onClick={() => setSelectedElementId('B-06')}
                className={`w-40 p-3 rounded-lg border-2 transition-all cursor-pointer shadow-md bg-slate-800/90 ${
                  selectedElementId === 'B-06'
                    ? 'border-indigo-400 ring-2 ring-indigo-500/40'
                    : 'border-indigo-500/50 hover:border-indigo-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono text-indigo-400 font-bold">B-06 / T-104</span>
                  <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-slate-700 text-slate-300">
                    BLOCKED
                  </span>
                </div>
                <div className="text-xs font-bold text-white leading-snug">Isolation Audit Tests</div>
                <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-400 font-mono">
                  <User className="w-2.5 h-2.5 text-amber-400" /> Human Verifier (SoD)
                </div>
              </div>
            </div>

            {/* Sequence Flow Connector Arrow */}
            <div className="w-8 h-0.5 bg-slate-500 relative flex items-center justify-end">
              <div className="w-2 h-2 border-t-2 border-r-2 border-slate-400 rotate-45 -mr-1" />
            </div>

            {/* 7. GATEWAY 2: B-07 (Exclusive XOR: Tests & Proof) */}
            <div className="flex flex-col items-center relative">
              <div
                onClick={() => setSelectedElementId('B-07')}
                className={`w-12 h-12 rotate-45 border-2 border-amber-400 bg-amber-950/70 flex items-center justify-center cursor-pointer transition-all shadow-md ${
                  selectedElementId === 'B-07' ? 'ring-4 ring-amber-400/40 scale-105' : 'hover:scale-105'
                }`}
                title="Exclusive Gateway: TestsPass && ProofVerified"
              >
                <span className="-rotate-45 text-sm font-bold text-amber-300 font-mono">✕</span>
              </div>
              <span className="text-[10px] font-mono text-amber-300 font-semibold mt-3 text-center w-24">
                Proof Verified?
              </span>

              {/* Exception Branch drop down */}
              <div className="absolute top-14 left-1/2 -translate-x-1/2 w-0.5 h-12 bg-rose-500" />
              <div className="absolute top-26 left-1/2 -translate-x-1/2 text-[8px] font-mono text-rose-400 bg-rose-950 px-1 py-0.5 rounded whitespace-nowrap">
                [Proof Rejected]
              </div>
            </div>

            {/* Sequence Flow Connector Arrow with Condition Label */}
            <div className="w-14 h-0.5 bg-emerald-500 relative flex items-center justify-end">
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-mono text-emerald-400 bg-emerald-950 px-1 py-0.5 rounded whitespace-nowrap">
                [Proof OK]
              </span>
              <div className="w-2 h-2 border-t-2 border-r-2 border-emerald-400 rotate-45 -mr-1" />
            </div>

            {/* 8. END EVENT: B-END */}
            <div className="flex flex-col items-center">
              <div
                onClick={() => setSelectedElementId('B-END')}
                className={`w-14 h-14 rounded-full border-4 border-purple-400 bg-purple-950/80 flex items-center justify-center cursor-pointer transition-all shadow-lg ${
                  selectedElementId === 'B-END' ? 'ring-4 ring-purple-400/40 scale-105' : 'hover:scale-105'
                }`}
                title="End Event: Terminal JSON Payload Emitted"
              >
                <Flag className="w-5 h-5 text-purple-300 fill-purple-300" />
              </div>
              <span className="text-[10px] font-mono text-purple-300 font-semibold mt-2 text-center w-24">
                End: Terminal JSON
              </span>
            </div>
          </div>

          {/* EXCEPTION & TROUBLESHOOTING RE-ENTRY LOOP (B-ERR) */}
          <div className="mt-16 pt-4 border-t border-slate-800/80 w-full flex items-center justify-center gap-6">
            <div className="flex items-center gap-3 bg-rose-950/30 p-3 rounded-xl border border-rose-800/50">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-rose-300 font-mono">B-ERR: Exception Boundary</span>
                  <span className="text-[9px] bg-rose-900/60 text-rose-300 px-1.5 py-0.2 rounded font-mono">
                    ERROR PATH
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  Catches exit code non-zero or proof rejection → Spawns Troubleshooting Ticket → Re-enters pipeline at B-02
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-mono text-amber-400 bg-amber-950/60 px-2.5 py-1.5 rounded-lg border border-amber-800 ml-4">
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                Pipeline Re-entry
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Element Inspector Footer */}
      {selectedElementId && (
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">Selected BPMN Element:</span>
            <span className="font-mono font-bold text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800">
              {selectedElementId}
            </span>
            <span className="text-slate-300">
              {bpmnElements.find((b) => b.id === selectedElementId)?.label}
            </span>
            {bpmnElements.find((b) => b.id === selectedElementId)?.condition && (
              <span className="text-emerald-400 font-mono text-[11px]">
                Condition: {bpmnElements.find((b) => b.id === selectedElementId)?.condition}
              </span>
            )}
          </div>
          <span className="text-slate-500 text-[11px]">BPMN 2.0 Compliant Sequence Flow</span>
        </div>
      )}
    </div>
  );
};

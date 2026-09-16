import React, { useState } from 'react';
import { V2TreeNode, V2Ticket } from '../types.js';
import {
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  Cpu,
  User,
  Wrench,
  Bot,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';

interface VisualTreeDiagramProps {
  treeNodes: V2TreeNode[];
  tickets: V2Ticket[];
  onSelectNode?: (nodeId: string) => void;
}

export const VisualTreeDiagram: React.FC<VisualTreeDiagramProps> = ({
  treeNodes,
  tickets,
  onSelectNode,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const root = treeNodes[0];
  if (!root) return null;

  const milestones = root.children || [];

  const getTicketForNode = (nodeId: string): V2Ticket | undefined => {
    return tickets.find((t) => t.id === nodeId);
  };

  const getStatus = (nodeId: string) => {
    const t = getTicketForNode(nodeId);
    if (!t) return 'pending';
    if (t.lifecycleState === 'Completed') return 'completed';
    if (t.lifecycleState === 'Failed') return 'failed';
    if (t.lifecycleState === 'ProofSubmitted' || t.lifecycleState === 'Executing') return 'in-progress';
    return 'ready';
  };

  return (
    <div className="flex flex-col bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-md">
      {/* Visual Canvas Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-800 font-semibold text-[11px]">
            <Layers className="w-3.5 h-3.5" /> VISUAL NODE TREE
          </span>
          <span className="text-slate-400 text-[11px]">Orthogonal Hierarchical Decomposition</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.8, Number((z - 0.1).toFixed(1))))}
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

      {/* SVG & Node Tree Canvas */}
      <div className="p-8 overflow-x-auto min-h-[480px] flex justify-center items-start bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
        <div
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center' }}
          className="transition-transform duration-200 flex flex-col items-center select-none"
        >
          {/* LEVEL 0: ROOT (EPIC) */}
          <div
            onClick={() => setSelectedNodeId(root.id)}
            className={`w-96 p-4 rounded-xl border-2 transition-all cursor-pointer shadow-lg relative ${
              selectedNodeId === root.id
                ? 'bg-indigo-950/90 border-indigo-400 ring-2 ring-indigo-500/50'
                : 'bg-slate-800/90 border-indigo-500/60 hover:border-indigo-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                LEVEL 0 — ROOT EPIC
              </span>
              <span className="text-[11px] font-mono text-indigo-400">{root.id}</span>
            </div>
            <h3 className="text-sm font-bold text-white tracking-tight">{root.title}</h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">{root.description}</p>
          </div>

          {/* Root to Milestones Vertical Trunk */}
          <div className="w-0.5 h-8 bg-indigo-500/70" />

          {/* LEVEL 1: MILESTONES & LEVEL 2: LEAVES */}
          <div className="relative flex justify-center gap-12 pt-0">
            {/* Horizontal Splitter Bar connecting milestones */}
            {milestones.length > 1 && (
              <div
                className="absolute top-0 h-0.5 bg-indigo-500/70"
                style={{
                  left: `${100 / (milestones.length * 2)}%`,
                  right: `${100 / (milestones.length * 2)}%`,
                }}
              />
            )}

            {milestones.map((milestone) => (
              <div key={milestone.id} className="flex flex-col items-center">
                {/* Vertical drop line from horizontal bar to Milestone card */}
                <div className="w-0.5 h-6 bg-indigo-500/70" />

                {/* Milestone Card (Level 1) */}
                <div
                  onClick={() => setSelectedNodeId(milestone.id)}
                  className={`w-72 p-3.5 rounded-xl border transition-all cursor-pointer shadow-md ${
                    selectedNodeId === milestone.id
                      ? 'bg-slate-800 border-blue-400 ring-2 ring-blue-500/40'
                      : 'bg-slate-850/90 border-blue-500/40 hover:border-blue-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                      LEVEL 1 — MILESTONE
                    </span>
                    <span className="text-[11px] font-mono text-blue-400 font-semibold">{milestone.id}</span>
                  </div>
                  <h4 className="text-xs font-bold text-white">{milestone.title}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">{milestone.description}</p>
                </div>

                {/* Vertical drop from Milestone to child Leaf tasks */}
                {milestone.children && milestone.children.length > 0 && (
                  <>
                    <div className="w-0.5 h-6 bg-slate-600" />
                    <div className="flex flex-col gap-3 w-72">
                      {milestone.children.map((leaf) => {
                        const ticket = getTicketForNode(leaf.id);
                        const status = getStatus(leaf.id);

                        return (
                          <div
                            key={leaf.id}
                            onClick={() => {
                              setSelectedNodeId(leaf.id);
                              if (onSelectNode) onSelectNode(leaf.id);
                            }}
                            className={`p-3 rounded-lg border transition-all cursor-pointer relative ${
                              status === 'completed'
                                ? 'bg-emerald-950/40 border-emerald-500/50 hover:border-emerald-400'
                                : status === 'in-progress'
                                ? 'bg-amber-950/40 border-amber-500/50 hover:border-amber-400'
                                : status === 'failed'
                                ? 'bg-rose-950/40 border-rose-500/50 hover:border-rose-400'
                                : 'bg-slate-800/80 border-slate-700 hover:border-slate-500'
                            } ${
                              selectedNodeId === leaf.id ? 'ring-2 ring-indigo-400' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-mono font-bold text-indigo-300">
                                {leaf.id}
                              </span>

                              {/* Status Badge */}
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                  status === 'completed'
                                    ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
                                    : status === 'in-progress'
                                    ? 'bg-amber-900/60 text-amber-300 border border-amber-700'
                                    : status === 'failed'
                                    ? 'bg-rose-900/60 text-rose-300 border border-rose-700'
                                    : 'bg-slate-700 text-slate-300'
                                }`}
                              >
                                {status === 'completed' && <CheckCircle2 className="w-2.5 h-2.5" />}
                                {status === 'in-progress' && <Clock className="w-2.5 h-2.5 animate-spin" />}
                                {status.toUpperCase()}
                              </span>
                            </div>

                            <div className="text-xs font-semibold text-white">{leaf.title}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{leaf.description}</div>

                            {/* Executor Footer */}
                            {ticket && (
                              <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400">
                                <span className="flex items-center gap-1 font-mono">
                                  {ticket.executorClass === 'Human' && <User className="w-3 h-3 text-amber-400" />}
                                  {ticket.executorClass === 'AI' && <Bot className="w-3 h-3 text-cyan-400" />}
                                  {ticket.executorClass === 'System' && <Cpu className="w-3 h-3 text-purple-400" />}
                                  {ticket.executorClass === 'Tool' && <Wrench className="w-3 h-3 text-blue-400" />}
                                  {ticket.executorClass}
                                </span>
                                <span className="text-[9px] font-mono text-slate-500">
                                  {ticket.lifecycleState}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Node Inspector Footer */}
      {selectedNodeId && (
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">Inspecting Node:</span>
            <span className="font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800">
              {selectedNodeId}
            </span>
            {getTicketForNode(selectedNodeId) && (
              <span className="text-slate-300">
                Destination:{' '}
                <strong className="text-white font-mono">
                  {getTicketForNode(selectedNodeId)?.destination}
                </strong>
              </span>
            )}
          </div>
          <span className="text-slate-500 text-[11px]">Click nodes to highlight execution context</span>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Terminal,
  Cpu,
  Layers,
  GitBranch,
  ShieldCheck,
  RefreshCw,
  Play,
  Download,
  Copy,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  AlertTriangle,
  ArrowRight,
  Database,
  Key,
  Wrench,
  Network,
  ListTree,
  Check,
  Clock,
  ChevronDown,
  ChevronRight,
  Code2,
  FileJson,
  RotateCcw,
} from 'lucide-react';
import {
  PesV2Stage,
  V2IntakeRecord,
  V2KnowledgeEntity,
  V2ResourceEntity,
  V2DependencyCondition,
  V2ListItem,
  V2TreeNode,
  V2DependencyNode,
  V2BpmnElement,
  V2Ticket,
  V2TelemetryLogEntry,
  V2TroubleshootingTicket,
  V2TerminalJsonPayload,
  PromptIndexItem,
} from '../types.js';
import { globalPesV2Engine, MASTER_PROMPT_INDEX } from '../lib/pes-v2-engine.ts';
import { VisualTreeDiagram } from './VisualTreeDiagram.js';
import { VisualBpmnDiagram } from './VisualBpmnDiagram.js';

type CompartmentTab =
  | 'c1-intake'
  | 'c2-knowledge'
  | 'c3-structure'
  | 'c3-tickets'
  | 'c3-troubleshooting'
  | 'c0-prompt-index'
  | 'c4-terminal-json';

export const PesV2PipelineView: React.FC = () => {
  const [activeCompartment, setActiveCompartment] = useState<CompartmentTab>('c1-intake');
  const [structureSubTab, setStructureSubTab] = useState<'list' | 'tree' | 'graph' | 'bpmn'>('tree');
  const [treeViewMode, setTreeViewMode] = useState<'visual' | 'outline'>('visual');
  const [bpmnViewMode, setBpmnViewMode] = useState<'visual' | 'spec'>('visual');

  // Engine data state
  const [intake, setIntake] = useState<V2IntakeRecord>(globalPesV2Engine.getIntakeRecord());
  const [rawInputText, setRawInputText] = useState(globalPesV2Engine.getIntakeRecord().rawInput);
  const [knowledge, setKnowledge] = useState<V2KnowledgeEntity[]>(globalPesV2Engine.getKnowledgeEntities());
  const [resources, setResources] = useState<V2ResourceEntity[]>(globalPesV2Engine.getResourceEntities());
  const [deps, setDeps] = useState<V2DependencyCondition[]>(globalPesV2Engine.getDependencyMatrix());
  const [listItems, setListItems] = useState<V2ListItem[]>(globalPesV2Engine.getListItems());
  const [treeNodes, setTreeNodes] = useState<V2TreeNode[]>(globalPesV2Engine.getTreeNodes());
  const [depNodes, setDepNodes] = useState<V2DependencyNode[]>(globalPesV2Engine.getDependencyNodes());
  const [bpmn, setBpmn] = useState<V2BpmnElement[]>(globalPesV2Engine.getBpmnElements());
  const [tickets, setTickets] = useState<V2Ticket[]>(globalPesV2Engine.getTickets());
  const [logs, setLogs] = useState<V2TelemetryLogEntry[]>(globalPesV2Engine.getTelemetryLogs());
  const [troubleshooting, setTroubleshooting] = useState<V2TroubleshootingTicket[]>(globalPesV2Engine.getTroubleshootingTickets());
  const [terminalPayload, setTerminalPayload] = useState<V2TerminalJsonPayload>(globalPesV2Engine.generateTerminalJsonPayload());

  // Interactive controls
  const [selectedPromptId, setSelectedPromptId] = useState<string>('P-01');
  const [isExecuting, setIsExecuting] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({ 'TR-ROOT': true, 'TR-10': true, 'TR-20': true });

  const refreshAllState = () => {
    setIntake(globalPesV2Engine.getIntakeRecord());
    setKnowledge([...globalPesV2Engine.getKnowledgeEntities()]);
    setResources([...globalPesV2Engine.getResourceEntities()]);
    setDeps([...globalPesV2Engine.getDependencyMatrix()]);
    setListItems([...globalPesV2Engine.getListItems()]);
    setTreeNodes([...globalPesV2Engine.getTreeNodes()]);
    setDepNodes([...globalPesV2Engine.getDependencyNodes()]);
    setBpmn([...globalPesV2Engine.getBpmnElements()]);
    setTickets([...globalPesV2Engine.getTickets()]);
    setLogs([...globalPesV2Engine.getTelemetryLogs()]);
    setTroubleshooting([...globalPesV2Engine.getTroubleshootingTickets()]);
    setTerminalPayload(globalPesV2Engine.generateTerminalJsonPayload());
  };

  const handleParseIntent = (overrideText?: string) => {
    const textToParse = overrideText ?? rawInputText;
    const record = globalPesV2Engine.processRawIntent(textToParse);
    setIntake(record);
    refreshAllState();
  };

  const handleExecuteTicket = (ticketId: string) => {
    setIsExecuting(ticketId);
    setTimeout(() => {
      globalPesV2Engine.executeTicket(ticketId);
      setIsExecuting(null);
      refreshAllState();
    }, 600);
  };

  const handleVerifyProof = (ticketId: string, isValid: boolean) => {
    globalPesV2Engine.verifyTicketProof(ticketId, isValid);
    refreshAllState();
  };

  const handleTriggerFail = (ticketId: string) => {
    globalPesV2Engine.triggerFailureAndTroubleshoot(ticketId, 'Simulated runtime assertion error in Middle Box');
    refreshAllState();
  };

  const handleResolveTroubleshooting = (ttId: string) => {
    globalPesV2Engine.resolveTroubleshootingTicket(ttId, true);
    refreshAllState();
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(terminalPayload, null, 2));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(terminalPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pes-v2-terminal-payload-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedPrompt = MASTER_PROMPT_INDEX.find((p) => p.id === selectedPromptId) || MASTER_PROMPT_INDEX[0];

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-y-auto">
      {/* Top Banner: Architecture & Compartments */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <Cpu className="w-3.5 h-3.5" /> PES V2 ARCHITECTURE
              </span>
              <span className="text-xs text-slate-500 font-mono">13 Progressive Transformation Stages</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-1">
              End-to-End Planning & Deterministic Execution Pipeline
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setRawInputText('Migrate database cluster to dual-write tenant isolation with zero downtime and PKCE tokens');
                handleParseIntent('Migrate database cluster to dual-write tenant isolation with zero downtime and PKCE tokens');
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Preset: DB Migration
            </button>
            <button
              onClick={() => {
                setRawInputText('Synchronize S3 storage buckets with cryptographic SHA-256 integrity audits');
                handleParseIntent('Synchronize S3 storage buckets with cryptographic SHA-256 integrity audits');
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Preset: S3 Sync
            </button>
            <button
              onClick={refreshAllState}
              className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              title="Refresh Pipeline State"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Compartment Navigation Tabs */}
        <div className="max-w-7xl mx-auto mt-4 flex items-center gap-1 border-b border-slate-200 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveCompartment('c1-intake')}
            className={`px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeCompartment === 'c1-intake'
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Compartment 1: Intake & Validation
          </button>

          <button
            onClick={() => setActiveCompartment('c2-knowledge')}
            className={`px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeCompartment === 'c2-knowledge'
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            Compartment 2: Knowledge & Resources
          </button>

          <button
            onClick={() => setActiveCompartment('c3-structure')}
            className={`px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeCompartment === 'c3-structure'
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListTree className="w-3.5 h-3.5" />
            Compartment 3: Structural Evolution
          </button>

          <button
            onClick={() => setActiveCompartment('c3-tickets')}
            className={`px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeCompartment === 'c3-tickets'
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Compartment 3: Middle Box & Tickets
            <span className="ml-1 px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded-full text-[10px]">
              {tickets.filter((t) => t.lifecycleState === 'Completed').length}/{tickets.length}
            </span>
          </button>

          <button
            onClick={() => setActiveCompartment('c3-troubleshooting')}
            className={`px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeCompartment === 'c3-troubleshooting'
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Troubleshooting Loop
            {troubleshooting.some((t) => t.status === 'Open') && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveCompartment('c0-prompt-index')}
            className={`px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeCompartment === 'c0-prompt-index'
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Compartment 0: Prompt Index & Interrogation
          </button>

          <button
            onClick={() => setActiveCompartment('c4-terminal-json')}
            className={`px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeCompartment === 'c4-terminal-json'
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            Compartment 4: Terminal JSON
          </button>
        </div>
      </div>

      {/* Main Container Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* COMPARTMENT 1: INTAKE & VALIDATION */}
        {activeCompartment === 'c1-intake' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    Stage 1: Conversational Script & Signal Extraction
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Separating conversational noise from target operational signal and sorting into domain bins.
                  </p>
                </div>
                <button
                  onClick={() => handleParseIntent()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Parse & Pass Gate
                </button>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700">Raw Human Input Stream</label>
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={rawInputText}
                    onChange={(e) => setRawInputText(e.target.value)}
                    placeholder="Enter what needs to be accomplished..."
                    className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono text-slate-800"
                  />
                </div>
              </div>

              {/* Parsed Signal & Domain Binning */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Intent Bin</div>
                  <span className="inline-block px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {intake.intentBin}
                  </span>
                  <div className="mt-3 text-xs text-slate-600">
                    <span className="font-semibold">Target Outcome:</span> {intake.parsedSignal.targetOutcome}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Parsed Parameters</div>
                  <div className="space-y-1">
                    {Object.entries(intake.parsedSignal.parameters).map(([k, v]) => (
                      <div key={k} className="text-xs font-mono flex justify-between">
                        <span className="text-slate-500">{k}:</span>
                        <span className="font-semibold text-slate-800">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Explicit Constraints</div>
                  <ul className="space-y-1">
                    {intake.parsedSignal.constraints.map((c, i) => (
                      <li key={i} className="text-xs text-slate-700 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Has vs Wants Reality Check & Validation Gate */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
                <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-600" />
                  What Person Has vs What Person Wants
                </h3>
                <div className="space-y-4">
                  <div>
                    <span className="text-xs font-semibold text-slate-600">Available Assets & Tokens (Has):</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {intake.personHas.assets.map((asset, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-md text-xs bg-slate-100 text-slate-700 border border-slate-200">
                          {asset}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-600">Current System Baseline:</span>
                    <p className="text-xs font-mono text-slate-800 bg-slate-50 p-2 rounded-md border border-slate-200 mt-1">
                      {intake.personHas.currentSystemState}
                    </p>
                  </div>

                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <span className="text-xs font-semibold text-amber-900 block mb-1">
                      Missing Affordances & Gaps (Delta):
                    </span>
                    {intake.intentHasComparison.missing.length === 0 ? (
                      <p className="text-xs text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> All required capabilities available in system environment.
                      </p>
                    ) : (
                      <ul className="text-xs text-amber-800 space-y-1">
                        {intake.intentHasComparison.missing.map((m, i) => (
                          <li key={i}>• {m}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* Deterministic Validation Gate */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Deterministic Validation Gate
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        intake.validationGate.status === 'PASSED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                    >
                      GATE {intake.validationGate.status}
                    </span>
                  </div>

                  <div className="space-y-3 mt-4">
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-xs text-slate-700">1. Completeness Check (Non-empty targets):</span>
                      <span className="text-xs font-bold text-emerald-600">PASS</span>
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-xs text-slate-700">2. Feasibility Check (Affordance sufficiency):</span>
                      <span className="text-xs font-bold text-emerald-600">PASS</span>
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-xs text-slate-700">3. System Hard Invariant Check:</span>
                      <span className="text-xs font-bold text-emerald-600">PASS</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 mt-4 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    &ldquo;{intake.validationGate.gateNotes}&rdquo;
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end">
                  <button
                    onClick={() => setActiveCompartment('c2-knowledge')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    Proceed to Knowledge & Resources <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* COMPARTMENT 2: KNOWLEDGE & RESOURCES */}
        {activeCompartment === 'c2-knowledge' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Network className="w-4 h-4 text-indigo-600" />
                    Knowledge Graph & Resource Affordances
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Isolating what is true (Knowledge) from what can act (Resources), and discovering prerequisite conditions.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Knowledge Graph */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Knowledge Entities (Truths & State)
                    </span>
                    <span className="text-[10px] text-slate-400">{knowledge.length} entities mapped</span>
                  </div>

                  <div className="space-y-2.5">
                    {knowledge.map((k) => (
                      <div key={k.id} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 font-mono">{k.id}: {k.name}</span>
                          <span className="px-2 py-0.5 rounded-sm text-[10px] font-semibold bg-slate-200 text-slate-700">
                            {k.type}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-slate-600 grid grid-cols-2 gap-2 font-mono">
                          {Object.entries(k.properties).map(([prop, val]) => (
                            <div key={prop} className="bg-white px-2 py-1 rounded-sm border border-slate-100">
                              <span className="text-slate-400">{prop}:</span> {val}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resource Graph */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Resource Graph (Affordances & Tools)
                    </span>
                    <span className="text-[10px] text-slate-400">{resources.length} resources registered</span>
                  </div>

                  <div className="space-y-2.5">
                    {resources.map((r) => (
                      <div key={r.id} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {r.type === 'Tool' && <Wrench className="w-3.5 h-3.5 text-blue-600" />}
                            {r.type === 'API' && <Code2 className="w-3.5 h-3.5 text-indigo-600" />}
                            {r.type === 'Credential' && <Key className="w-3.5 h-3.5 text-amber-600" />}
                            <span className="text-xs font-bold text-slate-900 font-mono">{r.id}: {r.name}</span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-sm text-[10px] font-bold ${
                              r.availability === 'Available'
                                ? 'bg-emerald-100 text-emerald-800'
                                : r.availability === 'Locked'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {r.availability}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{r.purpose}</p>
                        <div className="mt-2 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                          <span>Location: {r.location}</span>
                          <span>Binds: {r.dependencies.join(', ')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Dependency Discovery Matrix */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-indigo-600" />
                Dependency Discovery Matrix (Condition Gating)
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Identifies condition relationships between components before structural decomposition begins.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Condition ID</th>
                      <th className="p-3">Source Predecessor</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Target Successor</th>
                      <th className="p-3">Condition Description</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {deps.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50 transition-colors font-mono">
                        <td className="p-3 font-semibold text-indigo-600">{d.id}</td>
                        <td className="p-3 text-slate-800 font-sans">{d.source}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-sm text-[10px] bg-slate-100 text-slate-700">
                            {d.conditionType}
                          </span>
                        </td>
                        <td className="p-3 text-slate-800 font-sans">{d.target}</td>
                        <td className="p-3 text-slate-600 font-sans">{d.description}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              d.satisfied ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {d.satisfied ? 'SATISFIED' : 'PENDING'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* COMPARTMENT 3: STRUCTURAL EVOLUTION (List, Tree, Dependency Graph, BPMN) */}
        {activeCompartment === 'c3-structure' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <ListTree className="w-4 h-4 text-indigo-600" />
                    Stage 3: Structural Evolution
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Progressing from flat inventory (List) → hierarchy (Tree) → topology (Graph) → operations (BPMN).
                  </p>
                </div>

                {/* Sub-view switcher */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => setStructureSubTab('list')}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      structureSubTab === 'list' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1. The List
                  </button>
                  <button
                    onClick={() => setStructureSubTab('tree')}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      structureSubTab === 'tree' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    2. The Tree
                  </button>
                  <button
                    onClick={() => setStructureSubTab('graph')}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      structureSubTab === 'graph' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    3. Dependency Graph
                  </button>
                  <button
                    onClick={() => setStructureSubTab('bpmn')}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      structureSubTab === 'bpmn' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    4. BPMN Process Routing
                  </button>
                </div>
              </div>

              {/* Sub-tab 1: THE LIST */}
              {structureSubTab === 'list' && (
                <div className="space-y-4">
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-900">
                    <strong>The Flat List Inventory:</strong> An exhaustive catalog of all required actions, resources, and outputs without hierarchy.
                  </div>
                  <div className="space-y-2">
                    {listItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-slate-400 w-6">#{item.order}</span>
                          <span className="font-mono text-indigo-600 font-semibold">{item.id}</span>
                          <span className="text-slate-900 font-medium">{item.item}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-sm text-[10px] font-semibold bg-slate-200 text-slate-700">
                            {item.type}
                          </span>
                          <span className="text-[11px] font-mono text-slate-600 bg-white px-2 py-0.5 rounded-sm border border-slate-200">
                            Target: {item.requiredOutput}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sub-tab 2: THE TREE */}
              {structureSubTab === 'tree' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                    <div className="text-xs text-indigo-900">
                      <strong>The Tree (Hierarchical Decomposition):</strong> Structural decomposition from Epic root to Milestone nodes and executable leaf tasks.
                    </div>

                    {/* Tree View Mode Toggle */}
                    <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-indigo-200 text-xs font-semibold shrink-0">
                      <button
                        onClick={() => setTreeViewMode('visual')}
                        className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                          treeViewMode === 'visual'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" /> Visual Node Tree
                      </button>
                      <button
                        onClick={() => setTreeViewMode('outline')}
                        className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                          treeViewMode === 'outline'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <ListTree className="w-3.5 h-3.5" /> Outline List
                      </button>
                    </div>
                  </div>

                  {/* Render Visual Tree or Outline List */}
                  {treeViewMode === 'visual' ? (
                    <VisualTreeDiagram treeNodes={treeNodes} tickets={tickets} />
                  ) : (
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3 font-mono text-xs">
                      {treeNodes.map((root) => (
                        <div key={root.id} className="space-y-2">
                          <div
                            className="flex items-center gap-2 cursor-pointer font-bold text-slate-900 bg-white p-2.5 rounded-md border border-slate-200"
                            onClick={() => setExpandedNodes((prev) => ({ ...prev, [root.id]: !prev[root.id] }))}
                          >
                            {expandedNodes[root.id] ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                            <span className="text-indigo-600 font-bold">{root.id}:</span>
                            <span>{root.title}</span>
                            <span className="text-slate-500 font-sans font-normal ml-auto text-[11px]">{root.description}</span>
                          </div>

                          {expandedNodes[root.id] && root.children && (
                            <div className="ml-6 pl-4 border-l-2 border-indigo-200 space-y-2">
                              {root.children.map((sub) => (
                                <div key={sub.id} className="space-y-2">
                                  <div
                                    className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800 bg-white p-2 rounded-md border border-slate-200"
                                    onClick={() => setExpandedNodes((prev) => ({ ...prev, [sub.id]: !prev[sub.id] }))}
                                  >
                                    {expandedNodes[sub.id] ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                                    <span className="text-blue-600 font-mono">{sub.id}:</span>
                                    <span>{sub.title}</span>
                                  </div>

                                  {expandedNodes[sub.id] && sub.children && (
                                    <div className="ml-6 pl-4 border-l-2 border-slate-300 space-y-1.5">
                                      {sub.children.map((leaf) => (
                                        <div key={leaf.id} className="p-2 bg-white rounded-md border border-slate-200 flex items-center justify-between text-xs">
                                          <div className="flex items-center gap-2">
                                            <span className="text-emerald-700 font-bold">{leaf.id}</span>
                                            <span className="text-slate-900 font-sans font-medium">{leaf.title}</span>
                                          </div>
                                          <span className="text-slate-500 font-sans text-[11px]">{leaf.description}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 3: DEPENDENCY GRAPH */}
              {structureSubTab === 'graph' && (
                <div className="space-y-4">
                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-900">
                    <strong>Dependency Graph (Topological Sequencing):</strong> Directional flow of prerequisites, indicating parallel vs blocked execution paths.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {depNodes.map((node, index) => {
                      const isComplete = tickets.find((t) => t.id === node.id)?.lifecycleState === 'Completed';
                      return (
                        <div
                          key={node.id}
                          className={`p-4 rounded-xl border relative transition-all ${
                            isComplete
                              ? 'bg-emerald-50 border-emerald-300'
                              : node.isBlocked
                              ? 'bg-slate-50 border-slate-200 opacity-75'
                              : 'bg-white border-indigo-300 shadow-sm'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-mono font-bold text-indigo-700">{node.id}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isComplete
                                  ? 'bg-emerald-200 text-emerald-800'
                                  : node.isBlocked
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {isComplete ? 'DONE' : node.isBlocked ? 'BLOCKED' : 'READY'}
                            </span>
                          </div>

                          <h4 className="text-xs font-semibold text-slate-900 mb-3">{node.title}</h4>

                          <div className="text-[11px] space-y-1 font-mono text-slate-600">
                            <div>Prereqs: {node.prerequisites.length > 0 ? node.prerequisites.join(', ') : 'None'}</div>
                            <div>Unlocks: {node.unlocks.length > 0 ? node.unlocks.join(', ') : 'Terminal'}</div>
                            <div>Phase: {node.parallelGroup}</div>
                          </div>

                          {index < depNodes.length - 1 && (
                            <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                              <ArrowRight className="w-5 h-5 text-slate-400 bg-white rounded-full p-0.5" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sub-tab 4: BPMN PROCESS ROUTING */}
              {structureSubTab === 'bpmn' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                    <div className="text-xs text-indigo-900">
                      <strong>BPMN Operational Process Routing:</strong> Start/End events, exclusive/parallel decision gateways, and error exception boundaries.
                    </div>

                    {/* BPMN View Mode Toggle */}
                    <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-indigo-200 text-xs font-semibold shrink-0">
                      <button
                        onClick={() => setBpmnViewMode('visual')}
                        className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                          bpmnViewMode === 'visual'
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <GitBranch className="w-3.5 h-3.5" /> Visual BPMN Diagram
                      </button>
                      <button
                        onClick={() => setBpmnViewMode('spec')}
                        className={`px-3 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
                          bpmnViewMode === 'spec'
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Code2 className="w-3.5 h-3.5" /> Routing Specification
                      </button>
                    </div>
                  </div>

                  {/* Render Visual BPMN Diagram or Monospace Specification */}
                  {bpmnViewMode === 'visual' ? (
                    <VisualBpmnDiagram bpmnElements={bpmn} tickets={tickets} />
                  ) : (
                    <div className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-x-auto space-y-3">
                      <div className="text-slate-400 text-[11px] uppercase tracking-wider mb-2">
                        // Operational Routing Definition
                      </div>
                      {bpmn.map((el) => (
                        <div key={el.id} className="flex items-center gap-3">
                          <span className="text-slate-500 w-14">{el.id}</span>
                          <span
                            className={`px-2 py-0.5 rounded-sm text-[10px] font-bold ${
                              el.type === 'StartEvent' || el.type === 'EndEvent'
                                ? 'bg-purple-900 text-purple-200'
                                : el.type === 'Gateway'
                                ? 'bg-amber-900 text-amber-200'
                                : 'bg-blue-900 text-blue-200'
                            }`}
                          >
                            {el.type}
                          </span>
                          <span className="text-slate-200 font-semibold">{el.label}</span>
                          {el.condition && (
                            <span className="text-emerald-400 text-[11px]">[Condition: {el.condition}]</span>
                          )}
                          <span className="text-slate-500 ml-auto">→ {el.next.join(', ') || 'TERMINAL'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMPARTMENT 3: TICKETS & THE HARDENED MIDDLE BOX */}
        {activeCompartment === 'c3-tickets' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-600" />
                    The Middle Box — Hardened Deterministic Execution
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    AI steps out during execution. Self-contained tickets run deterministically, producing verifiable proof.
                  </p>
                </div>
              </div>

              {/* Ticket Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className={`p-5 rounded-xl border transition-all ${
                      t.lifecycleState === 'Completed'
                        ? 'bg-emerald-50/40 border-emerald-300'
                        : t.lifecycleState === 'Failed'
                        ? 'bg-rose-50/50 border-rose-300'
                        : t.lifecycleState === 'ProofSubmitted'
                        ? 'bg-amber-50/50 border-amber-300'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-900">{t.id}</span>
                        <span className="px-2 py-0.5 rounded-sm text-[10px] font-semibold bg-slate-100 text-slate-700">
                          Executor: {t.executorClass}
                        </span>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          t.lifecycleState === 'Completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : t.lifecycleState === 'Failed'
                            ? 'bg-rose-100 text-rose-800'
                            : t.lifecycleState === 'ProofSubmitted'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {t.lifecycleState}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-slate-900 mb-1">{t.title}</h4>
                    <p className="text-xs text-slate-600 mb-3">{t.workDescription}</p>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs font-mono space-y-1.5 mb-4">
                      <div><span className="text-slate-400">Target:</span> {t.destination}</div>
                      <div><span className="text-slate-400">Expected Result:</span> {t.expectedResult}</div>
                      <div><span className="text-slate-400">Proof Required:</span> {t.proofRequirements}</div>
                    </div>

                    {t.submittedProof && (
                      <div className="p-3 bg-white rounded-lg border border-emerald-200 text-xs font-mono mb-4 text-emerald-900">
                        <span className="font-bold flex items-center gap-1 mb-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Submitted Proof:
                        </span>
                        {t.submittedProof}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                      {t.lifecycleState === 'Created' && (
                        <button
                          onClick={() => handleExecuteTicket(t.id)}
                          disabled={isExecuting === t.id}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                        >
                          {isExecuting === t.id ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Executing in Runner...
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" /> Execute in Middle Box
                            </>
                          )}
                        </button>
                      )}

                      {t.lifecycleState === 'ProofSubmitted' && (
                        <>
                          <button
                            onClick={() => handleVerifyProof(t.id, true)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> Verify Proof (Approve)
                          </button>
                          <button
                            onClick={() => handleVerifyProof(t.id, false)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors"
                          >
                            Reject Proof
                          </button>
                        </>
                      )}

                      {t.lifecycleState !== 'Failed' && (
                        <button
                          onClick={() => handleTriggerFail(t.id)}
                          className="ml-auto text-[11px] text-rose-600 hover:underline"
                        >
                          Simulate Failure
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Execution Telemetry Log Stream */}
            <div className="bg-slate-900 rounded-xl p-6 text-slate-100 font-mono text-xs shadow-xs space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-2">
                <span className="text-slate-400 font-semibold flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  Live Middle Box Telemetry & STDOUT Stream
                </span>
                <span className="text-[11px] text-slate-500">Auto-appended on state events</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 text-slate-300">
                    <span className="text-slate-500 shrink-0">[{log.timestamp.slice(11, 19)}]</span>
                    <span className="text-indigo-400 font-bold shrink-0">{log.ticketId}:</span>
                    <span className="text-slate-200">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TROUBLESHOOTING & RE-ENTRY PIPELINE */}
        {activeCompartment === 'c3-troubleshooting' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-amber-600" />
                    Failure Isolation & Troubleshooting Pipeline Re-Entry
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Failure is treated as structured work. Generated tickets capture root causes and re-enter at the appropriate stage.
                  </p>
                </div>
              </div>

              {troubleshooting.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                  No active failures detected. All Middle Box execution streams are running cleanly.
                </div>
              ) : (
                <div className="space-y-4">
                  {troubleshooting.map((tt) => (
                    <div
                      key={tt.id}
                      className={`p-5 rounded-xl border ${
                        tt.status === 'Open'
                          ? 'bg-amber-50/50 border-amber-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-slate-900">{tt.id}</span>
                          <span className="text-xs text-slate-500">
                            Triggered by ticket: <strong className="font-mono text-slate-800">{tt.failedTicketId}</strong>
                          </span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            tt.status === 'Open' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {tt.status}
                        </span>
                      </div>

                      <div className="space-y-2 text-xs mb-4">
                        <div className="p-3 bg-white rounded-lg border border-slate-200">
                          <span className="font-semibold text-slate-700 block mb-0.5">Captured Failure Evidence:</span>
                          <span className="font-mono text-rose-700">{tt.failureEvidence}</span>
                        </div>

                        <div className="p-3 bg-white rounded-lg border border-slate-200">
                          <span className="font-semibold text-slate-700 block mb-0.5">Root Cause Hypothesis:</span>
                          <span className="text-slate-800">{tt.rootCauseHypothesis}</span>
                        </div>

                        <div className="p-3 bg-white rounded-lg border border-slate-200">
                          <span className="font-semibold text-slate-700 block mb-1">Mitigation Steps:</span>
                          <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                            {tt.mitigationPlan.map((step, idx) => (
                              <li key={idx}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs">
                        <span className="text-slate-500 font-mono">
                          Re-entry Target: <strong className="text-indigo-600">{tt.reEntryStage}</strong>
                        </span>
                        {tt.status === 'Open' && (
                          <button
                            onClick={() => handleResolveTroubleshooting(tt.id)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
                          >
                            <Check className="w-3.5 h-3.5" /> Resolve & Re-Enter Pipeline
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMPARTMENT 0: PROMPT ARCHITECTURE & INDEX */}
        {activeCompartment === 'c0-prompt-index' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-indigo-600" />
                  Compartment 0: Master Prompt Index & 6-Question Component Interrogation
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete A→Z prompt coverage map. Every component answers the 6 fundamental operational questions.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* List of prompts */}
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {MASTER_PROMPT_INDEX.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPromptId(p.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedPromptId === p.id
                          ? 'bg-indigo-50 border-indigo-300 shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-mono font-bold text-indigo-700">{p.id}</span>
                        <span className="px-1.5 py-0.2 rounded-sm text-[10px] bg-slate-200 text-slate-700">
                          {p.category}
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-slate-900">{p.title}</h4>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{p.component}</p>
                    </div>
                  ))}
                </div>

                {/* Prompt Details & 6-Question Interrogation */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono font-bold text-indigo-600">{selectedPrompt.id}</span>
                      <span className="text-xs font-semibold text-slate-600">{selectedPrompt.component}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{selectedPrompt.title}</h3>
                  </div>

                  {/* 6 Questions */}
                  <div className="space-y-3">
                    <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
                      <span className="font-bold text-slate-900 block mb-1">1. What does this thing need to know?</span>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                        {selectedPrompt.interrogation.whatNeedsToKnow.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
                      <span className="font-bold text-slate-900 block mb-1">2. What does it need to do?</span>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                        {selectedPrompt.interrogation.whatNeedsToDo.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
                      <span className="font-bold text-slate-900 block mb-1">3. What does it need to produce?</span>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                        {selectedPrompt.interrogation.whatNeedsToProduce.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
                      <span className="font-bold text-slate-900 block mb-1">4. What does it connect to?</span>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                        {selectedPrompt.interrogation.whatConnectsTo.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
                      <span className="font-bold text-slate-900 block mb-1">5. What can cause it to stop?</span>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                        {selectedPrompt.interrogation.whatCanStopIt.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
                      <span className="font-bold text-slate-900 block mb-1">6. What happens next?</span>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                        {selectedPrompt.interrogation.whatHappensNext.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Rules & Gates */}
                  <div className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs space-y-2">
                    <span className="text-slate-400 font-bold block text-[11px] uppercase tracking-wider">
                      // Prompt Template Excerpt
                    </span>
                    <pre className="whitespace-pre-wrap text-slate-300 font-mono text-[11px]">
                      {selectedPrompt.templateSnippet}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* COMPARTMENT 4: TERMINAL JSON PAYLOAD */}
        {activeCompartment === 'c4-terminal-json' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                    <FileJson className="w-4 h-4 text-indigo-600" />
                    Compartment 4: Terminal JSON Machine-Readable Payload
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Immutable terminal artifact compiling all 4 compartments with cryptographic SHA-256 integrity stamp.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyJson}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    {copySuccess ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copySuccess ? 'Copied!' : 'Copy JSON'}
                  </button>
                  <button
                    onClick={handleDownloadJson}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Artifact
                  </button>
                </div>
              </div>

              {/* Integrity Bar */}
              <div className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs flex flex-wrap items-center justify-between gap-2 mb-4">
                <span className="text-emerald-400 font-bold">INTEGRITY STAMP:</span>
                <span className="text-slate-300">{terminalPayload.integrity_hash}</span>
                <span className="text-slate-400">Timestamp: {terminalPayload.timestamp}</span>
              </div>

              {/* JSON Viewer */}
              <div className="bg-slate-950 rounded-xl p-4 text-emerald-400 font-mono text-xs max-h-[600px] overflow-y-auto border border-slate-800">
                <pre>{JSON.stringify(terminalPayload, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  CommitmentCard,
  CardState,
  UserIdentity,
  TemporalWorkflowInfo,
} from '../types.js';
import {
  Check,
  AlertTriangle,
  RotateCcw,
  Plus,
  Moon,
  Sun,
  X,
  Radio,
  ArrowRight,
  ShieldAlert,
  Maximize2,
  Minimize2,
  Inbox,
  Clock,
  Sparkles,
  Layers,
  ChevronRight,
} from 'lucide-react';

interface DropListConsoleProps {
  cards: CommitmentCard[];
  currentUser: UserIdentity;
  onInitiateTransition: (card: CommitmentCard, targetState: CardState) => void;
  onUpdateCard: (cardId: string, changes: Partial<CommitmentCard>) => void;
  onAddInboxItem: (text: string) => void;
  onSelectCard?: (card: CommitmentCard) => void;
  onToggleLayout?: () => void;
  isSplitView?: boolean;
}

type DropListView = 'now' | 'today' | 'drop' | 'close' | 'ledger';

const BLOCK_TYPES = [
  'Need tool',
  'Need info',
  'Too big',
  'Too tired',
  'Waiting on someone',
  'Not important',
  'Other',
];

interface LedgerDayEntry {
  day: string;
  completed: string[];
  stuck: string[];
  skipped: string[];
  carry: string[];
  added: string[];
  worked: string;
  blocked: string;
  firstJob: string;
}

export const DropListConsole: React.FC<DropListConsoleProps> = ({
  cards,
  currentUser,
  onInitiateTransition,
  onUpdateCard,
  onAddInboxItem,
  onSelectCard,
  onToggleLayout,
  isSplitView = false,
}) => {
  const [view, setView] = useState<DropListView>('now');
  const [themeMode, setThemeMode] = useState<'tactical' | 'paper'>('tactical');
  const [activeSheet, setActiveSheet] = useState<
    | { type: 'stuck'; card: CommitmentCard }
    | { type: 'detail'; card: CommitmentCard }
    | { type: 'quickdrop' }
    | { type: 'proof'; card: CommitmentCard }
    | null
  >(null);

  // Stuck sheet form state
  const [stuckWhere, setStuckWhere] = useState('');
  const [stuckBlockType, setStuckBlockType] = useState('Need info');
  const [stuckSmaller, setStuckSmaller] = useState('');
  const [stuckDisposition, setStuckDisposition] = useState<'today' | 'carry' | 'block'>('today');

  // Brain drop textarea state
  const [dropInput, setDropInput] = useState('');

  // Proof prompt state
  const [proofResult, setProofResult] = useState('');
  const [proofLocation, setProofLocation] = useState('');

  // Close day state
  const [workedText, setWorkedText] = useState('');
  const [blockedText, setBlockedText] = useState('');
  const [firstJobChoice, setFirstJobChoice] = useState('');
  const [ledgerEntries, setLedgerEntries] = useState<LedgerDayEntry[]>(() => {
    try {
      const saved = localStorage.getItem('pes_droplist_ledger');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        day: new Date(Date.now() - 86400000).toISOString().split('T')[0],
        completed: [
          'Database Schema Migration to Node.js',
          'Synchronize CalDAV Calendar Export',
        ],
        stuck: ['External legal department pending review of section 4 liability terms'],
        skipped: ['Legacy batch cleanup cron'],
        carry: ['Implement Multi-Tenancy Guard Rules'],
        added: ['Audit OAuth2 scope leakage in token validator'],
        worked: 'Single-active focus eliminated all context swapping latency',
        blocked: 'Third-party legal review cycle turnaround',
        firstJob: 'Audit database indices for tenant_id partitioning',
      },
    ];
  });

  const activeCard = cards.find((c) => c.state === 'Active');
  const waitingCards = cards.filter(
    (c) => c.state === 'Ready' || c.state === 'Scheduled' || c.state === 'Paused'
  );
  const nextWaitingCard = waitingCards.find((c) => c.id !== activeCard?.id);

  // Derive steps
  const activeSteps = activeCard?.steps || [
    { text: activeCard?.next_physical_action || 'Execute primary action', done: false },
  ];
  const activeStepIdx = activeSteps.findIndex((s) => !s.done);
  const currentStep =
    activeStepIdx >= 0
      ? activeSteps[activeStepIdx]
      : { text: activeCard?.next_physical_action || 'Complete task', done: false };

  // Save ledger entries
  const saveLedger = (entries: LedgerDayEntry[]) => {
    setLedgerEntries(entries);
    try {
      localStorage.setItem('pes_droplist_ledger', JSON.stringify(entries));
    } catch {}
  };

  // Step toggle handler
  const handleToggleStep = (stepIdx: number) => {
    if (!activeCard) return;
    const steps = [...activeSteps];
    steps[stepIdx] = { ...steps[stepIdx], done: !steps[stepIdx].done };

    onUpdateCard(activeCard.id, { steps });

    // If all steps completed, trigger completion flow
    const allDone = steps.every((s) => s.done);
    if (allDone) {
      setActiveSheet({ type: 'proof', card: activeCard });
    }
  };

  // Complete Active Card (with Proof requirement)
  const handleCompleteActive = () => {
    if (!activeCard) return;
    setActiveSheet({ type: 'proof', card: activeCard });
  };

  const handleConfirmProof = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCard) return;

    onInitiateTransition(activeCard, 'Completed');
    // Note: the transition modal in PES will receive result & proof_location
    onUpdateCard(activeCard.id, {
      result: proofResult.trim() || 'Successfully completed via DropList Tactical Console',
      proof_location: proofLocation.trim() || 'Verified live output & log artifact',
    });

    setActiveSheet(null);
    setProofResult('');
    setProofLocation('');
  };

  // Handle Stuck Reroute
  const handleSaveStuck = () => {
    if (!activeCard) return;

    const smallerMove = stuckSmaller.trim();
    const reasonText = `${stuckBlockType}: ${stuckWhere.trim() || 'Execution blocked'}`;

    if (stuckDisposition === 'block') {
      onInitiateTransition(activeCard, 'Blocked');
      onUpdateCard(activeCard.id, {
        block_reason: reasonText,
        waiting_for: stuckBlockType,
        fallback_action: smallerMove || activeCard.fallback_action || 'Awaiting unblock',
        review_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
      });
    } else if (stuckDisposition === 'carry') {
      onInitiateTransition(activeCard, 'Paused');
      onUpdateCard(activeCard.id, {
        what_happened: reasonText,
        fallback_action: smallerMove || 'Roll to next cycle',
        next_physical_action: smallerMove || activeCard.next_physical_action,
      });
    } else {
      // Return today with smaller move
      if (smallerMove) {
        const updatedSteps = [
          { text: smallerMove, done: false },
          ...activeSteps.filter((s) => !s.done),
        ];
        onUpdateCard(activeCard.id, {
          next_physical_action: smallerMove,
          steps: updatedSteps,
        });
      }
    }

    setActiveSheet(null);
    setStuckWhere('');
    setStuckSmaller('');
  };

  // Handle Brain Drop Submission
  const handleAddBrainDrops = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = dropInput
      .split('\n')
      .map((l) => l.trim().replace(/^[-•\d.)\s]+/, '').trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setView('today');
      return;
    }

    // Submit each line as an uncompromised inbox item into PES
    lines.forEach((line) => {
      onAddInboxItem(line);
    });

    setDropInput('');
    setView('today');
  };

  // Handle Stabilize / Overwhelmed Handrail
  const handleStabilize = () => {
    const existingStabilize = cards.find(
      (c) => c.name.toLowerCase().includes('stabilize') && c.state !== 'Completed'
    );
    if (existingStabilize) {
      onInitiateTransition(existingStabilize, 'Active');
    } else {
      // Queue a gentle grounding card into PES
      onAddInboxItem(
        'Stabilize: Stand up, drink cold water, take 3 deep diaphragmatic breaths, step away for 3 minutes.'
      );
      setView('today');
    }
  };

  // Close Day Action
  const handleCloseDay = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const doneCards = cards.filter((c) => c.state === 'Completed' || c.state === 'Verified');
    const stuckCards = cards.filter((c) => c.state === 'Blocked');
    const pausedCards = cards.filter((c) => c.state === 'Paused');
    const carryCards = cards.filter((c) => c.state === 'Ready' || c.state === 'Scheduled');

    const entry: LedgerDayEntry = {
      day: todayStr,
      completed: doneCards.map((c) => c.name),
      stuck: stuckCards.map((c) => `${c.name} (${c.block_reason || 'Blocked'})`),
      skipped: pausedCards.map((c) => c.name),
      carry: carryCards.map((c) => c.name),
      added: [],
      worked: workedText.trim() || 'Continuous Single-Active momentum sustained',
      blocked: blockedText.trim() || 'No unmanaged impediments',
      firstJob: firstJobChoice.trim() || (carryCards[0]?.name ?? 'Execute morning priorities'),
    };

    saveLedger([entry, ...ledgerEntries]);
    setView('ledger');
  };

  // Style variables according to active theme mode
  const isDark = themeMode === 'tactical';

  return (
    <div
      className={`min-h-full flex flex-col justify-between transition-colors duration-200 select-none ${
        isDark
          ? 'bg-[#0c0e0d] text-[#e9e7e0] font-mono'
          : 'bg-[#F4F1E8] text-[#171717] font-mono'
      }`}
      style={{
        fontFamily: "'IBM Plex Mono', monospace, ui-monospace",
      }}
    >
      {/* Top Header Bar */}
      <header
        className={`px-4 py-3 border-b flex items-center justify-between shrink-0 ${
          isDark
            ? 'border-[#2a322f] bg-gradient-to-b from-[#101413] to-transparent'
            : 'border-[#E2DDCE] bg-[#F4F1E8]'
        }`}
      >
        <div className="flex items-center space-x-2">
          <div
            className="font-bold tracking-widest text-sm flex items-center gap-1 uppercase"
            style={{ fontFamily: "'Chakra Petch', sans-serif" }}
          >
            <span>DROP</span>
            <span className="text-[#ffaa33] font-black">LIST</span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-mono ml-1 ${
                isDark ? 'bg-[#1c2220] text-[#8b918c]' : 'bg-[#EDEADF] text-[#5F625D]'
              }`}
            >
              FIELD
            </span>
          </div>

          {/* Temporal Heartbeat Indicator */}
          {activeCard?.temporal_workflow && (
            <div className="flex items-center space-x-1.5 pl-2 border-l border-slate-700/50">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-mono font-semibold text-emerald-400 hidden sm:inline">
                WF: #{activeCard.temporal_workflow.heartbeat_count}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Theme Toggle (Tactical / Paper) */}
          <button
            onClick={() => setThemeMode(isDark ? 'paper' : 'tactical')}
            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
              isDark
                ? 'border-[#2a322f] bg-[#161b19] text-[#8b918c] hover:text-[#ffaa33]'
                : 'border-[#E2DDCE] bg-[#FBFAF3] text-[#5F625D] hover:text-[#F5A32C]'
            }`}
            title="Toggle Paper Mode vs Tactical Dark"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span className="text-[10px] font-mono font-semibold uppercase">
              {isDark ? 'Paper' : 'Dark'}
            </span>
          </button>

          {/* Desktop/Split layout toggle */}
          {onToggleLayout && (
            <button
              onClick={onToggleLayout}
              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                isDark
                  ? 'border-[#2a322f] bg-[#161b19] text-[#8b918c] hover:text-[#e9e7e0]'
                  : 'border-[#E2DDCE] bg-[#FBFAF3] text-[#5F625D] hover:text-[#171717]'
              }`}
              title={isSplitView ? 'Close Split View' : 'Toggle Split Mode'}
            >
              {isSplitView ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Clock */}
          <div className="text-right">
            <span className="text-[11px] font-mono text-slate-400">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </header>

      {/* Main Screen Content */}
      <main className="flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full">
        {/* VIEW: NOW (The Tactical Heart) */}
        {view === 'now' && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-200">
            {!activeCard ? (
              <div
                className={`text-center py-16 px-4 rounded-2xl border ${
                  isDark
                    ? 'border-[#2a322f] bg-[#161b19] text-[#8b918c]'
                    : 'border-[#E2DDCE] bg-[#FBFAF3] text-[#5F625D]'
                }`}
              >
                <h2
                  className="text-2xl font-bold mb-2 tracking-tight"
                  style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                >
                  Nothing active.
                </h2>
                <p className="text-xs mb-6 max-w-xs mx-auto leading-relaxed">
                  Drop what is in your head, promote one task into Active, then run one move at a
                  time without multi-tasking.
                </p>
                <button
                  onClick={() => setView('drop')}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm tracking-wider uppercase bg-[#ffaa33] text-[#1a1205] shadow-lg hover:brightness-110 active:scale-95 transition-transform"
                  style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                >
                  Brain Drop →
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Console Chassis */}
                <div
                  className={`rounded-2xl border overflow-hidden shadow-2xl relative ${
                    isDark
                      ? 'border-[#39433f] bg-gradient-to-b from-[#1c2220] to-[#161b19]'
                      : 'border-[#D3CCBA] bg-gradient-to-b from-[#FFFFFF] to-[#FBFAF3]'
                  }`}
                >
                  {/* Console Header Strip */}
                  <div
                    className={`px-4 py-2.5 border-b flex items-center justify-between text-[11px] font-bold tracking-widest uppercase ${
                      isDark
                        ? 'border-[#2a322f] text-[#5c635e]'
                        : 'border-[#E2DDCE] text-[#8B8D86]'
                    }`}
                    style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[#ffaa33]">[{activeCard.id}]</span>
                      <span>RUN BOARD</span>
                    </div>

                    <div className="flex items-center space-x-2 text-[#ffaa33]">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                      <span>● NOW</span>
                    </div>
                  </div>

                  {/* Console Body */}
                  <div className="p-5 space-y-4">
                    {/* Active Job Title */}
                    <div>
                      <div
                        className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${
                          isDark ? 'text-[#5c635e]' : 'text-[#8B8D86]'
                        }`}
                        style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                      >
                        Active Commitment
                      </div>
                      <h1
                        className="text-xl sm:text-2xl font-black leading-tight tracking-wide"
                        style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                      >
                        {activeCard.name}
                      </h1>
                    </div>

                    {/* Next Move Callout Box */}
                    <div>
                      <div
                        className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${
                          isDark ? 'text-[#5c635e]' : 'text-[#8B8D86]'
                        }`}
                        style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                      >
                        Next Physical Action
                      </div>
                      <div
                        className={`p-3 rounded-r-xl border-l-4 border-[#ffaa33] text-sm leading-relaxed ${
                          isDark
                            ? 'bg-[rgba(255,170,51,0.07)] text-white'
                            : 'bg-[rgba(245,163,44,0.13)] text-[#171717]'
                        }`}
                      >
                        <span className="font-bold text-[#ffaa33] mr-1.5">→</span>
                        {currentStep.text}
                      </div>
                    </div>

                    {/* Done Means definition */}
                    {activeCard.desired_state_desc && (
                      <div>
                        <div
                          className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${
                            isDark ? 'text-[#5c635e]' : 'text-[#8B8D86]'
                          }`}
                          style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                        >
                          Done Means
                        </div>
                        <p className="text-xs italic text-slate-400 leading-relaxed">
                          {activeCard.desired_state_desc}
                        </p>
                      </div>
                    )}

                    {/* Sub-steps Checklist */}
                    {activeSteps.length > 0 && (
                      <div>
                        <div
                          className={`text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center justify-between ${
                            isDark ? 'text-[#5c635e]' : 'text-[#8B8D86]'
                          }`}
                          style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                        >
                          <span>Tactical Steps ({activeSteps.filter((s) => s.done).length}/{activeSteps.length})</span>
                          <button
                            onClick={() => setActiveSheet({ type: 'detail', card: activeCard })}
                            className="text-[#ffaa33] hover:underline"
                          >
                            + Add / Edit
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {activeSteps.map((step, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleToggleStep(idx)}
                              className={`flex items-center space-x-2.5 p-2 rounded-lg cursor-pointer transition-colors text-xs border ${
                                step.done
                                  ? isDark
                                    ? 'bg-transparent border-[#2a322f] text-slate-500 line-through'
                                    : 'bg-transparent border-[#E2DDCE] text-slate-400 line-through'
                                  : idx === activeStepIdx
                                  ? isDark
                                    ? 'bg-[#1c2220] border-[#ffaa33]/50 text-white font-medium'
                                    : 'bg-[#FBFAF3] border-[#F5A32C]/50 text-slate-900 font-medium'
                                  : isDark
                                  ? 'bg-[#161b19] border-[#2a322f] text-slate-300'
                                  : 'bg-[#FBFAF3] border-[#E2DDCE] text-slate-700'
                              }`}
                            >
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] shrink-0 ${
                                  step.done
                                    ? 'bg-emerald-500 border-emerald-500 text-slate-950 font-bold'
                                    : idx === activeStepIdx
                                    ? 'border-[#ffaa33] shadow-[0_0_8px_rgba(255,170,51,0.4)]'
                                    : 'border-slate-500'
                                }`}
                              >
                                {step.done && <Check className="w-3 h-3" />}
                              </div>
                              <span className="truncate flex-1">{step.text}</span>
                              {idx === activeStepIdx && !step.done && (
                                <span
                                  className="text-[9px] font-bold text-[#ffaa33] uppercase"
                                  style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                                >
                                  ◂ ACTIVE
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* After this teaser */}
                    {nextWaitingCard && (
                      <div
                        className={`pt-2 border-t text-xs flex items-center justify-between ${
                          isDark
                            ? 'border-[#2a322f] text-[#8b918c]'
                            : 'border-[#E2DDCE] text-[#5F625D]'
                        }`}
                      >
                        <span className="font-semibold text-slate-400">After this:</span>
                        <span className="truncate max-w-[200px] text-right font-medium">
                          {nextWaitingCard.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Job / Step Done */}
                  <button
                    onClick={handleCompleteActive}
                    className="col-span-2 py-3 px-4 rounded-xl font-bold text-sm tracking-wider uppercase bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md active:scale-98 transition-transform flex items-center justify-center space-x-2"
                    style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>
                      {activeSteps.length > 0 && activeStepIdx < activeSteps.length - 1
                        ? 'Next Step ✓'
                        : 'Commitment Done (Proof) ✓'}
                    </span>
                  </button>

                  {/* Stuck Button */}
                  <button
                    onClick={() => {
                      setStuckWhere('');
                      setStuckSmaller('');
                      setActiveSheet({ type: 'stuck', card: activeCard });
                    }}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs tracking-wider uppercase border text-rose-400 active:scale-95 transition-transform flex items-center justify-center space-x-1.5 ${
                      isDark
                        ? 'border-rose-900/60 bg-rose-950/20 hover:bg-rose-950/40'
                        : 'border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700'
                    }`}
                    style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>⚠ Stuck</span>
                  </button>

                  {/* Pause / Skip */}
                  <button
                    onClick={() => onInitiateTransition(activeCard, 'Paused')}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs tracking-wider uppercase border active:scale-95 transition-transform flex items-center justify-center space-x-1.5 ${
                      isDark
                        ? 'border-[#2a322f] bg-[#161b19] text-slate-400 hover:text-white'
                        : 'border-[#E2DDCE] bg-[#FBFAF3] text-slate-600 hover:text-slate-900'
                    }`}
                    style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>↷ Pause</span>
                  </button>
                </div>
              </div>
            )}

            {/* Overwhelmed Handrail Button */}
            <div className="text-center pt-4 pb-2">
              <button
                onClick={handleStabilize}
                className="text-xs text-slate-400 hover:text-[#ffaa33] underline underline-offset-4 cursor-pointer transition-colors"
              >
                I am overwhelmed — give me one move
              </button>
            </div>
          </div>
        )}

        {/* VIEW: TODAY (Tactical Queue) */}
        {view === 'today' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2
                  className="text-lg font-bold tracking-tight uppercase"
                  style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                >
                  Today's Execution Queue
                </h2>
                <p className="text-xs text-slate-400">
                  Strict Single-Active Law: One runs at a time.
                </p>
              </div>

              <button
                onClick={() => setView('drop')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase bg-[#ffaa33] text-[#1a1205] flex items-center gap-1 shadow-sm"
                style={{ fontFamily: "'Chakra Petch', sans-serif" }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Drop</span>
              </button>
            </div>

            {/* List of Today's Items */}
            <div className="space-y-2">
              {cards.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400">
                  No commitments in queue. Use Brain Drop to capture tasks.
                </div>
              ) : (
                cards.map((card) => {
                  const isActive = card.state === 'Active';
                  const isBlocked = card.state === 'Blocked';
                  const isDone =
                    card.state === 'Completed' ||
                    card.state === 'Verified' ||
                    card.state === 'Done';

                  return (
                    <div
                      key={card.id}
                      onClick={() => {
                        if (isActive) {
                          setView('now');
                        } else {
                          setActiveSheet({ type: 'detail', card });
                        }
                      }}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        isActive
                          ? 'border-[#ffaa33] bg-[rgba(255,170,51,0.08)] shadow-md'
                          : isBlocked
                          ? 'border-rose-900/50 bg-rose-950/10 opacity-80'
                          : isDone
                          ? 'border-slate-800 bg-slate-900/30 opacity-60'
                          : isDark
                          ? 'border-[#2a322f] bg-[#161b19] hover:border-[#39433f]'
                          : 'border-[#E2DDCE] bg-[#FBFAF3] hover:border-[#D3CCBA]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2 mb-0.5">
                          <span className="text-[10px] font-mono text-slate-400">{card.id}</span>
                          {card.temporal_workflow && (
                            <span className="text-[9px] font-mono px-1 rounded bg-indigo-900/60 text-indigo-300">
                              HB#{card.temporal_workflow.heartbeat_count}
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-sm font-semibold truncate ${
                            isDone ? 'line-through text-slate-500' : ''
                          }`}
                        >
                          {card.name}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center space-x-2">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isActive
                              ? 'bg-amber-400 text-slate-950'
                              : isBlocked
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-800'
                              : isDone
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-slate-700/50 text-slate-300'
                          }`}
                          style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                        >
                          {card.state}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* VIEW: DROP (Intake) */}
        {view === 'drop' && (
          <form onSubmit={handleAddBrainDrops} className="space-y-4 animate-in fade-in duration-200">
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1"
                style={{ fontFamily: "'Chakra Petch', sans-serif" }}
              >
                Intake & Triage
              </div>
              <h2
                className="text-xl font-bold tracking-tight"
                style={{ fontFamily: "'Chakra Petch', sans-serif" }}
              >
                Brain Drop
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Dump everything in your head. One line each. No sorting required.
              </p>
            </div>

            <textarea
              rows={8}
              value={dropInput}
              onChange={(e) => setDropInput(e.target.value)}
              placeholder="find legal contract docs&#10;verify tenant schema isolation&#10;run caldav export tests&#10;call compliance director..."
              className={`w-full p-4 rounded-xl border text-sm focus:outline-hidden leading-relaxed resize-none ${
                isDark
                  ? 'bg-[#161b19] border-[#2a322f] text-white focus:border-[#ffaa33]'
                  : 'bg-[#FBFAF3] border-[#D3CCBA] text-slate-900 focus:border-[#F5A32C]'
              }`}
            />

            <div className="text-[11px] text-slate-500 italic">
              Each line is instantly committed into the PES Inbox.
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 py-3 px-4 rounded-xl font-bold text-sm tracking-wider uppercase bg-[#ffaa33] text-[#1a1205] shadow-lg hover:brightness-110 active:scale-95 transition-transform"
                style={{ fontFamily: "'Chakra Petch', sans-serif" }}
              >
                Drop into PES Today →
              </button>
              <button
                type="button"
                onClick={() => setView('now')}
                className="px-4 py-3 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* VIEW: CLOSE DAY */}
        {view === 'close' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1"
                style={{ fontFamily: "'Chakra Petch', sans-serif" }}
              >
                Audit & Synthesis
              </div>
              <h2
                className="text-xl font-bold tracking-tight"
                style={{ fontFamily: "'Chakra Petch', sans-serif" }}
              >
                Close Day
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Turn today into an immutable proof record and protect tomorrow's first move.
              </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl border border-emerald-900/40 bg-emerald-950/20">
                <span className="font-bold text-emerald-400 block mb-1">Completed</span>
                <span className="text-xl font-black text-white">
                  {cards.filter((c) => c.state === 'Completed' || c.state === 'Verified').length}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-rose-900/40 bg-rose-950/20">
                <span className="font-bold text-rose-400 block mb-1">Stuck / Blocked</span>
                <span className="text-xl font-black text-white">
                  {cards.filter((c) => c.state === 'Blocked').length}
                </span>
              </div>
            </div>

            {/* Reflection Questions */}
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  What worked?
                </label>
                <input
                  type="text"
                  value={workedText}
                  onChange={(e) => setWorkedText(e.target.value)}
                  placeholder="e.g. strict single-active law prevented context switching"
                  className={`w-full p-2.5 rounded-lg border text-xs ${
                    isDark
                      ? 'bg-[#161b19] border-[#2a322f] text-white'
                      : 'bg-[#FBFAF3] border-[#D3CCBA] text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  What blocked motion?
                </label>
                <input
                  type="text"
                  value={blockedText}
                  onChange={(e) => setBlockedText(e.target.value)}
                  placeholder="e.g. missing approval credentials"
                  className={`w-full p-2.5 rounded-lg border text-xs ${
                    isDark
                      ? 'bg-[#161b19] border-[#2a322f] text-white'
                      : 'bg-[#FBFAF3] border-[#D3CCBA] text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#ffaa33] uppercase tracking-wider block mb-1">
                  First job tomorrow (Protect this)
                </label>
                <input
                  type="text"
                  value={firstJobChoice}
                  onChange={(e) => setFirstJobChoice(e.target.value)}
                  placeholder={nextWaitingCard?.name || 'The one line mechanically handed to tomorrow'}
                  className={`w-full p-2.5 rounded-lg border text-xs font-semibold ${
                    isDark
                      ? 'bg-[#161b19] border-[#ffaa33]/50 text-white'
                      : 'bg-[#FBFAF3] border-[#F5A32C]/50 text-slate-900'
                  }`}
                />
              </div>
            </div>

            <button
              onClick={handleCloseDay}
              className="w-full py-3 rounded-xl font-bold text-sm tracking-wider uppercase bg-[#ffaa33] text-[#1a1205] shadow-lg hover:brightness-110 active:scale-95 transition-transform"
              style={{ fontFamily: "'Chakra Petch', sans-serif" }}
            >
              Save to Ledger & Start Tomorrow →
            </button>
          </div>
        )}

        {/* VIEW: LEDGER (History) */}
        {view === 'ledger' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1"
                style={{ fontFamily: "'Chakra Petch', sans-serif" }}
              >
                Verification Records
              </div>
              <h2
                className="text-xl font-bold tracking-tight"
                style={{ fontFamily: "'Chakra Petch', sans-serif" }}
              >
                Ledger History
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Proof the days happened — {ledgerEntries.length} entries on record.
              </p>
            </div>

            <div className="space-y-3">
              {ledgerEntries.map((entry, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border ${
                    isDark ? 'border-[#2a322f] bg-[#161b19]' : 'border-[#E2DDCE] bg-[#FBFAF3]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="font-bold text-sm text-slate-200"
                      style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                    >
                      {entry.day}
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                      {entry.completed.length} completed
                    </span>
                  </div>

                  {entry.firstJob && (
                    <div className="text-xs text-[#ffaa33] mb-2 font-medium">
                      ▸ Morning Move: {entry.firstJob}
                    </div>
                  )}

                  {entry.worked && (
                    <div className="text-[11px] text-slate-400 mb-1">
                      <strong className="text-slate-300">Worked:</strong> {entry.worked}
                    </div>
                  )}

                  {entry.blocked && (
                    <div className="text-[11px] text-slate-400">
                      <strong className="text-slate-300">Blockers:</strong> {entry.blocked}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Tactile Bottom Navigation Bar */}
      <nav
        className={`px-3 py-2 border-t flex items-center justify-around shrink-0 ${
          isDark
            ? 'border-[#2a322f] bg-[#101413]'
            : 'border-[#E2DDCE] bg-[#EDEADF]'
        }`}
      >
        {(
          [
            { id: 'now', label: 'Now', icon: '▣' },
            { id: 'today', label: 'Today', icon: '≣' },
            { id: 'drop', label: 'Drop', icon: '✎' },
            { id: 'close', label: 'Close', icon: '◑' },
            { id: 'ledger', label: 'Ledger', icon: '⏱' },
          ] as const
        ).map((tab) => {
          const isSelected = view === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`flex-1 py-1.5 flex flex-col items-center justify-center space-y-1 transition-colors text-xs cursor-pointer ${
                isSelected
                  ? 'text-[#ffaa33] font-bold'
                  : isDark
                  ? 'text-slate-500 hover:text-slate-300'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              style={{ fontFamily: "'Chakra Petch', sans-serif" }}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              <span className="text-[10px] tracking-wider uppercase">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* BOTTOM SHEET: STUCK REROUTE */}
      {activeSheet?.type === 'stuck' && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setActiveSheet(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-lg rounded-t-2xl sm:rounded-2xl border p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 ${
              isDark ? 'border-[#39433f] bg-[#161b19]' : 'border-[#D3CCBA] bg-[#FBFAF3]'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-700/40 pb-3">
              <div>
                <h3
                  className="text-base font-bold text-rose-400 uppercase tracking-tight"
                  style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                >
                  Stuck — Not failure, a reroute
                </h3>
                <p className="text-xs text-slate-400">{activeSheet.card.name}</p>
              </div>
              <button
                onClick={() => setActiveSheet(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Where did it stop */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Where did it stop?
              </label>
              <input
                type="text"
                value={stuckWhere}
                onChange={(e) => setStuckWhere(e.target.value)}
                placeholder="e.g. Could not locate tenant isolation unit test file"
                className={`w-full p-2.5 rounded-lg border text-xs ${
                  isDark
                    ? 'bg-[#1c2220] border-[#2a322f] text-white'
                    : 'bg-white border-[#D3CCBA] text-slate-900'
                }`}
              />
            </div>

            {/* Block Type selector */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Block Type
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {BLOCK_TYPES.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setStuckBlockType(b)}
                    className={`p-2 rounded-lg text-xs text-left border transition-colors ${
                      stuckBlockType === b
                        ? 'border-[#ffaa33] bg-[#ffaa33]/15 text-white font-semibold'
                        : isDark
                        ? 'border-[#2a322f] bg-[#1c2220] text-slate-400'
                        : 'border-[#E2DDCE] bg-white text-slate-600'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Smaller next move */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#ffaa33] block mb-1">
                Smaller next move (Reroute)
              </label>
              <input
                type="text"
                value={stuckSmaller}
                onChange={(e) => setStuckSmaller(e.target.value)}
                placeholder="e.g. Search git log for 'tenant_isolation' or ask Jordan"
                className={`w-full p-2.5 rounded-lg border text-xs font-semibold ${
                  isDark
                    ? 'bg-[#1c2220] border-[#ffaa33]/50 text-white'
                    : 'bg-white border-[#F5A32C]/50 text-slate-900'
                }`}
              />
            </div>

            {/* Disposition */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                Then
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'today', label: 'Return Today' },
                    { id: 'carry', label: 'Pause/Carry' },
                    { id: 'block', label: 'Block Card' },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setStuckDisposition(d.id)}
                    className={`py-2 px-1 text-center rounded-lg text-xs font-bold uppercase border ${
                      stuckDisposition === d.id
                        ? 'border-[#ffaa33] bg-[#ffaa33]/20 text-[#ffaa33]'
                        : isDark
                        ? 'border-[#2a322f] bg-[#1c2220] text-slate-400'
                        : 'border-[#E2DDCE] bg-white text-slate-600'
                    }`}
                    style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSaveStuck}
              className="w-full py-3 rounded-xl font-bold text-sm tracking-wider uppercase bg-[#ffaa33] text-[#1a1205] shadow-lg hover:brightness-110 active:scale-95 transition-transform"
              style={{ fontFamily: "'Chakra Petch', sans-serif" }}
            >
              Reroute Commitment →
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM SHEET: PROOF CAPTURE */}
      {activeSheet?.type === 'proof' && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setActiveSheet(null)}
        >
          <form
            onSubmit={handleConfirmProof}
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-lg rounded-t-2xl sm:rounded-2xl border p-5 space-y-4 animate-in slide-in-from-bottom duration-200 ${
              isDark ? 'border-[#39433f] bg-[#161b19]' : 'border-[#D3CCBA] bg-[#FBFAF3]'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-700/40 pb-3">
              <div>
                <h3
                  className="text-base font-bold text-emerald-400 uppercase tracking-tight"
                  style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                >
                  Proof-of-Completion Gate
                </h3>
                <p className="text-xs text-slate-400">{activeSheet.card.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              PES rejects untracked completion declarations. Log your tangible result and artifact location to close this commitment.
            </p>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Result Statement
              </label>
              <textarea
                rows={2}
                required
                value={proofResult}
                onChange={(e) => setProofResult(e.target.value)}
                placeholder="What was physically achieved?"
                className={`w-full p-2.5 rounded-lg border text-xs ${
                  isDark
                    ? 'bg-[#1c2220] border-[#2a322f] text-white'
                    : 'bg-white border-[#D3CCBA] text-slate-900'
                }`}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Proof Location / Artifact
              </label>
              <input
                type="text"
                required
                value={proofLocation}
                onChange={(e) => setProofLocation(e.target.value)}
                placeholder="e.g. PR #42, logs/test_output.txt, screenshot URL"
                className={`w-full p-2.5 rounded-lg border text-xs font-mono ${
                  isDark
                    ? 'bg-[#1c2220] border-[#2a322f] text-white'
                    : 'bg-white border-[#D3CCBA] text-slate-900'
                }`}
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl font-bold text-sm tracking-wider uppercase bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md active:scale-95 transition-transform"
              style={{ fontFamily: "'Chakra Petch', sans-serif" }}
            >
              Certify & Complete Task ✓
            </button>
          </form>
        </div>
      )}

      {/* BOTTOM SHEET: CARD DETAIL / STEPS EDIT */}
      {activeSheet?.type === 'detail' && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setActiveSheet(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-lg rounded-t-2xl sm:rounded-2xl border p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 ${
              isDark ? 'border-[#39433f] bg-[#161b19]' : 'border-[#D3CCBA] bg-[#FBFAF3]'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-700/40 pb-3">
              <div>
                <h3
                  className="text-base font-bold uppercase tracking-tight"
                  style={{ fontFamily: "'Chakra Petch', sans-serif" }}
                >
                  {activeSheet.card.name}
                </h3>
                <span className="text-[10px] font-mono text-slate-400">
                  State: {activeSheet.card.state} &bull; ID: {activeSheet.card.id}
                </span>
              </div>
              <button
                onClick={() => setActiveSheet(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Next Physical Action
              </span>
              <p className="text-xs text-slate-200">
                {activeSheet.card.next_physical_action || 'None specified'}
              </p>
            </div>

            {activeSheet.card.state !== 'Active' && (
              <button
                onClick={() => {
                  onInitiateTransition(activeSheet.card, 'Active');
                  setActiveSheet(null);
                  setView('now');
                }}
                className="w-full py-2.5 rounded-xl font-bold text-xs tracking-wider uppercase bg-[#ffaa33] text-[#1a1205] shadow-md"
                style={{ fontFamily: "'Chakra Petch', sans-serif" }}
              >
                Promote to Active Execution →
              </button>
            )}

            <button
              onClick={() => setActiveSheet(null)}
              className="w-full py-2 rounded-xl text-xs text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

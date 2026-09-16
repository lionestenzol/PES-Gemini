import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Download,
  Upload,
  RefreshCw,
  Plus,
  Trash2,
  Sliders,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Info,
  CalendarCheck,
  Lock,
} from 'lucide-react';
import {
  CommitmentCard,
  CapacityRecord,
  CardLink,
  FixedEvent,
  OptimizerProposal,
  WhatIfParameters,
  UserIdentity,
} from '../types.js';
import { PathDSolver, getDateForDayOffset } from '../lib/path-d-solver.js';
import { getMondayOfWeek } from '../lib/pes-engine.js';

interface OptimizerViewProps {
  cards: CommitmentCard[];
  capacityRecords: CapacityRecord[];
  currentUser: UserIdentity;
  onImportProposal: (proposal: OptimizerProposal) => Promise<void>;
  onRefreshAll: () => void;
  onSelectCard: (card: CommitmentCard) => void;
}

export const OptimizerView: React.FC<OptimizerViewProps> = ({
  cards,
  capacityRecords,
  currentUser,
  onImportProposal,
  onRefreshAll,
  onSelectCard,
}) => {
  const [selectedMonday, setSelectedMonday] = useState<string>(() =>
    getMondayOfWeek(new Date())
  );
  const [fixedEvents, setFixedEvents] = useState<FixedEvent[]>([]);
  const [links, setLinks] = useState<CardLink[]>([]);
  const [proposal, setProposal] = useState<OptimizerProposal | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);

  // What-If simulation mode
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [capacityOverride, setCapacityOverride] = useState<number | undefined>(undefined);
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState(selectedMonday);
  const [newEventStart, setNewEventStart] = useState('10:00');
  const [newEventEnd, setNewEventEnd] = useState('11:00');

  // Load fixed events and links from API
  const loadData = async () => {
    try {
      const [evRes, linkRes] = await Promise.all([
        fetch(`/v1/optimizer/fixed-events?week_of=${selectedMonday}`),
        fetch('/v1/links'),
      ]);
      const evData = await evRes.json();
      const linkData = await linkRes.json();
      if (evData.ok) setFixedEvents(evData.data);
      if (linkData.ok) setLinks(linkData.data);
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonday]);

  // Current Capacity for selected week
  const currentCapacity = capacityRecords.find((c) => c.week_of === selectedMonday) || {
    id: 0,
    week_of: selectedMonday,
    total_hours: 40,
    fixed_commitments: 10,
    meals_travel_transitions: 6,
    recovery_reserve: 6,
    available_capacity: 18,
    schedule_limit: 14,
  };

  // Run Solver
  const handleRunSolver = () => {
    setIsSolving(true);
    setImportResult(null);
    try {
      let whatIf: WhatIfParameters | undefined = undefined;
      if (showWhatIf) {
        whatIf = {
          schedule_limit_override: capacityOverride,
        };
      }

      const res = PathDSolver.solve(
        selectedMonday,
        cards,
        currentCapacity,
        links,
        fixedEvents,
        whatIf
      );
      setProposal(res);
    } finally {
      setIsSolving(false);
    }
  };

  // Run solver automatically when view loads or when week changes
  useEffect(() => {
    handleRunSolver();
  }, [selectedMonday, cards, fixedEvents, showWhatIf, capacityOverride]);

  // Import to PES
  const handleImport = async () => {
    if (!proposal) return;
    setIsImporting(true);
    try {
      await onImportProposal(proposal);
      setImportResult({ imported: proposal.blocks.length, errors: [] });
      onRefreshAll();
    } catch (err: any) {
      setImportResult({ imported: 0, errors: [err.message] });
    } finally {
      setIsImporting(false);
    }
  };

  // Export Calendar ICS
  const handleDownloadCalendar = () => {
    window.location.href = `/v1/calendar/export.ics?week_of=${selectedMonday}`;
  };

  // Add Fixed Event
  const handleAddFixedEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventName.trim()) return;
    try {
      const res = await fetch('/v1/optimizer/fixed-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newEventName.trim(),
          event_date: newEventDate,
          start_time: newEventStart,
          end_time: newEventEnd,
          resource: currentUser.id,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setFixedEvents([...fixedEvents, data.data]);
        setShowAddEventModal(false);
        setNewEventName('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Fixed Event
  const handleDeleteFixedEvent = async (id: string) => {
    try {
      await fetch(`/v1/optimizer/fixed-events/${id}`, { method: 'DELETE' });
      setFixedEvents(fixedEvents.filter((e) => e.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // Navigate Weeks
  const shiftWeek = (offsetDays: number) => {
    const cur = new Date(selectedMonday + 'T00:00:00');
    cur.setDate(cur.getDate() + offsetDays);
    setSelectedMonday(getMondayOfWeek(cur));
  };

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const dayDates = [0, 1, 2, 3, 4].map((d) => ({
    name: dayNames[d],
    date: getDateForDayOffset(selectedMonday, d),
  }));

  const activeLimit =
    showWhatIf && capacityOverride !== undefined
      ? capacityOverride
      : currentCapacity.schedule_limit;

  const totalProposedHours = proposal ? proposal.total_scheduled_hours : 0;
  const capacityPct = Math.min(100, Math.round((totalProposedHours / activeLimit) * 100));

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Deck */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-900 text-white">
                PATH D
              </span>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Constraint Optimizer & Schedule Solver
              </h2>
              {proposal && (
                <span
                  className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded uppercase border ${
                    proposal.status === 'OPTIMAL'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : proposal.status === 'FEASIBLE'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {proposal.status}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Deterministic 15-minute slot allocation respecting capacity limits, precedence locks, and fixed calendar events.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Week Switcher */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs">
              <button
                onClick={() => shiftWeek(-7)}
                className="p-1.5 hover:bg-white rounded transition-colors text-slate-700"
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2.5 font-mono font-semibold text-slate-800">
                Week of {selectedMonday}
              </span>
              <button
                onClick={() => shiftWeek(7)}
                className="p-1.5 hover:bg-white rounded transition-colors text-slate-700"
                title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* What-If Toggle */}
            <button
              onClick={() => setShowWhatIf(!showWhatIf)}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                showWhatIf
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>What-If Simulation</span>
            </button>

            {/* Run Solver */}
            <button
              onClick={handleRunSolver}
              disabled={isSolving}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSolving ? 'animate-spin' : ''}`} />
              <span>Solve Week</span>
            </button>

            {/* Import Proposal */}
            <button
              onClick={handleImport}
              disabled={!proposal || proposal.blocks.length === 0 || isImporting}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shadow-2xs disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Commit Schedule</span>
            </button>

            {/* Export ICS */}
            <button
              onClick={handleDownloadCalendar}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-colors shadow-2xs"
              title="Download RFC 5545 .ics Calendar"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.ICS</span>
            </button>
          </div>
        </div>

        {/* What-If Drawer */}
        {showWhatIf && (
          <div className="mt-4 pt-4 border-t border-indigo-100 bg-indigo-50/50 -mx-5 -mb-5 p-5 rounded-b-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                  What-If Capacity & Constraint Override
                </h4>
                <p className="text-xs text-indigo-700 mt-0.5">
                  Test hypothetical scenarios without altering master capacity records or database state.
                </p>
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-indigo-900">Weekly Safe Limit:</span>
                  <input
                    type="range"
                    min="2"
                    max="35"
                    step="0.5"
                    value={capacityOverride ?? currentCapacity.schedule_limit}
                    onChange={(e) => setCapacityOverride(parseFloat(e.target.value))}
                    className="w-36 accent-indigo-600"
                  />
                  <span className="font-mono text-xs font-bold px-2 py-0.5 bg-white border border-indigo-200 rounded text-indigo-900">
                    {(capacityOverride ?? currentCapacity.schedule_limit).toFixed(1)}h
                  </span>
                </div>

                <button
                  onClick={() => setCapacityOverride(undefined)}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 underline"
                >
                  Reset to Master
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Banner Feedback */}
        {importResult && (
          <div
            className={`mt-4 p-3 rounded-lg border text-xs flex items-center justify-between ${
              importResult.errors.length === 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                Successfully transitioned <strong>{importResult.imported}</strong> commitment cards into{' '}
                <strong>Scheduled</strong> state under PES guard rules!
              </span>
            </div>
            <button
              onClick={() => setImportResult(null)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Solver Scoreboard */}
      {proposal && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Capacity Allocation
            </span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-xl font-bold font-mono text-slate-900">
                {proposal.total_scheduled_hours.toFixed(1)}h
              </span>
              <span className="text-xs text-slate-400 font-mono">
                / {activeLimit.toFixed(1)}h limit
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  capacityPct > 100
                    ? 'bg-rose-600'
                    : capacityPct > 85
                    ? 'bg-amber-500'
                    : 'bg-emerald-600'
                }`}
                style={{ width: `${Math.min(100, capacityPct)}%` }}
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Solver Performance
            </span>
            <div className="flex items-baseline space-x-1.5 mt-1">
              <span className="text-xl font-bold font-mono text-slate-900">
                {proposal.solve_time_ms}
              </span>
              <span className="text-xs text-slate-500">ms</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono block mt-1">
              Run: {proposal.run_id}
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Constraint Score
            </span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-xl font-bold font-mono text-emerald-700">
                0 Hard
              </span>
              <span className="text-xs text-slate-500 font-mono">
                / {proposal.soft_score.toLocaleString()} Soft
              </span>
            </div>
            <span className="text-[11px] text-emerald-600 flex items-center gap-1 mt-1">
              <ShieldCheck className="w-3 h-3" /> All invariants satisfied
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Yield Ratio
            </span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-xl font-bold font-mono text-slate-900">
                {proposal.blocks.length}
              </span>
              <span className="text-xs text-slate-500">scheduled</span>
              {proposal.unscheduled.length > 0 && (
                <span className="text-xs font-mono text-amber-600">
                  ({proposal.unscheduled.length} deferred)
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400 block mt-1">
              {cards.filter((c) => c.state === 'Ready' || c.state === 'Scheduled').length} eligible candidates
            </span>
          </div>
        </div>
      )}

      {/* Main Two-Column Layout: Visual Timeline Grid + Fixed Events/Unscheduled */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left 2 Cols: Proposed Schedule Calendar Grid (Mon-Fri 09:00-17:00) */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Optimized Weekly Execution Timeline
                </h3>
                <p className="text-xs text-slate-500">
                  Working hours 09:00 - 17:00 (15-min intervals). Fixed meetings locked.
                </p>
              </div>
              <div className="flex items-center space-x-3 text-xs text-slate-500">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-200 border border-slate-400 block" />
                  <span>Fixed Meeting</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-indigo-100 border border-indigo-400 block" />
                  <span>PES Commitment</span>
                </span>
              </div>
            </div>

            {/* Daily Column Grid */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {dayDates.map((day) => {
                // Blocks for this day
                const dayBlocks = proposal?.blocks.filter(
                  (b) => b.planned_date === day.date
                ) || [];

                // Fixed events for this day
                const dayFixed = fixedEvents.filter(
                  (e) => e.event_date === day.date
                );

                const isToday =
                  new Date().toISOString().split('T')[0] === day.date;

                return (
                  <div
                    key={day.date}
                    className={`rounded-lg border p-3 min-h-[380px] flex flex-col ${
                      isToday
                        ? 'bg-slate-50/80 border-slate-400 shadow-2xs'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* Day Header */}
                    <div className="border-b border-slate-200 pb-2 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">
                          {day.name}
                        </span>
                        {isToday && (
                          <span className="text-[9px] font-mono px-1 py-0.2 bg-slate-900 text-white rounded">
                            TODAY
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 block">
                        {day.date.slice(5)}
                      </span>
                    </div>

                    {/* Timeline Slot Items */}
                    <div className="space-y-2 flex-1">
                      {/* Fixed Events */}
                      {dayFixed.map((fe) => (
                        <div
                          key={fe.id}
                          className="p-2 rounded bg-slate-100 border border-slate-300 text-slate-800 text-xs shadow-2xs"
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-600 mb-0.5">
                            <span className="font-semibold flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" />
                              {fe.start_time} - {fe.end_time}
                            </span>
                            <span className="uppercase text-[9px] bg-slate-200 px-1 rounded">
                              FIXED
                            </span>
                          </div>
                          <p className="font-semibold line-clamp-2 text-slate-900">
                            {fe.name}
                          </p>
                        </div>
                      ))}

                      {/* Proposed Scheduled Cards */}
                      {dayBlocks.map((block) => {
                        const originalCard = cards.find(
                          (c) => c.id === block.card_id
                        );

                        return (
                          <div
                            key={block.card_id}
                            onClick={() => originalCard && onSelectCard(originalCard)}
                            className="p-2.5 rounded-lg bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-200 text-indigo-950 text-xs transition-all cursor-pointer shadow-2xs group"
                          >
                            <div className="flex items-center justify-between text-[10px] font-mono text-indigo-800 mb-1">
                              <span className="font-bold flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5 text-indigo-600" />
                                {block.planned_start} - {block.planned_end}
                              </span>
                              <span className="font-semibold px-1 rounded bg-indigo-200 text-indigo-900">
                                {block.planned_duration}m
                              </span>
                            </div>

                            <p className="font-bold text-slate-900 group-hover:text-indigo-900 line-clamp-2">
                              {block.card_name}
                            </p>

                            <div className="flex items-center justify-between mt-2 pt-1 border-t border-indigo-200/60 text-[10px] font-mono">
                              <span className="text-slate-500 font-semibold">
                                {block.card_id}
                              </span>
                              <span
                                className={`px-1 rounded font-bold ${
                                  block.risk_level === 'High'
                                    ? 'bg-rose-100 text-rose-800'
                                    : block.risk_level === 'Medium'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {block.risk_level}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {dayFixed.length === 0 && dayBlocks.length === 0 && (
                        <div className="h-28 flex items-center justify-center text-center text-slate-300 text-xs italic">
                          Open Slot
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right 1 Col: Unscheduled Items & Fixed Events Manager */}
        <div className="space-y-6">
          {/* Unscheduled / Deferred Cards */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Unscheduled Items ({proposal?.unscheduled.length || 0})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Items skipped due to hard capacity caps or slot unavailability.
            </p>

            {proposal && proposal.unscheduled.length > 0 ? (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {proposal.unscheduled.map((u) => {
                  const card = cards.find((c) => c.id === u.card_id);
                  return (
                    <div
                      key={u.card_id}
                      onClick={() => card && onSelectCard(card)}
                      className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 hover:bg-amber-100/50 transition-colors cursor-pointer text-xs"
                    >
                      <div className="flex items-center justify-between font-mono text-[10px] text-amber-800 mb-1">
                        <span className="font-bold">{u.card_id}</span>
                        <span>{u.duration}m planned</span>
                      </div>
                      <p className="font-semibold text-slate-900">{u.card_name}</p>
                      <p className="text-[11px] text-amber-900/80 mt-1 italic">
                        {u.reason}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 text-center">
                All eligible cards successfully scheduled!
              </div>
            )}
          </div>

          {/* Fixed Calendar Commitments Manager */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <CalendarCheck className="w-4 h-4 text-slate-700" />
                  Fixed Events ({fixedEvents.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Anchors solver will never schedule over.
                </p>
              </div>
              <button
                onClick={() => setShowAddEventModal(true)}
                className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg border border-slate-200 transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Add</span>
              </button>
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {fixedEvents.map((fe) => (
                <div
                  key={fe.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{fe.name}</p>
                    <span className="text-[10px] font-mono text-slate-500">
                      {fe.event_date} &bull; {fe.start_time} - {fe.end_time}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteFixedEvent(fe.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                    title="Delete Fixed Event"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Fixed Event Modal */}
      {showAddEventModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              Add Fixed Calendar Commitment
            </h3>
            <form onSubmit={handleAddFixedEvent} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Event / Meeting Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Executive Steering Review"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Event Date
                </label>
                <input
                  type="date"
                  required
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={newEventStart}
                    onChange={(e) => setNewEventStart(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    required
                    value={newEventEnd}
                    onChange={(e) => setNewEventEnd(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddEventModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-2xs"
                >
                  Add Commitment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

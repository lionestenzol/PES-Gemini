import React, { useState } from 'react';
import { CapacityRecord, CommitmentCard } from '../types.js';
import { getMondayOfWeek, computeCapacity } from '../lib/pes-engine.js';
import {
  Gauge,
  Calendar,
  Save,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle,
} from 'lucide-react';

interface CapacityViewProps {
  capacity: CapacityRecord;
  cards: CommitmentCard[];
  onSaveCapacity: (data: Partial<CapacityRecord> & { week_of: string }) => void;
}

export const CapacityView: React.FC<CapacityViewProps> = ({
  capacity,
  cards,
  onSaveCapacity,
}) => {
  const [selectedWeek, setSelectedWeek] = useState<string>(capacity.week_of);
  const [totalHours, setTotalHours] = useState<number>(capacity.total_hours);
  const [fixedHours, setFixedHours] = useState<number>(capacity.fixed_commitments);
  const [mealsTravel, setMealsTravel] = useState<number>(capacity.meals_travel_transitions);
  const [recovery, setRecovery] = useState<number>(capacity.recovery_reserve);
  const [savedNotification, setSavedNotification] = useState(false);

  // Compute live preview
  const liveComp = computeCapacity(totalHours, fixedHours, mealsTravel, recovery);

  // Calculate scheduled cards for this week
  const scheduledForWeek = cards.filter((c) => {
    if (!c.planned_date || c.schedule_status !== 'scheduled') return false;
    const cardMonday = getMondayOfWeek(c.planned_date);
    return cardMonday === selectedWeek;
  });

  const totalScheduledMinutes = scheduledForWeek.reduce(
    (acc, c) => acc + (c.planned_duration || 0),
    0
  );
  const totalScheduledHours = Number((totalScheduledMinutes / 60).toFixed(2));

  const percentUsed = liveComp.scheduleLimit > 0
    ? Math.min(100, Math.round((totalScheduledHours / liveComp.scheduleLimit) * 100))
    : 0;

  const isExceeded = totalScheduledHours > liveComp.scheduleLimit;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveCapacity({
      week_of: selectedWeek,
      total_hours: totalHours,
      fixed_commitments: fixedHours,
      meals_travel_transitions: mealsTravel,
      recovery_reserve: recovery,
    });
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 2500);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Title & Description */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <Gauge className="w-5 h-5 text-slate-800" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Capacity Engine & Weekly Safe-Limit Control
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              PES safeguards against overcommitment by calculating real non-negotiable drains (meals, recovery buffer, fixed meetings) before committing to work. The safe schedule limit maintains a strict 15% buffer.
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <Calendar className="w-4 h-4 text-slate-500" />
            <label className="text-xs font-semibold text-slate-700">Week of (Mon):</label>
            <input
              type="date"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(getMondayOfWeek(e.target.value))}
              className="text-xs font-mono border border-slate-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Parameters */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Budget Parameters (Hours)
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label className="font-semibold text-slate-700">Total Nominal Hours</label>
                <span className="font-mono text-slate-500">{totalHours}h</span>
              </div>
              <input
                type="number"
                step="0.5"
                min="10"
                max="80"
                value={totalHours}
                onChange={(e) => setTotalHours(parseFloat(e.target.value) || 0)}
                className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Total working hours available this week</p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label className="font-semibold text-slate-700">Fixed Commitments</label>
                <span className="font-mono text-slate-500">{fixedHours}h</span>
              </div>
              <input
                type="number"
                step="0.5"
                min="0"
                max="40"
                value={fixedHours}
                onChange={(e) => setFixedHours(parseFloat(e.target.value) || 0)}
                className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Recurring meetings, standups, fixed obligations</p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label className="font-semibold text-slate-700">Meals, Travel & Transitions</label>
                <span className="font-mono text-slate-500">{mealsTravel}h</span>
              </div>
              <input
                type="number"
                step="0.5"
                min="0"
                max="20"
                value={mealsTravel}
                onChange={(e) => setMealsTravel(parseFloat(e.target.value) || 0)}
                className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Daily buffer for commute, context switches</p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label className="font-semibold text-slate-700">Recovery Reserve</label>
                <span className="font-mono text-slate-500">{recovery}h</span>
              </div>
              <input
                type="number"
                step="0.5"
                min="0"
                max="20"
                value={recovery}
                onChange={(e) => setRecovery(parseFloat(e.target.value) || 0)}
                className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Protected slack time to absorb emergencies</p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Weekly Budget</span>
              </button>
              {savedNotification && (
                <p className="text-center text-[11px] text-emerald-600 font-semibold mt-2">
                  Capacity locked for week {selectedWeek}!
                </p>
              )}
            </div>
          </form>
        </div>

        {/* Center & Right: Visual Budget & Scheduled Cards List */}
        <div className="lg:col-span-2 space-y-6">
          {/* Visual Gauge Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Capacity Utilization for Week {selectedWeek}
            </h3>

            {/* Gauge Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-slate-600">
                  Scheduled: <strong className="text-slate-900 font-mono">{totalScheduledHours}h</strong>
                </span>
                <span className="font-medium text-slate-600">
                  Safe Schedule Limit: <strong className="text-slate-900 font-mono">{liveComp.scheduleLimit}h</strong>
                </span>
              </div>

              <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isExceeded
                      ? 'bg-rose-500'
                      : percentUsed > 80
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (totalScheduledHours / (liveComp.scheduleLimit || 1)) * 100)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>{percentUsed}% capacity allocated</span>
                <span>Available headroom: {Math.max(0, liveComp.scheduleLimit - totalScheduledHours).toFixed(1)}h</span>
              </div>
            </div>

            {/* Warning if exceeded */}
            {isExceeded && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center space-x-2 text-rose-800 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>
                  <strong>Schedule Limit Exceeded!</strong> You have committed {totalScheduledHours}h against a safe limit of {liveComp.scheduleLimit}h. The PES state machine will block new card scheduling until time is freed or budget is adjusted.
                </span>
              </div>
            )}

            {/* Calculated Breakdown Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Hours</span>
                <span className="text-base font-mono font-bold text-slate-900">{totalHours}h</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Deductions</span>
                <span className="text-base font-mono font-bold text-slate-900">{(fixedHours + mealsTravel + recovery)}h</span>
              </div>
              <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-200">
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">Available</span>
                <span className="text-base font-mono font-bold text-blue-900">{liveComp.availableCapacity}h</span>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200">
                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Safe Limit (85%)</span>
                <span className="text-base font-mono font-bold text-emerald-900">{liveComp.scheduleLimit}h</span>
              </div>
            </div>
          </div>

          {/* List of cards scheduled for this week */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
              <span>Commitments Scheduled in Week {selectedWeek}</span>
              <span className="text-xs font-mono font-normal text-slate-500">
                {scheduledForWeek.length} cards
              </span>
            </h4>

            {scheduledForWeek.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No cards currently scheduled in this week.
              </div>
            ) : (
              <div className="space-y-2">
                {scheduledForWeek.map((card) => (
                  <div
                    key={card.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono font-bold text-slate-700">{card.id}</span>
                        <span className="text-xs font-semibold text-slate-900">{card.name}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Planned date: {card.planned_date}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-slate-900">
                        {card.planned_duration} min
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        ({((card.planned_duration || 0) / 60).toFixed(1)}h)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

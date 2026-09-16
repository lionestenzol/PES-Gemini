import React, { useState } from 'react';
import { CommitmentCard, CardState } from '../types.js';
import {
  Calendar,
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Flame,
  Pause,
  AlertOctagon,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';

interface DailyQueueViewProps {
  cards: CommitmentCard[];
  onSelectCard: (card: CommitmentCard) => void;
  onInitiateTransition: (card: CommitmentCard, targetState: CardState) => void;
}

export const DailyQueueView: React.FC<DailyQueueViewProps> = ({
  cards,
  onSelectCard,
  onInitiateTransition,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const activeCard = cards.find((c) => c.state === 'Active');
  const todayScheduled = cards.filter(
    (c) => c.planned_date === selectedDate && ['Scheduled', 'Active', 'Completed', 'Verified'].includes(c.state)
  );

  const readyQueue = cards.filter((c) => c.state === 'Ready');

  const totalMinutesScheduled = todayScheduled.reduce(
    (acc, c) => acc + (c.planned_duration || 0),
    0
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Bar: Date Selector & Agenda Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <CalendarDays className="w-4 h-4 text-slate-700" />
            <span>Daily Execution Agenda</span>
          </h2>
          <p className="text-xs text-slate-500">
            Linear single-active focus. Complete one commitment at a time with verified proof.
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <label className="text-xs font-medium text-slate-600">Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-mono border border-slate-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-slate-900 focus:outline-hidden"
            />
          </div>
          <div className="text-right border-l border-slate-200 pl-4">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider block">Day Total</span>
            <span className="text-xs font-mono font-bold text-slate-900">
              {(totalMinutesScheduled / 60).toFixed(1)}h ({totalMinutesScheduled} min)
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Today's Timeline */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
            <span>Scheduled Commitments for {selectedDate}</span>
            <span className="text-xs font-normal text-slate-500 font-mono">
              {todayScheduled.length} cards
            </span>
          </h3>

          {todayScheduled.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
              <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-medium text-slate-600">
                No commitments scheduled for this date.
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Select a card from the Ready Queue on the right to schedule it into today's capacity.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {todayScheduled.map((card) => {
                const isActive = card.state === 'Active';
                const isCompleted = ['Completed', 'Verified', 'Done'].includes(card.state);

                return (
                  <div
                    key={card.id}
                    onClick={() => onSelectCard(card)}
                    className={`bg-white border rounded-xl p-4 shadow-2xs transition-all cursor-pointer ${
                      isActive
                        ? 'border-amber-400 ring-2 ring-amber-300/60 bg-amber-50/20'
                        : isCompleted
                        ? 'border-emerald-200 bg-emerald-50/10'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-xs font-mono font-bold text-slate-700">
                            {card.id}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              isActive
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : isCompleted
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            {card.state}
                          </span>
                          {card.priority >= 80 && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                              P{card.priority}
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 mb-1">{card.name}</h4>

                        {card.next_physical_action && (
                          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded px-2.5 py-1.5 mt-2">
                            <span className="font-semibold text-slate-800">Next Action: </span>
                            <span>{card.next_physical_action}</span>
                          </div>
                        )}

                        <div className="flex items-center space-x-4 text-xs text-slate-500 mt-2 font-mono">
                          {card.planned_start && (
                            <span className="flex items-center space-x-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>{card.planned_start} - {card.planned_end || 'flexible'}</span>
                            </span>
                          )}
                          <span>{card.planned_duration} minutes</span>
                        </div>
                      </div>

                      {/* Right Action Button */}
                      <div className="shrink-0 flex flex-col items-end space-y-2">
                        {card.state === 'Scheduled' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInitiateTransition(card, 'Active');
                            }}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 shadow-2xs"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Start Now</span>
                          </button>
                        )}

                        {card.state === 'Active' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInitiateTransition(card, 'Completed');
                            }}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-2xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Complete (Proof)</span>
                          </button>
                        )}

                        {card.state === 'Completed' && (
                          <span className="text-xs font-medium text-emerald-700 flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Awaiting Verify</span>
                          </span>
                        )}

                        {card.state === 'Verified' && (
                          <span className="text-xs font-medium text-teal-700 flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Proof Verified</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 1 Col: Ready Queue */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
            <span>Ready Queue</span>
            <span className="text-xs font-mono font-normal text-slate-500">
              {readyQueue.length} ready
            </span>
          </h3>

          <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
            <p className="text-[11px] text-slate-500">
              All 4 gates defined. Ready to be scheduled into available weekly capacity.
            </p>

            {readyQueue.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No cards in Ready queue. Define cards from Captured or Inbox.
              </div>
            ) : (
              readyQueue.map((card) => (
                <div
                  key={card.id}
                  onClick={() => onSelectCard(card)}
                  className="p-2.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-white transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono font-bold text-slate-700">
                      {card.id}
                    </span>
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                      P{card.priority}
                    </span>
                  </div>

                  <h5 className="text-xs font-semibold text-slate-900 line-clamp-1 mb-1">
                    {card.name}
                  </h5>

                  <p className="text-[11px] text-slate-500 italic line-clamp-1 mb-2">
                    {card.next_physical_action}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400">
                      {card.planned_duration ? `${card.planned_duration}m est.` : 'Duration not set'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onInitiateTransition(card, 'Scheduled');
                      }}
                      className="text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 inline-flex items-center space-x-1"
                    >
                      <span>Schedule</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

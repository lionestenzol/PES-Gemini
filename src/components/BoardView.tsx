import React from 'react';
import {
  CommitmentCard,
  CardState,
} from '../types.js';
import {
  Play,
  Calendar,
  CheckCircle2,
  CheckCheck,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldAlert,
  Archive,
  ChevronRight,
} from 'lucide-react';

interface BoardViewProps {
  cards: CommitmentCard[];
  onSelectCard: (card: CommitmentCard) => void;
  onInitiateTransition: (card: CommitmentCard, targetState: CardState) => void;
}

interface ColumnConfig {
  id: CardState | 'VerifiedDone';
  title: string;
  description: string;
  states: CardState[];
  badgeColor: string;
  borderColor: string;
}

export const BoardView: React.FC<BoardViewProps> = ({
  cards,
  onSelectCard,
  onInitiateTransition,
}) => {
  const columns: ColumnConfig[] = [
    {
      id: 'Captured',
      title: 'Captured',
      description: 'Raw cards needing 4-pillar definition',
      states: ['Captured'],
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
      borderColor: 'border-slate-200',
    },
    {
      id: 'Ready',
      title: 'Ready',
      description: 'Defined cards ready for schedule',
      states: ['Ready'],
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      borderColor: 'border-blue-200',
    },
    {
      id: 'Scheduled',
      title: 'Scheduled',
      description: 'Planned within weekly capacity limits',
      states: ['Scheduled'],
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      borderColor: 'border-indigo-200',
    },
    {
      id: 'Active',
      title: 'Active',
      description: 'Single-Active execution in progress',
      states: ['Active', 'Paused'],
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-300',
      borderColor: 'border-amber-300',
    },
    {
      id: 'Completed',
      title: 'Completed',
      description: 'Work done, proof attached',
      states: ['Completed'],
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      borderColor: 'border-emerald-200',
    },
    {
      id: 'VerifiedDone',
      title: 'Verified & Done',
      description: 'Proof certified & archived',
      states: ['Verified', 'Done'],
      badgeColor: 'bg-teal-50 text-teal-800 border-teal-200',
      borderColor: 'border-teal-200',
    },
    {
      id: 'Blocked',
      title: 'Blocked',
      description: 'Waiting on review or dependency',
      states: ['Blocked'],
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
      borderColor: 'border-rose-200',
    },
  ];

  const getPriorityBadge = (priority: number) => {
    if (priority >= 80) {
      return (
        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
          P{priority}
        </span>
      );
    }
    if (priority >= 50) {
      return (
        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
          P{priority}
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
        P{priority}
      </span>
    );
  };

  const getRiskBadge = (risk: string) => {
    if (risk === 'High') {
      return (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
          High Risk
        </span>
      );
    }
    if (risk === 'Medium') {
      return (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
          Med Risk
        </span>
      );
    }
    return null;
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Board Description & Metrics */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Guarded Lifecycle Board
          </h2>
          <p className="text-xs text-slate-500">
            Strict transitions enforced by PES rules: Ready Gate, Capacity Limits, Single-Active, and Proof Verification.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Total Cards: {cards.length}</span>
          </span>
        </div>
      </div>

      {/* Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3.5">
        {columns.map((col) => {
          const colCards = cards.filter((c) => col.states.includes(c.state));

          return (
            <div
              key={col.id}
              className="bg-slate-100/70 border border-slate-200/80 rounded-xl p-3 flex flex-col min-h-[500px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    {col.title}
                  </h3>
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full border ${col.badgeColor}`}
                  >
                    {colCards.length}
                  </span>
                </div>
              </div>

              {/* Cards List */}
              <div className="space-y-2.5 flex-1 overflow-y-auto">
                {colCards.length === 0 ? (
                  <div className="h-24 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-[11px] text-slate-400">
                    No cards
                  </div>
                ) : (
                  colCards.map((card) => (
                    <div
                      key={card.id}
                      onClick={() => onSelectCard(card)}
                      className={`bg-white border rounded-lg p-3 shadow-2xs hover:shadow-xs transition-all cursor-pointer group relative ${
                        card.state === 'Active'
                          ? 'border-amber-400 ring-1 ring-amber-300'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Top Row: ID, Priority, Risk */}
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="text-[11px] font-mono font-bold text-slate-700">
                          {card.id}
                        </span>
                        <div className="flex items-center space-x-1">
                          {getRiskBadge(card.risk_level)}
                          {getPriorityBadge(card.priority)}
                        </div>
                      </div>

                      {/* Card Title */}
                      <h4 className="text-xs font-semibold text-slate-900 leading-snug line-clamp-2 mb-2 group-hover:text-slate-700">
                        {card.name}
                      </h4>

                      {/* Next Physical Action snippet */}
                      {card.next_physical_action && (
                        <div className="bg-slate-50 border border-slate-100 rounded p-1.5 mb-2 text-[11px] text-slate-600">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                            Next Action:
                          </span>
                          <span className="line-clamp-2 italic">{card.next_physical_action}</span>
                        </div>
                      )}

                      {/* Timing / Schedule Info */}
                      {card.planned_date && (
                        <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 mb-2">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>
                            {card.planned_date}
                            {card.planned_duration ? ` (${card.planned_duration}m)` : ''}
                          </span>
                        </div>
                      )}

                      {/* Result / Proof snippet if completed */}
                      {card.result && (
                        <div className="text-[10px] text-emerald-700 bg-emerald-50/60 border border-emerald-200/50 rounded px-1.5 py-1 mb-2">
                          <span className="font-semibold">Result: </span>
                          <span className="line-clamp-1">{card.result}</span>
                        </div>
                      )}

                      {/* Context Action Button */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 group-hover:text-slate-600 font-mono">
                          {card.state}
                        </span>

                        {/* Quick State Transition Actions */}
                        {card.state === 'Captured' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInitiateTransition(card, 'Ready');
                            }}
                            className="inline-flex items-center space-x-1 text-[10px] font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
                          >
                            <span>Ready Gate</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}

                        {card.state === 'Ready' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInitiateTransition(card, 'Scheduled');
                            }}
                            className="inline-flex items-center space-x-1 text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200"
                          >
                            <span>Schedule</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}

                        {card.state === 'Scheduled' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInitiateTransition(card, 'Active');
                            }}
                            className="inline-flex items-center space-x-1 text-[10px] font-semibold text-amber-800 hover:text-amber-950 bg-amber-100 px-2 py-0.5 rounded border border-amber-300"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>Start</span>
                          </button>
                        )}

                        {card.state === 'Active' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInitiateTransition(card, 'Completed');
                            }}
                            className="inline-flex items-center space-x-1 text-[10px] font-semibold text-emerald-800 hover:text-emerald-950 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Complete</span>
                          </button>
                        )}

                        {card.state === 'Completed' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInitiateTransition(card, 'Verified');
                            }}
                            className="inline-flex items-center space-x-1 text-[10px] font-semibold text-teal-800 hover:text-teal-950 bg-teal-100 px-2 py-0.5 rounded border border-teal-300"
                          >
                            <CheckCheck className="w-3 h-3" />
                            <span>Verify Proof</span>
                          </button>
                        )}

                        {card.state === 'Verified' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInitiateTransition(card, 'Done');
                            }}
                            className="inline-flex items-center space-x-1 text-[10px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200"
                          >
                            <Archive className="w-3 h-3" />
                            <span>Done</span>
                          </button>
                        )}

                        {card.state === 'Blocked' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInitiateTransition(card, 'Ready');
                            }}
                            className="inline-flex items-center space-x-1 text-[10px] font-semibold text-rose-800 hover:text-rose-950 bg-rose-100 px-2 py-0.5 rounded border border-rose-300"
                          >
                            <span>Unblock</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

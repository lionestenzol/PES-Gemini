import React, { useState } from 'react';
import { AuditEvent, CommitmentCard } from '../types.js';
import { History, Search, ArrowRight, Shield, Clock } from 'lucide-react';

interface AuditLogViewProps {
  logs: AuditEvent[];
  cards: CommitmentCard[];
  onSelectCard: (card: CommitmentCard) => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({
  logs,
  cards,
  onSelectCard,
}) => {
  const [filterCard, setFilterCard] = useState('');

  const filteredLogs = logs.filter((l) => {
    if (!filterCard) return true;
    return l.card_id.toLowerCase().includes(filterCard.toLowerCase());
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <History className="w-5 h-5 text-slate-800" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Immutable State Audit Trail
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Every transition through the PES state machine is recorded in append-only history with actor, timestamps, guard verdicts, and execution start/end timings.
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={filterCard}
              onChange={(e) => setFilterCard(e.target.value)}
              placeholder="Filter by Card ID (e.g. T-001)..."
              className="text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-900 focus:outline-hidden font-mono"
            />
          </div>
        </div>
      </div>

      {/* Log Entries */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No audit log entries found.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const card = cards.find((c) => c.id === log.card_id);

              return (
                <div
                  key={log.id}
                  className="p-4 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {log.card_id}
                      </span>
                      {card && (
                        <button
                          onClick={() => onSelectCard(card)}
                          className="text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline"
                        >
                          {card.name}
                        </button>
                      )}
                      <div className="inline-flex items-center space-x-1 text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        <span>{log.state_from || 'None'}</span>
                        <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                        <span className="font-bold text-slate-900">{log.state_to}</span>
                      </div>
                    </div>

                    {log.note && (
                      <p className="text-xs text-slate-600 pl-0.5">{log.note}</p>
                    )}

                    {(log.actual_start || log.actual_end) && (
                      <div className="flex items-center space-x-3 text-[10px] text-slate-400 font-mono pt-0.5">
                        {log.actual_start && <span>Start: {new Date(log.actual_start).toLocaleTimeString()}</span>}
                        {log.actual_end && <span>End: {new Date(log.actual_end).toLocaleTimeString()}</span>}
                      </div>
                    )}
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 sm:text-right shrink-0">
                    <div>{new Date(log.timestamp).toLocaleDateString()}</div>
                    <div>{new Date(log.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

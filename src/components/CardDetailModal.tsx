import React, { useState } from 'react';
import { CommitmentCard, CardState } from '../types.js';
import { VALID_TRANSITIONS } from '../lib/pes-engine.js';
import {
  X,
  Play,
  Calendar,
  CheckCircle2,
  CheckCheck,
  AlertOctagon,
  Clock,
  ArrowRight,
  Shield,
  Edit2,
  Save,
  FileText,
  FileCheck,
  Archive,
} from 'lucide-react';

interface CardDetailModalProps {
  card: CommitmentCard;
  onClose: () => void;
  onInitiateTransition: (card: CommitmentCard, targetState: CardState) => void;
  onUpdateCard: (cardId: string, changes: Partial<CommitmentCard>) => void;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  card,
  onClose,
  onInitiateTransition,
  onUpdateCard,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(card.name);
  const [priority, setPriority] = useState(card.priority);
  const [riskLevel, setRiskLevel] = useState(card.risk_level);
  const [currentState, setCurrentState] = useState(card.current_state_desc || '');
  const [desiredState, setDesiredState] = useState(card.desired_state_desc || '');
  const [proof, setProof] = useState(card.proof_of_completion || '');
  const [nextAction, setNextAction] = useState(card.next_physical_action || '');
  const [fallbackAction, setFallbackAction] = useState(card.fallback_action || '');

  const availableTransitions = VALID_TRANSITIONS[card.state] || [];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCard(card.id, {
      name: name.trim(),
      priority,
      risk_level: riskLevel,
      current_state_desc: currentState.trim(),
      desired_state_desc: desiredState.trim(),
      proof_of_completion: proof.trim(),
      next_physical_action: nextAction.trim(),
      fallback_action: fallbackAction.trim() || null,
    });
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center space-x-3">
            <span className="text-sm font-mono font-bold text-slate-800 bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-2xs">
              {card.id}
            </span>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                card.state === 'Active'
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : card.state === 'Completed'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : card.state === 'Ready'
                  ? 'bg-blue-100 text-blue-800 border-blue-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {card.state}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200/60 border border-slate-200 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
          {isEditing ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Card Title</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full text-xs border border-slate-300 rounded px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Priority (0-100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                    className="w-full text-xs border border-slate-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Risk Level</label>
                  <select
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(e.target.value as any)}
                    className="w-full text-xs border border-slate-300 rounded px-3 py-2"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  The 4 Pillars of Definition
                </h4>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    1. Current State Description
                  </label>
                  <textarea
                    rows={2}
                    value={currentState}
                    onChange={(e) => setCurrentState(e.target.value)}
                    className="w-full border border-slate-300 rounded p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    2. Desired State Description
                  </label>
                  <textarea
                    rows={2}
                    value={desiredState}
                    onChange={(e) => setDesiredState(e.target.value)}
                    className="w-full border border-slate-300 rounded p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    3. Proof of Completion
                  </label>
                  <textarea
                    rows={2}
                    value={proof}
                    onChange={(e) => setProof(e.target.value)}
                    className="w-full border border-slate-300 rounded p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    4. Next Physical Action
                  </label>
                  <textarea
                    rows={2}
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    className="w-full border border-slate-300 rounded p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Fallback Action
                  </label>
                  <input
                    type="text"
                    value={fallbackAction}
                    onChange={(e) => setFallbackAction(e.target.value)}
                    className="w-full border border-slate-300 rounded px-3 py-2"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-slate-900 text-white font-semibold rounded shadow-2xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Title & Metadata Badges */}
              <div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{card.name}</h3>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    Priority: {card.priority}
                  </span>
                  <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    Risk: {card.risk_level}
                  </span>
                  <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    Owner: {card.owner}
                  </span>
                  {card.planned_date && (
                    <span className="font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                      Date: {card.planned_date} ({card.planned_duration}m)
                    </span>
                  )}
                </div>
              </div>

              {/* The 4 Pillars */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  The Four Pillars of Definition
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                      1. Current State
                    </span>
                    <p className="text-slate-800 italic">
                      {card.current_state_desc || 'Not defined'}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                      2. Desired State
                    </span>
                    <p className="text-slate-800 font-medium">
                      {card.desired_state_desc || 'Not defined'}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                      3. Proof of Completion
                    </span>
                    <p className="text-slate-800">
                      {card.proof_of_completion || 'Not defined'}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                      4. Next Physical Action
                    </span>
                    <p className="text-slate-900 font-semibold">
                      {card.next_physical_action || 'Not defined'}
                    </p>
                  </div>
                </div>

                {card.fallback_action && (
                  <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-lg text-rose-900">
                    <span className="text-[10px] uppercase font-bold text-rose-700 block mb-0.5">
                      Contingency Fallback Action
                    </span>
                    <p>{card.fallback_action}</p>
                  </div>
                )}
              </div>

              {/* Completion & Proof Result (If completed or verified) */}
              {(card.result || card.proof_location) && (
                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-2">
                  <h4 className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                    Recorded Proof & Execution Outcome
                  </h4>
                  {card.result && (
                    <div>
                      <span className="text-[10px] font-semibold text-emerald-700 block">
                        Result Statement:
                      </span>
                      <p className="text-slate-800">{card.result}</p>
                    </div>
                  )}
                  {card.proof_location && (
                    <div>
                      <span className="text-[10px] font-semibold text-emerald-700 block">
                        Proof Location / Artifact:
                      </span>
                      <span className="font-mono text-[11px] text-slate-800 bg-white px-2 py-0.5 rounded border border-emerald-200 inline-block mt-0.5">
                        {card.proof_location}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Block Details if Blocked */}
              {card.state === 'Blocked' && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2">
                  <h4 className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">
                    Blocker Details
                  </h4>
                  <p className="text-slate-800">
                    <strong>Reason: </strong> {card.block_reason}
                  </p>
                  <p className="text-slate-800">
                    <strong>Waiting for: </strong> {card.waiting_for}
                  </p>
                  <p className="text-slate-800">
                    <strong>Review date: </strong> {card.review_date}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: Guarded State Transitions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-600">
              Guarded Transitions from {card.state}:
            </span>

            <div className="flex flex-wrap items-center gap-2">
              {availableTransitions.length === 0 ? (
                <span className="text-xs text-slate-400">Terminal state (no transitions)</span>
              ) : (
                availableTransitions.map((target) => (
                  <button
                    key={target}
                    onClick={() => {
                      onClose();
                      onInitiateTransition(card, target);
                    }}
                    className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-2xs ${
                      target === 'Active'
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : target === 'Completed'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : target === 'Verified'
                        ? 'bg-teal-600 hover:bg-teal-700 text-white'
                        : target === 'Scheduled'
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        : target === 'Ready'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : target === 'Canceled'
                        ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-200'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    <span>Transition to {target}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

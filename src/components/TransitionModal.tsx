import React, { useState } from 'react';
import { CommitmentCard, CardState } from '../types.js';
import {
  AlertTriangle,
  CheckCircle,
  Play,
  Calendar,
  X,
  FileCheck,
  Pause,
  AlertOctagon,
  ShieldAlert,
} from 'lucide-react';

interface TransitionModalProps {
  card: CommitmentCard;
  targetState: CardState;
  onConfirm: (facts: Partial<CommitmentCard> & { note?: string }) => void;
  onClose: () => void;
}

export const TransitionModal: React.FC<TransitionModalProps> = ({
  card,
  targetState,
  onConfirm,
  onClose,
}) => {
  // Form fields for different states
  const [plannedDate, setPlannedDate] = useState<string>(
    card.planned_date || new Date().toISOString().split('T')[0]
  );
  const [plannedStart, setPlannedStart] = useState<string>(card.planned_start || '09:00');
  const [plannedDuration, setPlannedDuration] = useState<number>(card.planned_duration || 60);

  // Completed facts
  const [result, setResult] = useState<string>(card.result || '');
  const [proofLocation, setProofLocation] = useState<string>(card.proof_location || '');

  // Paused facts
  const [whatHappened, setWhatHappened] = useState<string>('');
  const [nextAction, setNextAction] = useState<string>(card.next_physical_action || '');

  // Blocked facts
  const [blockReason, setBlockReason] = useState<string>('');
  const [waitingFor, setWaitingFor] = useState<string>('');
  const [reviewDate, setReviewDate] = useState<string>(
    new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0]
  );
  const [fallbackAction, setFallbackAction] = useState<string>(card.fallback_action || '');

  // Ready Gate fields
  const [currentState, setCurrentState] = useState<string>(card.current_state_desc || '');
  const [desiredState, setDesiredState] = useState<string>(card.desired_state_desc || '');
  const [proofCompletion, setProofCompletion] = useState<string>(card.proof_of_completion || '');

  const [note, setNote] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    try {
      const payload: Partial<CommitmentCard> & { note?: string } = {
        note: note.trim() || undefined,
      };

      if (targetState === 'Ready') {
        if (!currentState.trim() || !desiredState.trim() || !proofCompletion.trim() || !nextAction.trim()) {
          throw new Error('Ready Gate: All 4 pillars (Current, Desired, Proof, Next Action) are required.');
        }
        if ((card.priority >= 80 || card.risk_level === 'High') && !fallbackAction.trim()) {
          throw new Error('Ready Gate: Fallback action is required for high priority (>=80) or high risk work.');
        }
        payload.current_state_desc = currentState.trim();
        payload.desired_state_desc = desiredState.trim();
        payload.proof_of_completion = proofCompletion.trim();
        payload.next_physical_action = nextAction.trim();
        if (fallbackAction.trim()) payload.fallback_action = fallbackAction.trim();
      }

      if (targetState === 'Scheduled') {
        if (!plannedDate) throw new Error('Planned date is required.');
        if (!plannedDuration || plannedDuration <= 0) {
          throw new Error('Planned duration must be a positive integer in minutes.');
        }
        payload.planned_date = plannedDate;
        payload.planned_start = plannedStart;
        payload.planned_duration = Number(plannedDuration);
      }

      if (targetState === 'Active') {
        payload.actual_start = new Date().toISOString();
      }

      if (targetState === 'Completed') {
        if (!result.trim()) throw new Error('Completed Gate: Result summary is required.');
        if (!proofLocation.trim()) throw new Error('Completed Gate: Proof location/artifact path is required.');
        payload.result = result.trim();
        payload.proof_location = proofLocation.trim();
        payload.actual_end = new Date().toISOString();
      }

      if (targetState === 'Paused') {
        if (!whatHappened.trim()) throw new Error('Paused Gate: Must state what happened.');
        if (!nextAction.trim()) throw new Error('Paused Gate: Updated next physical action is required.');
        payload.what_happened = whatHappened.trim();
        payload.next_physical_action = nextAction.trim();
        payload.actual_end = new Date().toISOString();
      }

      if (targetState === 'Blocked') {
        if (!blockReason.trim()) throw new Error('Blocked Gate: Reason is required.');
        if (!waitingFor.trim()) throw new Error('Blocked Gate: Who/what is being waited for is required.');
        if (!reviewDate) throw new Error('Blocked Gate: Review date is required.');
        if ((card.priority >= 80 || card.risk_level === 'High') && !fallbackAction.trim()) {
          throw new Error('Blocked Gate: Fallback action is required for high-risk or high-priority work.');
        }
        payload.block_reason = blockReason.trim();
        payload.waiting_for = waitingFor.trim();
        payload.review_date = reviewDate;
        if (fallbackAction.trim()) payload.fallback_action = fallbackAction.trim();
      }

      onConfirm(payload);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold text-slate-700">{card.id}</span>
              <span className="text-xs font-bold text-slate-400">&rarr;</span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-900 px-2 py-0.5 rounded bg-slate-200">
                {targetState}
              </span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mt-0.5 line-clamp-1">{card.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Target = Ready */}
          {targetState === 'Ready' && (
            <div className="space-y-3">
              <p className="text-slate-500">
                The Ready Gate ensures the commitment has crisp boundary definitions.
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  1. Current State Description *
                </label>
                <textarea
                  rows={2}
                  value={currentState}
                  onChange={(e) => setCurrentState(e.target.value)}
                  placeholder="Where do things stand right now?"
                  className="w-full border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  2. Desired State Description *
                </label>
                <textarea
                  rows={2}
                  value={desiredState}
                  onChange={(e) => setDesiredState(e.target.value)}
                  placeholder="What is the concrete finished state?"
                  className="w-full border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  3. Proof of Completion *
                </label>
                <textarea
                  rows={2}
                  value={proofCompletion}
                  onChange={(e) => setProofCompletion(e.target.value)}
                  placeholder="What tangible evidence proves completion?"
                  className="w-full border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  4. Next Physical Action *
                </label>
                <textarea
                  rows={2}
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="Immediate physical or digital next action"
                  className="w-full border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900"
                />
              </div>
              {(card.priority >= 80 || card.risk_level === 'High') && (
                <div>
                  <label className="block font-semibold text-rose-800 mb-1">
                    Fallback Action (Required for P &gt;= 80 or High Risk) *
                  </label>
                  <input
                    type="text"
                    value={fallbackAction}
                    onChange={(e) => setFallbackAction(e.target.value)}
                    placeholder="Contingency step if stalled"
                    className="w-full border border-rose-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-rose-800"
                  />
                </div>
              )}
            </div>
          )}

          {/* Target = Scheduled */}
          {targetState === 'Scheduled' && (
            <div className="space-y-3">
              <p className="text-slate-500">
                Scheduling checks duration against available weekly capacity limit.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Planned Date *
                  </label>
                  <input
                    type="date"
                    value={plannedDate}
                    onChange={(e) => setPlannedDate(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Planned Start Time
                  </label>
                  <input
                    type="time"
                    value={plannedStart}
                    onChange={(e) => setPlannedStart(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Planned Duration (Minutes) *
                </label>
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={plannedDuration}
                  onChange={(e) => setPlannedDuration(parseInt(e.target.value, 10) || 0)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {(plannedDuration / 60).toFixed(1)} hours
                </span>
              </div>
            </div>
          )}

          {/* Target = Active */}
          {targetState === 'Active' && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1">
                <span className="font-bold flex items-center space-x-1">
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Enforcing Single-Active Protocol</span>
                </span>
                <p className="text-[11px] text-amber-800">
                  Moving {card.id} to Active establishes a single focus lock. All dependencies must be verified, and no other card can run concurrently.
                </p>
              </div>
            </div>
          )}

          {/* Target = Completed */}
          {targetState === 'Completed' && (
            <div className="space-y-3">
              <p className="text-slate-500">
                PES requires explicit proof and result statements to complete any task.
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Result Description *
                </label>
                <textarea
                  rows={2}
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  placeholder="Concrete summary of what was accomplished..."
                  className="w-full border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Proof Location / Artifact *
                </label>
                <input
                  type="text"
                  value={proofLocation}
                  onChange={(e) => setProofLocation(e.target.value)}
                  placeholder="e.g. C:\proof\brief.pdf, git:commit-sha, or docs/file.md"
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono"
                />
              </div>
            </div>
          )}

          {/* Target = Paused */}
          {targetState === 'Paused' && (
            <div className="space-y-3">
              <p className="text-slate-500">
                Pausing records session state so work can be resumed without cognitive friction.
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  What Happened? *
                </label>
                <textarea
                  rows={2}
                  value={whatHappened}
                  onChange={(e) => setWhatHappened(e.target.value)}
                  placeholder="Why is execution stopping right now?"
                  className="w-full border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Next Physical Action (When Resuming) *
                </label>
                <input
                  type="text"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="The exact next action when restarted"
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                />
              </div>
            </div>
          )}

          {/* Target = Blocked */}
          {targetState === 'Blocked' && (
            <div className="space-y-3">
              <p className="text-slate-500">
                Record the blocker reason, waiting party, and mandatory review date.
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Block Reason *
                </label>
                <textarea
                  rows={2}
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Why can't work proceed?"
                  className="w-full border border-slate-300 rounded p-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Waiting For *
                  </label>
                  <input
                    type="text"
                    value={waitingFor}
                    onChange={(e) => setWaitingFor(e.target.value)}
                    placeholder="Person, vendor, or system"
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Review Date *
                  </label>
                  <input
                    type="date"
                    value={reviewDate}
                    onChange={(e) => setReviewDate(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2.5 py-1.5"
                  />
                </div>
              </div>
              {(card.priority >= 80 || card.risk_level === 'High') && (
                <div>
                  <label className="block font-semibold text-rose-800 mb-1">
                    Fallback Action (Mandatory) *
                  </label>
                  <input
                    type="text"
                    value={fallbackAction}
                    onChange={(e) => setFallbackAction(e.target.value)}
                    placeholder="Contingency plan while blocked"
                    className="w-full border border-rose-300 rounded px-2.5 py-1.5"
                  />
                </div>
              )}
            </div>
          )}

          {/* Target = Verified or Done */}
          {(targetState === 'Verified' || targetState === 'Done') && (
            <div className="space-y-2">
              <p className="text-slate-600">
                {targetState === 'Verified'
                  ? 'Confirming that proof artifacts are inspected and certified against desired completion criteria.'
                  : 'Moving card to permanent Done archive.'}
              </p>
            </div>
          )}

          {/* Optional Transition Note */}
          <div>
            <label className="block font-semibold text-slate-600 mb-1">
              Transition Note (Optional Audit Record)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Standard morning shift transition"
              className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-slate-700"
            />
          </div>

          {/* Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-white font-semibold bg-slate-900 hover:bg-slate-800 shadow-2xs"
            >
              Confirm Transition to {targetState}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

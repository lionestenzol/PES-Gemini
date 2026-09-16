import React, { useState } from 'react';
import { CommitmentCard } from '../types.js';
import { X, Plus, AlertCircle } from 'lucide-react';

interface NewCardModalProps {
  onClose: () => void;
  onCreateCard: (card: Partial<CommitmentCard>) => void;
}

export const NewCardModal: React.FC<NewCardModalProps> = ({ onClose, onCreateCard }) => {
  const [name, setName] = useState('');
  const [priority, setPriority] = useState(50);
  const [riskLevel, setRiskLevel] = useState<'Low' | 'Medium' | 'High'>('Low');
  const [startDirectlyAsReady, setStartDirectlyAsReady] = useState(false);

  // 4 pillars
  const [currentState, setCurrentState] = useState('');
  const [desiredState, setDesiredState] = useState('');
  const [proof, setProof] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [fallbackAction, setFallbackAction] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Card title is required.');
      return;
    }

    if (startDirectlyAsReady) {
      if (!currentState.trim() || !desiredState.trim() || !proof.trim() || !nextAction.trim()) {
        setError('Ready Gate requires all 4 pillars to be completed.');
        return;
      }
      if ((priority >= 80 || riskLevel === 'High') && !fallbackAction.trim()) {
        setError('Ready Gate requires fallback action for priority >= 80 or high risk.');
        return;
      }
    }

    onCreateCard({
      name: name.trim(),
      priority,
      risk_level: riskLevel,
      current_state_desc: currentState.trim(),
      desired_state_desc: desiredState.trim(),
      proof_of_completion: proof.trim(),
      next_physical_action: nextAction.trim(),
      fallback_action: fallbackAction.trim() || null,
      state: startDirectlyAsReady ? 'Ready' : 'Captured',
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded bg-slate-900 text-white flex items-center justify-center">
              <Plus className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">New Commitment Card</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Title *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Concrete objective description..."
              required
              className="w-full text-xs border border-slate-300 rounded px-3 py-2 focus:ring-1 focus:ring-slate-900"
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
                className="w-full text-xs border border-slate-300 rounded px-3 py-1.5 focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Risk Level</label>
              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value as any)}
                className="w-full text-xs border border-slate-300 rounded px-3 py-1.5 focus:ring-1 focus:ring-slate-900"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center space-x-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={startDirectlyAsReady}
                onChange={(e) => setStartDirectlyAsReady(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span className="font-semibold text-slate-800">
                Complete 4 pillars now (enter directly as 'Ready')
              </span>
            </label>

            {startDirectlyAsReady && (
              <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-0.5">1. Current State *</label>
                    <textarea
                      rows={2}
                      value={currentState}
                      onChange={(e) => setCurrentState(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-0.5">2. Desired State *</label>
                    <textarea
                      rows={2}
                      value={desiredState}
                      onChange={(e) => setDesiredState(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1.5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-0.5">3. Proof of Completion *</label>
                    <textarea
                      rows={2}
                      value={proof}
                      onChange={(e) => setProof(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-0.5">4. Next Physical Action *</label>
                    <textarea
                      rows={2}
                      value={nextAction}
                      onChange={(e) => setNextAction(e.target.value)}
                      className="w-full border border-slate-300 rounded p-1.5"
                    />
                  </div>
                </div>

                {(priority >= 80 || riskLevel === 'High') && (
                  <div>
                    <label className="block font-medium text-rose-800 mb-0.5">
                      Fallback Action (Required for P &gt;= 80 or High Risk) *
                    </label>
                    <input
                      type="text"
                      value={fallbackAction}
                      onChange={(e) => setFallbackAction(e.target.value)}
                      className="w-full border border-rose-300 rounded px-2.5 py-1.5"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
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
              Create Commitment Card
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

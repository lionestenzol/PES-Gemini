import React, { useState } from 'react';
import { InboxItem, CommitmentCard } from '../types.js';
import {
  Inbox,
  Send,
  Sparkles,
  ArrowRight,
  Trash2,
  Clock,
  CheckCircle2,
  FileText,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface InboxViewProps {
  inbox: InboxItem[];
  onAddInboxItem: (text: string) => void;
  onProcessInboxItem: (
    id: number,
    action: 'define' | 'discard' | 'defer',
    cardPayload?: Partial<CommitmentCard>
  ) => void;
}

export const InboxView: React.FC<InboxViewProps> = ({
  inbox,
  onAddInboxItem,
  onProcessInboxItem,
}) => {
  const [inputText, setInputText] = useState('');
  const [processingId, setProcessingId] = useState<number | null>(null);

  // 4 pillars definition form state for converting an inbox item
  const [defName, setDefName] = useState('');
  const [currentState, setCurrentState] = useState('');
  const [desiredState, setDesiredState] = useState('');
  const [proof, setProof] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [priority, setPriority] = useState<number>(50);
  const [riskLevel, setRiskLevel] = useState<'Low' | 'Medium' | 'High'>('Low');
  const [fallbackAction, setFallbackAction] = useState('');

  const handleCaptureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onAddInboxItem(inputText.trim());
    setInputText('');
  };

  const startProcessing = (item: InboxItem) => {
    setProcessingId(item.id);
    setDefName(item.raw_text);
    setCurrentState('');
    setDesiredState('');
    setProof('');
    setNextAction('');
    setPriority(50);
    setRiskLevel('Low');
    setFallbackAction('');
  };

  const handleConfirmDefinition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!processingId) return;

    if (!defName.trim()) {
      alert('Commitment name is required');
      return;
    }

    onProcessInboxItem(processingId, 'define', {
      name: defName.trim(),
      current_state_desc: currentState.trim(),
      desired_state_desc: desiredState.trim(),
      proof_of_completion: proof.trim(),
      next_physical_action: nextAction.trim(),
      priority,
      risk_level: riskLevel,
      fallback_action: fallbackAction.trim() || null,
    });

    setProcessingId(null);
  };

  const activeInbox = inbox.filter((i) => i.mark === '?' && !i.processed_at);
  const processedInbox = inbox.filter((i) => i.processed_at);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner & Quick Capture Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs">
        <div className="flex items-center space-x-2 mb-2">
          <Inbox className="w-5 h-5 text-slate-800" />
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Quick Capture & Definition Ingestion
          </h2>
        </div>
        <p className="text-xs text-slate-500 mb-4 max-w-2xl">
          Dump unstructured ideas, demands, or observations here without friction. Later, process them through the 4-pillar PES definition gate to produce actionable commitment cards.
        </p>

        <form onSubmit={handleCaptureSubmit} className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type raw thought, incoming request, or observation..."
            className="flex-1 text-xs border border-slate-300 rounded-lg px-3.5 py-2.5 focus:ring-1 focus:ring-slate-900 focus:outline-hidden"
          />
          <button
            type="submit"
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-2xs shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Capture</span>
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unprocessed Items List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
              <span>Unprocessed Inbox</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
                {activeInbox.length}
              </span>
            </h3>
            <span className="text-[11px] text-slate-400">Mark: ? (unprocessed)</span>
          </div>

          {activeInbox.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-xs font-medium text-slate-600">Inbox Zero achieved!</p>
              <p className="text-[11px] text-slate-400 mt-1">
                All raw thoughts have been processed or discarded.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {activeInbox.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white border rounded-xl p-3.5 shadow-2xs transition-all ${
                    processingId === item.id
                      ? 'border-blue-400 ring-2 ring-blue-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 text-[10px] text-slate-400 mb-1 font-mono">
                        <span>#{item.id}</span>
                        <span>•</span>
                        <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-xs font-medium text-slate-900">{item.raw_text}</p>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      <button
                        onClick={() => startProcessing(item)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200"
                      >
                        <span>Define</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onProcessInboxItem(item.id, 'discard')}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                        title="Discard thought"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Definition Form Panel (Active when an item is selected for processing) */}
        <div>
          {processingId ? (
            <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Process into PES Commitment Card
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Specify the 4 pillars to elevate raw text into an actionable commitment.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProcessingId(null)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleConfirmDefinition} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Card Name / Title *
                  </label>
                  <input
                    type="text"
                    value={defName}
                    onChange={(e) => setDefName(e.target.value)}
                    required
                    className="w-full text-xs border border-slate-300 rounded px-3 py-1.5 focus:ring-1 focus:ring-slate-900 focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      1. Current State Description
                    </label>
                    <textarea
                      rows={2}
                      value={currentState}
                      onChange={(e) => setCurrentState(e.target.value)}
                      placeholder="What is the baseline right now?"
                      className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      2. Desired State Description
                    </label>
                    <textarea
                      rows={2}
                      value={desiredState}
                      onChange={(e) => setDesiredState(e.target.value)}
                      placeholder="What is the concrete finished state?"
                      className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      3. Proof of Completion
                    </label>
                    <textarea
                      rows={2}
                      value={proof}
                      onChange={(e) => setProof(e.target.value)}
                      placeholder="What physical or digital artifact proves it?"
                      className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      4. Next Physical Action
                    </label>
                    <textarea
                      rows={2}
                      value={nextAction}
                      onChange={(e) => setNextAction(e.target.value)}
                      placeholder="The immediate concrete next action to take"
                      className="w-full text-xs border border-slate-300 rounded p-2 focus:ring-1 focus:ring-slate-900 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Priority (0 - 100)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={priority}
                      onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                      className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Risk Level
                    </label>
                    <select
                      value={riskLevel}
                      onChange={(e) => setRiskLevel(e.target.value as any)}
                      className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>

                {(priority >= 80 || riskLevel === 'High') && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                    <label className="block text-xs font-bold text-rose-900 mb-1">
                      Fallback Action (Required for High-Priority / High-Risk work)
                    </label>
                    <input
                      type="text"
                      value={fallbackAction}
                      onChange={(e) => setFallbackAction(e.target.value)}
                      placeholder="What is the fallback if blocked or stalled?"
                      className="w-full text-xs border border-rose-300 rounded px-2.5 py-1.5 focus:ring-1 focus:ring-rose-800"
                    />
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setProcessingId(null)}
                    className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 shadow-2xs"
                  >
                    Create Card
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center space-y-2">
              <FileText className="w-8 h-8 text-slate-300 mx-auto" />
              <h4 className="text-xs font-bold text-slate-700">The 4-Pillar Definition Standard</h4>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                Select any captured item on the left and click "Define" to convert it into a card satisfying the PES Ready Gate.
              </p>
            </div>
          )}

          {/* Processed Archive Section */}
          {processedInbox.length > 0 && (
            <div className="mt-6 space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Processed History ({processedInbox.length})
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {processedInbox.map((item) => (
                  <div
                    key={item.id}
                    className="text-xs p-2 rounded bg-white border border-slate-100 flex items-center justify-between text-slate-500"
                  >
                    <span className="line-clamp-1">{item.raw_text}</span>
                    <span className="text-[10px] font-mono shrink-0 ml-2">
                      {item.process_action === 'define' && item.card_id && `-> ${item.card_id}`}
                      {item.process_action === 'discard' && '(discarded)'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

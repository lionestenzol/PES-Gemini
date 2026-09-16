import React, { useState, useEffect } from 'react';
import {
  Inbox,
  Sparkles,
  ArrowRight,
  Send,
  Zap,
  CheckCircle2,
  Clock,
  Layers,
  ListTree,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  Check,
  Tag,
  FolderPlus,
  Play,
} from 'lucide-react';
import { InboxItem, CommitmentCard } from '../types.js';

interface LineItem {
  id: string | number;
  text: string;
  category: 'promote_v2' | 'the_line' | 'quick_task' | 'incubate';
  priorityScore: number;
  reasoning: string;
  suggestedTags: string[];
}

interface TheLineViewProps {
  inbox: InboxItem[];
  onAddInboxItem: (text: string) => void;
  onSendToV2Pipeline: (text: string) => void;
  onSendToV1Board: (title: string, priorityScore?: number) => void;
  onOpenStuckModal: (itemText?: string) => void;
}

export const TheLineView: React.FC<TheLineViewProps> = ({
  inbox,
  onAddInboxItem,
  onSendToV2Pipeline,
  onSendToV1Board,
  onOpenStuckModal,
}) => {
  const [quickDropInput, setQuickDropInput] = useState('');
  const [isSorting, setIsSorting] = useState(false);
  const [sortSummary, setSortSummary] = useState<string | null>(null);

  // Staged items in The Line
  const [lineItems, setLineItems] = useState<LineItem[]>(() => {
    // Initial mock / local items reflecting DropList contents
    return inbox.map((item, idx) => ({
      id: item.id,
      text: item.raw_text,
      category:
        item.raw_text.length > 60 || item.raw_text.toLowerCase().includes('database') || item.raw_text.toLowerCase().includes('architecture')
          ? 'promote_v2'
          : idx % 2 === 0
          ? 'the_line'
          : 'quick_task',
      priorityScore: 85 - idx * 5,
      reasoning: 'Initial heuristic based on input complexity and operational scope.',
      suggestedTags: ['#Triage', '#TheLine'],
    }));
  });

  // Sync when inbox changes if empty
  useEffect(() => {
    if (lineItems.length === 0 && inbox.length > 0) {
      setLineItems(
        inbox.map((item, idx) => ({
          id: item.id,
          text: item.raw_text,
          category: idx % 2 === 0 ? 'the_line' : 'quick_task',
          priorityScore: 80 - idx * 5,
          reasoning: 'Imported from raw DropList.',
          suggestedTags: ['#DropList'],
        }))
      );
    }
  }, [inbox]);

  const handleQuickDrop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickDropInput.trim()) return;

    const text = quickDropInput.trim();
    onAddInboxItem(text);

    // Also add to local line items
    const newItem: LineItem = {
      id: Date.now(),
      text,
      category: 'the_line',
      priorityScore: 75,
      reasoning: 'Freshly dropped item queued in The Line.',
      suggestedTags: ['#NewDrop'],
    };

    setLineItems((prev) => [newItem, ...prev]);
    setQuickDropInput('');
  };

  const handleRunAiSort = async () => {
    setIsSorting(true);
    try {
      const itemsPayload = lineItems.map((item) => ({
        id: item.id,
        text: item.text,
      }));

      const res = await fetch('/api/agent/sort-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemsPayload,
          customPrompt: 'Sort into Promote to V2, The Line (Next Up), Quick Tasks, and Incubate based on technical scope and cognitive effort.',
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.sortedItems) {
          setLineItems(
            json.data.sortedItems.map((s: any) => ({
              id: s.id,
              text: s.text,
              category: s.actionType || 'the_line',
              priorityScore: s.priorityScore || 70,
              reasoning: s.reasoning || 'AI triage recommendation.',
              suggestedTags: s.suggestedTags || ['#TheLine'],
            }))
          );
          setSortSummary(json.data.summary);
        }
      }
    } catch (err) {
      console.error('Error running AI line sort:', err);
    } finally {
      setIsSorting(false);
    }
  };

  const moveCategory = (id: string | number, newCategory: LineItem['category']) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, category: newCategory } : item))
    );
  };

  const promoteToV2 = (item: LineItem) => {
    onSendToV2Pipeline(item.text);
    // Remove from Line once compiled to V2
    setLineItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const promoteToV1Board = (item: LineItem) => {
    onSendToV1Board(item.text, item.priorityScore);
    setLineItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const v2Items = lineItems.filter((i) => i.category === 'promote_v2');
  const lineQueuedItems = lineItems.filter((i) => i.category === 'the_line');
  const quickItems = lineItems.filter((i) => i.category === 'quick_task');
  const incubateItems = lineItems.filter((i) => i.category === 'incubate');

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner & Drop Zone */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-lg bg-indigo-950/80 border border-indigo-800 text-indigo-400">
                <Layers className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>The Line</span>
                  <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                    ORCHESTRATION & PLANNING BIN
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  The active bridge between raw DropList offload, the PES V2 Transformation Compiler, and the Single-Active Board.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRunAiSort}
              disabled={isSorting || lineItems.length === 0}
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isSorting ? 'animate-spin' : ''}`} />
              <span>{isSorting ? 'AI Orchestrating...' : 'Run AI Line Sort'}</span>
            </button>
            <button
              onClick={() => onOpenStuckModal()}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/80 rounded-lg text-xs font-semibold transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>I'm Stuck</span>
            </button>
          </div>
        </div>

        {/* Drop Input Strip */}
        <form onSubmit={handleQuickDrop} className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={quickDropInput}
            onChange={(e) => setQuickDropInput(e.target.value)}
            placeholder="Drop an idea or thought to clear your mind into The Line..."
            className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={!quickDropInput.trim()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 shrink-0"
          >
            Drop Item
          </button>
        </form>

        {/* AI Sort Summary Notification */}
        {sortSummary && (
          <div className="mt-3 p-2.5 rounded-lg bg-indigo-950/50 border border-indigo-800/60 text-xs text-indigo-200 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong>AI Orchestration Result:</strong> {sortSummary}
            </div>
            <button
              onClick={() => setSortSummary(null)}
              className="text-indigo-400 hover:text-white text-xs"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* 4 Lanes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Column 1: Promote to PES V2 Engine */}
        <div className="bg-slate-900 border border-purple-900/40 rounded-xl flex flex-col h-[520px] shadow-sm">
          <div className="p-3.5 border-b border-purple-900/30 bg-purple-950/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Promote to PES V2
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-900/60 text-purple-200">
              {v2Items.length}
            </span>
          </div>
          <div className="p-2 text-[10px] text-purple-300/80 bg-purple-950/10 border-b border-purple-900/20">
            Multi-stage architecture & complex initiatives requiring Tree/BPMN compilation.
          </div>
          <div className="flex-1 p-3 overflow-y-auto space-y-2.5">
            {v2Items.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">No items staged for V2.</div>
            ) : (
              v2Items.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-950 border border-purple-900/40 rounded-lg hover:border-purple-600/60 transition-all text-xs flex flex-col justify-between gap-2"
                >
                  <div className="text-slate-200 font-medium">{item.text}</div>
                  <div className="text-[10px] text-slate-400 italic">{item.reasoning}</div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                    <span className="text-[9px] font-mono text-purple-300">
                      Score: {item.priorityScore}
                    </span>
                    <button
                      onClick={() => promoteToV2(item)}
                      className="flex items-center gap-1 px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-[10px] font-semibold transition-colors"
                    >
                      <span>Compile V2</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: The Line (Next Up) */}
        <div className="bg-slate-900 border border-indigo-900/40 rounded-xl flex flex-col h-[520px] shadow-sm">
          <div className="p-3.5 border-b border-indigo-900/30 bg-indigo-950/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                The Line (Next Up)
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-200">
              {lineQueuedItems.length}
            </span>
          </div>
          <div className="p-2 text-[10px] text-indigo-300/80 bg-indigo-950/10 border-b border-indigo-900/20">
            Sequenced queue ready for execution commitment or delegation.
          </div>
          <div className="flex-1 p-3 overflow-y-auto space-y-2.5">
            {lineQueuedItems.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">The Line is clear.</div>
            ) : (
              lineQueuedItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-lg hover:border-indigo-600/60 transition-all text-xs flex flex-col justify-between gap-2"
                >
                  <div className="text-slate-200 font-medium">{item.text}</div>
                  <div className="text-[10px] text-slate-400 italic">{item.reasoning}</div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                    <span className="text-[9px] font-mono text-indigo-400">
                      Pri: {item.priorityScore}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveCategory(item.id, 'promote_v2')}
                        className="px-1.5 py-0.5 text-[9px] bg-slate-800 hover:bg-purple-900 text-slate-300 hover:text-purple-200 rounded"
                        title="Move to V2"
                      >
                        → V2
                      </button>
                      <button
                        onClick={() => promoteToV1Board(item)}
                        className="flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-semibold transition-colors"
                      >
                        <span>To Board</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 3: Quick Tasks */}
        <div className="bg-slate-900 border border-emerald-900/40 rounded-xl flex flex-col h-[520px] shadow-sm">
          <div className="p-3.5 border-b border-emerald-900/30 bg-emerald-950/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Quick Tasks (⚡ &lt;15m)
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-200">
              {quickItems.length}
            </span>
          </div>
          <div className="p-2 text-[10px] text-emerald-300/80 bg-emerald-950/10 border-b border-emerald-900/20">
            Atomic actions that don't need heavy planning; run right away.
          </div>
          <div className="flex-1 p-3 overflow-y-auto space-y-2.5">
            {quickItems.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">No quick items queued.</div>
            ) : (
              quickItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-lg hover:border-emerald-600/60 transition-all text-xs flex flex-col justify-between gap-2"
                >
                  <div className="text-slate-200 font-medium">{item.text}</div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                    <span className="text-[9px] font-mono text-emerald-400">15 min</span>
                    <button
                      onClick={() => promoteToV1Board(item)}
                      className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[10px] font-semibold transition-colors"
                    >
                      Commit Now
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 4: Incubate / Hold */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[520px] shadow-sm">
          <div className="p-3.5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Incubate / Park
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              {incubateItems.length}
            </span>
          </div>
          <div className="p-2 text-[10px] text-slate-400 bg-slate-950/20 border-b border-slate-800">
            Raw thoughts safely held without creating mental overhead.
          </div>
          <div className="flex-1 p-3 overflow-y-auto space-y-2.5">
            {incubateItems.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">Holding bay is empty.</div>
            ) : (
              incubateItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg text-xs flex flex-col justify-between gap-2"
                >
                  <div className="text-slate-300">{item.text}</div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                    <span className="text-[9px] text-slate-500">Parked</span>
                    <button
                      onClick={() => moveCategory(item.id, 'the_line')}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px]"
                    >
                      Move to Line
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

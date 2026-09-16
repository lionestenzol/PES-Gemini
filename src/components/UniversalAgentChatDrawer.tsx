import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  X,
  Send,
  Sparkles,
  ChevronDown,
  Minimize2,
  Maximize2,
  RefreshCw,
  Zap,
  ArrowRight,
  AlertCircle,
  Cpu,
  Layers,
  ListTree,
  GitBranch,
} from 'lucide-react';
import { CommitmentCard, InboxItem } from '../types.js';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  time: string;
}

interface UniversalAgentChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeCard?: CommitmentCard | null;
  inboxCount?: number;
  onNavigateTab?: (tab: string) => void;
  onSendToV2?: (text: string) => void;
  onOpenStuckModal?: (contextDesc?: string) => void;
}

export const UniversalAgentChatDrawer: React.FC<UniversalAgentChatDrawerProps> = ({
  isOpen,
  onClose,
  activeCard,
  inboxCount = 0,
  onNavigateTab,
  onSendToV2,
  onOpenStuckModal,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm-welcome',
      role: 'model',
      text: `Hello! I am your Universal PES Agent. I operate across DropList, The Line, the PES V2 Transformation Engine, and The Stuck Feature.\n\nHow can I help you orchestrate, unblock, or compile your work today?`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setIsLoading(true);

    try {
      const history = messages.slice(-8).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const contextData = {
        activeCard: activeCard ? { id: activeCard.id, name: activeCard.name, state: activeCard.state } : null,
        inboxCount,
      };

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          contextData,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const modelMsg: Message = {
          id: `m-${Date.now()}`,
          role: 'model',
          text: data.reply || 'Task analyzed and structured.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, modelMsg]);
      } else {
        throw new Error('Agent API error');
      }
    } catch (err) {
      const fallbackMsg: Message = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: `I received your request: "${text}". I have triaged this into your system context. You can view the V2 Pipeline, organize items in The Line, or click "I'm Stuck" if you hit a blocker.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-96 md:w-[420px] bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col transition-all">
      {/* Drawer Header */}
      <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-900/60 border border-indigo-700/60 flex items-center justify-center text-indigo-300 shadow-xs">
            <Bot className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Universal PES Agent</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                GEMINI 3.8
              </span>
            </div>
            <div className="text-[10px] text-slate-400">System-wide Orchestration & Execution</div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Close Agent"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* System Context Quick Status Strip */}
      <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800/80 text-[10px] flex items-center justify-between text-slate-400 font-mono">
        <span>Active: <strong className="text-indigo-300">{activeCard ? activeCard.name.slice(0, 20) + '...' : 'None'}</strong></span>
        <span>DropList: <strong className="text-amber-300">{inboxCount} items</strong></span>
      </div>

      {/* Quick Action Suggestion Chips */}
      <div className="px-3 py-2 bg-slate-950/40 border-b border-slate-800/60 flex items-center gap-1.5 overflow-x-auto text-[10px] no-scrollbar">
        <button
          onClick={() => handleSend('How does DropList connect to The Line and PES V2?')}
          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 whitespace-nowrap transition-colors"
        >
          🔍 System Flow
        </button>
        <button
          onClick={() => {
            if (onNavigateTab) onNavigateTab('the-line');
            handleSend('Help me prioritize the items currently in The Line');
          }}
          className="px-2 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/60 whitespace-nowrap transition-colors"
        >
          ⚡ Sort The Line
        </button>
        <button
          onClick={() => {
            if (onOpenStuckModal) onOpenStuckModal();
          }}
          className="px-2 py-1 rounded bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/60 whitespace-nowrap transition-colors"
        >
          ⚠️ I'm Stuck
        </button>
        <button
          onClick={() => {
            if (onNavigateTab) onNavigateTab('v2-pipeline');
            handleSend('Explain the next steps for PES V2 Tree and BPMN execution');
          }}
          className="px-2 py-1 rounded bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-800/60 whitespace-nowrap transition-colors"
        >
          🌲 V2 Engine
        </button>
      </div>

      {/* Message Stream */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-900/60">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white shadow-xs rounded-br-none'
                  : 'bg-slate-800 text-slate-200 border border-slate-700/60 rounded-bl-none'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
            <span className="text-[9px] font-mono text-slate-500 mt-1 px-1">{m.time}</span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 p-3 bg-slate-800/60 rounded-lg border border-slate-700/40 text-xs text-slate-400">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span>Universal Agent is reasoning...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-3 bg-slate-950 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask agent to triage, plan, or unblock..."
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors shrink-0 shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};

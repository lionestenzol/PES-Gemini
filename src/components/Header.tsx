import React from 'react';
import {
  Kanban,
  CalendarDays,
  Inbox,
  Gauge,
  CheckCircle2,
  History,
  Plus,
  Sparkles,
  ShieldAlert,
  Clock,
  User,
  ShieldCheck,
  Smartphone,
  Columns,
  Cpu,
  Layers,
  Bot,
  Zap,
} from 'lucide-react';
import { ActiveTab, OperatingMode, UserIdentity } from '../types.js';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  mode: OperatingMode;
  setMode: (mode: OperatingMode) => void;
  onOpenNewCard: () => void;
  onOpenQuickCapture: () => void;
  totalCards: number;
  inboxCount: number;
  currentUser: UserIdentity;
  users: UserIdentity[];
  onSelectUser: (user: UserIdentity) => void;
  isSplitView?: boolean;
  onToggleSplitView?: () => void;
  onOpenAgentDrawer?: () => void;
  onOpenStuckModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  mode,
  setMode,
  onOpenNewCard,
  onOpenQuickCapture,
  totalCards,
  inboxCount,
  currentUser,
  users,
  onSelectUser,
  isSplitView,
  onToggleSplitView,
  onOpenAgentDrawer,
  onOpenStuckModal,
}) => {
  const modes: OperatingMode[] = ['Full', 'Reduced', 'Recovery', 'Admin', 'Field', 'Review'];

  const navItems: {
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
    badge?: string;
  }[] = [
    { id: 'board', label: 'Lifecycle Board', icon: Kanban, count: totalCards },
    { id: 'the-line', label: 'The Line', icon: Layers, badge: 'AI BIN' },
    { id: 'v2-pipeline', label: 'PES V2 Engine', icon: Cpu, badge: 'V2' },
    { id: 'droplist', label: 'DropList Console', icon: Smartphone, badge: 'FIELD' },
    { id: 'queue', label: 'Daily Queue', icon: CalendarDays },
    { id: 'optimizer', label: 'Optimizer (Path D)', icon: Sparkles },
    { id: 'inbox', label: 'Inbox', icon: Inbox, count: inboxCount },
    { id: 'capacity', label: 'Capacity Planner', icon: Gauge },
    { id: 'proof', label: 'Proof Index', icon: CheckCircle2 },
    { id: 'logs', label: 'Audit Log', icon: History },
  ];

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and System Title */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white font-mono font-bold text-sm tracking-wider shadow-sm">
              PES
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold text-slate-900 tracking-tight">
                  Personal Execution System
                </h1>
                <span className="text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Path E Engine
                </span>
              </div>
              <p className="text-xs text-slate-500">Guarded Single-Active Commitment Control</p>
            </div>
          </div>

          {/* Mode Selector, Role Persona, and Quick Actions */}
          <div className="flex items-center space-x-3">
            {/* Path C Persona / Role Selector */}
            <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500 pl-1.5 pr-1 uppercase tracking-wider flex items-center gap-1">
                <User className="w-3 h-3 text-slate-500" />
                Actor:
              </span>
              <select
                value={currentUser.id}
                onChange={(e) => {
                  const found = users.find((u) => u.id === e.target.value);
                  if (found) onSelectUser(found);
                }}
                className="text-xs font-semibold bg-white text-slate-800 border border-slate-200 rounded px-2 py-1 shadow-2xs focus:outline-hidden focus:ring-1 focus:ring-slate-900 cursor-pointer"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role.toUpperCase()})
                  </option>
                ))}
              </select>
              <span
                className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${
                  currentUser.role === 'admin'
                    ? 'bg-purple-100 text-purple-800'
                    : currentUser.role === 'verifier'
                    ? 'bg-emerald-100 text-emerald-800'
                    : currentUser.role === 'scheduler'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {currentUser.role}
              </span>
            </div>

            {/* Operating Mode Selector */}
            <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500 pl-1.5 pr-1 uppercase tracking-wider flex items-center">
                Mode:
              </span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as OperatingMode)}
                className="text-xs font-semibold bg-white text-slate-800 border border-slate-200 rounded px-2 py-1 shadow-2xs focus:outline-hidden focus:ring-1 focus:ring-slate-900 cursor-pointer"
              >
                {modes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Split Screen Field Mode Toggle */}
            {onToggleSplitView && (
              <button
                onClick={onToggleSplitView}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  isSplitView
                    ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs'
                    : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border-slate-200'
                }`}
                title="Toggle Split-Screen Mobile/Field Console on Desktop"
              >
                <Columns className="w-3.5 h-3.5 text-amber-600" />
                <span>{isSplitView ? 'Close Split' : 'Split View'}</span>
              </button>
            )}

            {/* The Stuck Feature Action */}
            {onOpenStuckModal && (
              <button
                onClick={onOpenStuckModal}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 transition-colors shadow-2xs"
                title="Open AI Diagnostic & Reroute Engine"
              >
                <Zap className="w-3.5 h-3.5 text-amber-700" />
                <span>I'm Stuck</span>
              </button>
            )}

            {/* Universal Agent Drawer Trigger */}
            {onOpenAgentDrawer && (
              <button
                onClick={onOpenAgentDrawer}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-900 bg-indigo-100 hover:bg-indigo-200 border border-indigo-300 transition-colors shadow-2xs"
                title="Open Universal PES Agent"
              >
                <Bot className="w-3.5 h-3.5 text-indigo-700" />
                <span>AI Agent</span>
              </button>
            )}

            {/* Quick Capture Button */}
            <button
              onClick={onOpenQuickCapture}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Capture</span>
            </button>

            {/* New Commitment Button */}
            <button
              onClick={onOpenNewCard}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Commitment</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 overflow-x-auto scrollbar-none border-t border-slate-100 pt-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-2 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-slate-900 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-slate-900' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 uppercase tracking-wider">
                    {item.badge}
                  </span>
                )}
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};

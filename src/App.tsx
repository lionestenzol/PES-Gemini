import React, { useState, useEffect, useCallback } from 'react';
import {
  CommitmentCard,
  CardState,
  CapacityRecord,
  InboxItem,
  ProofRecord,
  AuditEvent,
  ActiveTab,
  OperatingMode,
  UserIdentity,
  OptimizerProposal,
} from './types.js';
import { globalPesEngine, getMondayOfWeek, DEFAULT_USERS } from './lib/pes-engine.js';
import { Header } from './components/Header.js';
import { ActiveBar } from './components/ActiveBar.js';
import { BoardView } from './components/BoardView.js';
import { DailyQueueView } from './components/DailyQueueView.js';
import { OptimizerView } from './components/OptimizerView.js';
import { DropListConsole } from './components/DropListConsole.js';
import { InboxView } from './components/InboxView.js';
import { CapacityView } from './components/CapacityView.js';
import { ProofLedgerView } from './components/ProofLedgerView.js';
import { AuditLogView } from './components/AuditLogView.js';
import { PesV2PipelineView } from './components/PesV2PipelineView.js';
import { TheLineView } from './components/TheLineView.js';
import { UniversalAgentChatDrawer } from './components/UniversalAgentChatDrawer.js';
import { StuckDiagnosticModal } from './components/StuckDiagnosticModal.js';
import { CardDetailModal } from './components/CardDetailModal.js';
import { TransitionModal } from './components/TransitionModal.js';
import { NewCardModal } from './components/NewCardModal.js';
import { AlertCircle, X, Bot, Zap } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('board');
  const [mode, setMode] = useState<OperatingMode>('Full');

  // Path C Personas & Identities
  const [users, setUsers] = useState<UserIdentity[]>(DEFAULT_USERS);
  const [currentUser, setCurrentUser] = useState<UserIdentity>(DEFAULT_USERS[0]);

  const [cards, setCards] = useState<CommitmentCard[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [capacity, setCapacity] = useState<CapacityRecord>(
    globalPesEngine.getCapacity(getMondayOfWeek())
  );
  const [capacityRecords, setCapacityRecords] = useState<CapacityRecord[]>(
    globalPesEngine.getCapacityRecords()
  );
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [logs, setLogs] = useState<AuditEvent[]>([]);

  // Modals & Selections
  const [selectedCard, setSelectedCard] = useState<CommitmentCard | null>(null);
  const [transitionState, setTransitionState] = useState<{
    card: CommitmentCard;
    targetState: CardState;
  } | null>(null);
  const [isNewCardOpen, setIsNewCardOpen] = useState(false);
  const [isSplitView, setIsSplitView] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Universal Agent & The Stuck Feature states
  const [isAgentDrawerOpen, setIsAgentDrawerOpen] = useState(false);
  const [isStuckModalOpen, setIsStuckModalOpen] = useState(false);
  const [stuckInitialText, setStuckInitialText] = useState('');

  // Sync state from server/engine
  const refreshAll = useCallback(async () => {
    try {
      // Attempt API fetch
      const res = await fetch('/v1/commitments');
      if (res.ok) {
        const json = await res.json();
        setCards(json.data);
      } else {
        setCards(globalPesEngine.getCards());
      }
    } catch {
      setCards(globalPesEngine.getCards());
    }

    try {
      const res = await fetch('/v1/inbox');
      if (res.ok) {
        const json = await res.json();
        setInbox(json.data);
      } else {
        setInbox(globalPesEngine.getInbox());
      }
    } catch {
      setInbox(globalPesEngine.getInbox());
    }

    try {
      const thisWeek = getMondayOfWeek();
      const res = await fetch(`/v1/capacity/${thisWeek}`);
      if (res.ok) {
        const json = await res.json();
        setCapacity(json.data);
      } else {
        setCapacity(globalPesEngine.getCapacity(thisWeek));
      }
    } catch {
      setCapacity(globalPesEngine.getCapacity(getMondayOfWeek()));
    }

    try {
      const res = await fetch('/v1/proof');
      if (res.ok) {
        const json = await res.json();
        setProofs(json.data);
      } else {
        setProofs(globalPesEngine.getProofIndex());
      }
    } catch {
      setProofs(globalPesEngine.getProofIndex());
    }

    try {
      const res = await fetch('/v1/log');
      if (res.ok) {
        const json = await res.json();
        setLogs(json.data);
      } else {
        setLogs(globalPesEngine.getLogs());
      }
    } catch {
      setLogs(globalPesEngine.getLogs());
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Handle Guarded State Transition
  const handleInitiateTransition = (card: CommitmentCard, targetState: CardState) => {
    // If transitioning to Active, Completed, Paused, Blocked, Ready, or Scheduled,
    // open the transition modal to prompt for required facts
    const factsRequiredStates: CardState[] = [
      'Ready',
      'Scheduled',
      'Active',
      'Completed',
      'Paused',
      'Blocked',
    ];

    if (factsRequiredStates.includes(targetState)) {
      setTransitionState({ card, targetState });
    } else {
      // Direct transition (e.g. Verified, Done, Canceled)
      executeMove(card.id, targetState, {});
    }
  };

  const executeMove = async (
    cardId: string,
    targetState: CardState,
    facts: Partial<CommitmentCard> & { note?: string }
  ) => {
    setErrorBanner(null);
    const enrichedFacts = {
      ...facts,
      actor: currentUser.id,
      actor_role: currentUser.role,
    };
    try {
      const res = await fetch(`/v1/commitments/${cardId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: targetState, ...enrichedFacts }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: 'Transition failed' }));
        throw new Error(errJson.error || 'Transition rejected by PES constraints');
      }

      setTransitionState(null);
      if (selectedCard && selectedCard.id === cardId) {
        const updated = await res.json();
        setSelectedCard(updated.data);
      }
      await refreshAll();
    } catch (err: any) {
      // Fallback directly to local engine if offline/proxy issue
      try {
        globalPesEngine.moveCard(cardId, targetState, enrichedFacts);
        setTransitionState(null);
        if (selectedCard && selectedCard.id === cardId) {
          setSelectedCard(globalPesEngine.getCard(cardId) || null);
        }
        await refreshAll();
      } catch (innerErr: any) {
        setErrorBanner(innerErr.message || err.message);
      }
    }
  };

  const handleCreateCard = async (cardData: Partial<CommitmentCard>) => {
    setErrorBanner(null);
    try {
      const res = await fetch('/v1/commitments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      setIsNewCardOpen(false);
      await refreshAll();
    } catch (err: any) {
      try {
        globalPesEngine.createCard(cardData);
        setIsNewCardOpen(false);
        await refreshAll();
      } catch (innerErr: any) {
        setErrorBanner(innerErr.message || err.message);
      }
    }
  };

  const handleUpdateCard = async (cardId: string, changes: Partial<CommitmentCard>) => {
    setErrorBanner(null);
    try {
      const res = await fetch(`/v1/commitments/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const updated = await res.json();
      setSelectedCard(updated.data);
      await refreshAll();
    } catch (err: any) {
      try {
        const updated = globalPesEngine.updateCard(cardId, changes);
        setSelectedCard(updated);
        await refreshAll();
      } catch (innerErr: any) {
        setErrorBanner(innerErr.message || err.message);
      }
    }
  };

  const handleAddInboxItem = async (text: string) => {
    try {
      await fetch('/v1/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      await refreshAll();
    } catch {
      globalPesEngine.addInboxItem(text);
      await refreshAll();
    }
  };

  const handleProcessInboxItem = async (
    id: number,
    action: 'define' | 'discard' | 'defer',
    cardPayload?: Partial<CommitmentCard>
  ) => {
    try {
      await fetch(`/v1/inbox/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, cardData: cardPayload }),
      });
      await refreshAll();
    } catch {
      globalPesEngine.processInboxItem(id, action, cardPayload);
      await refreshAll();
    }
  };

  const handleSaveCapacity = async (data: Partial<CapacityRecord> & { week_of: string }) => {
    try {
      await fetch('/v1/capacity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      await refreshAll();
    } catch {
      globalPesEngine.setCapacity(data);
      await refreshAll();
    }
  };

  const handleVerifyProof = async (cardId: string) => {
    try {
      await fetch(`/v1/proof/${cardId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: currentUser.id,
          actor_role: currentUser.role,
        }),
      });
      await refreshAll();
    } catch {
      globalPesEngine.verifyProof(cardId, currentUser.id, currentUser.role);
      await refreshAll();
    }
  };

  const handleImportProposal = async (proposal: OptimizerProposal) => {
    setErrorBanner(null);
    try {
      const res = await fetch('/v1/optimizer/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal,
          actor: currentUser.id,
          actor_role: currentUser.role,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      await refreshAll();
    } catch (err: any) {
      const result = globalPesEngine.importProposal(
        proposal,
        currentUser.id,
        currentUser.role
      );
      if (result.errors.length > 0) {
        setErrorBanner(`Some commitments failed to schedule: ${result.errors.join(', ')}`);
      }
      await refreshAll();
    }
  };

  const activeCard = cards.find((c) => c.state === 'Active');
  const unprocessedInboxCount = inbox.filter((i) => i.mark === '?' && !i.processed_at).length;

  const handleSendToV2Pipeline = async (text: string) => {
    setActiveTab('v2-pipeline');
    try {
      await fetch('/api/v1/v2/intake/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawInput: text }),
      });
      await refreshAll();
    } catch (e) {
      console.error('Failed to parse into V2 intake:', e);
    }
  };

  const handleSendToV1Board = async (title: string, priorityScore: number = 80) => {
    await handleCreateCard({
      name: title,
      level: 'Task',
      current_state_desc: 'Staged from The Line',
      desired_state_desc: 'Execution verified in PES',
      proof_of_completion: 'Output artifact or verified exit code',
      next_physical_action: 'Initialize execution step',
      state: 'Ready',
      planned_duration: 60,
      priority: priorityScore,
    });
    setActiveTab('board');
  };

  const handleApplyReroute = async (plan: {
    target: 'DropList' | 'TheLine' | 'V2_Engine' | 'Breakdown_Checklist';
    actionTitle: string;
    actionDetails: string;
  }) => {
    if (plan.target === 'TheLine') {
      handleAddInboxItem(`${plan.actionTitle}: ${plan.actionDetails}`);
      setActiveTab('the-line');
    } else if (plan.target === 'DropList') {
      handleAddInboxItem(`${plan.actionTitle}: ${plan.actionDetails}`);
      setActiveTab('droplist');
    } else if (plan.target === 'V2_Engine') {
      handleSendToV2Pipeline(`${plan.actionTitle}: ${plan.actionDetails}`);
    } else if (plan.target === 'Breakdown_Checklist' && activeCard) {
      handleUpdateCard(activeCard.id, {
        next_physical_action: plan.actionDetails,
        what_happened: `Rerouted by The Stuck Feature: ${plan.actionTitle}`,
      });
      setActiveTab('board');
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'board':
        return (
          <BoardView
            cards={cards}
            onSelectCard={(c) => setSelectedCard(c)}
            onInitiateTransition={handleInitiateTransition}
          />
        );
      case 'the-line':
        return (
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <TheLineView
              inbox={inbox}
              onAddInboxItem={handleAddInboxItem}
              onSendToV2Pipeline={handleSendToV2Pipeline}
              onSendToV1Board={handleSendToV1Board}
              onOpenStuckModal={(text) => {
                setStuckInitialText(text || '');
                setIsStuckModalOpen(true);
              }}
            />
          </div>
        );
      case 'queue':
        return (
          <DailyQueueView
            cards={cards}
            onSelectCard={(c) => setSelectedCard(c)}
            onInitiateTransition={handleInitiateTransition}
          />
        );
      case 'optimizer':
        return (
          <div className="p-4 sm:p-6 max-w-7xl mx-auto">
            <OptimizerView
              cards={cards}
              capacityRecords={capacityRecords}
              currentUser={currentUser}
              onImportProposal={handleImportProposal}
              onRefreshAll={refreshAll}
              onSelectCard={(c) => setSelectedCard(c)}
            />
          </div>
        );
      case 'v2-pipeline':
        return <PesV2PipelineView />;
      case 'inbox':
        return (
          <InboxView
            inbox={inbox}
            onAddInboxItem={handleAddInboxItem}
            onProcessInboxItem={handleProcessInboxItem}
          />
        );
      case 'capacity':
        return (
          <CapacityView
            capacity={capacity}
            cards={cards}
            onSaveCapacity={handleSaveCapacity}
          />
        );
      case 'proof':
        return (
          <ProofLedgerView
            proofs={proofs}
            cards={cards}
            currentUser={currentUser}
            onVerifyProof={handleVerifyProof}
            onSelectCard={(c) => setSelectedCard(c)}
          />
        );
      case 'logs':
        return (
          <AuditLogView
            logs={logs}
            cards={cards}
            onSelectCard={(c) => setSelectedCard(c)}
          />
        );
      case 'droplist':
        return (
          <div className="min-h-[calc(100vh-8rem)] flex flex-col justify-between">
            <DropListConsole
              cards={cards}
              currentUser={currentUser}
              onInitiateTransition={handleInitiateTransition}
              onUpdateCard={handleUpdateCard}
              onAddInboxItem={handleAddInboxItem}
              onSelectCard={(c) => setSelectedCard(c)}
              onToggleLayout={() => setActiveTab('board')}
              isSplitView={false}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mode={mode}
        setMode={setMode}
        onOpenNewCard={() => setIsNewCardOpen(true)}
        onOpenQuickCapture={() => setActiveTab('inbox')}
        totalCards={cards.length}
        inboxCount={unprocessedInboxCount}
        currentUser={currentUser}
        users={users}
        onSelectUser={setCurrentUser}
        isSplitView={isSplitView}
        onToggleSplitView={() => setIsSplitView((prev) => !prev)}
        onOpenAgentDrawer={() => setIsAgentDrawerOpen(true)}
        onOpenStuckModal={() => {
          setStuckInitialText('');
          setIsStuckModalOpen(true);
        }}
      />

      {/* Single-Active Execution Banner (Only shown in standard desktop views) */}
      {activeTab !== 'droplist' && !isSplitView && (
        <ActiveBar
          activeCard={activeCard}
          onComplete={(card) => handleInitiateTransition(card, 'Completed')}
          onPause={(card) => handleInitiateTransition(card, 'Paused')}
          onBlock={(card) => handleInitiateTransition(card, 'Blocked')}
          onViewCard={(card) => setSelectedCard(card)}
        />
      )}

      {/* Error Notification Banner */}
      {errorBanner && (
        <div className="bg-rose-600 text-white px-4 py-2.5 text-xs font-medium shadow-xs">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>PES Guard Constraint Rejected: {errorBanner}</span>
            </div>
            <button
              onClick={() => setErrorBanner(null)}
              className="p-1 hover:bg-rose-700 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area: Split View or Standard */}
      <main className="flex-1">
        {isSplitView ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-4rem)]">
            {/* Desktop Dashboard Side */}
            <div className="lg:col-span-7 xl:col-span-8 overflow-y-auto border-r border-slate-200">
              {renderTabContent()}
            </div>

            {/* Tactile Field Console Side */}
            <div className="lg:col-span-5 xl:col-span-4 min-h-[650px] border-l border-slate-900 bg-[#0c0e0d] flex flex-col shadow-2xl">
              <DropListConsole
                cards={cards}
                currentUser={currentUser}
                onInitiateTransition={handleInitiateTransition}
                onUpdateCard={handleUpdateCard}
                onAddInboxItem={handleAddInboxItem}
                onSelectCard={(c) => setSelectedCard(c)}
                onToggleLayout={() => setIsSplitView(false)}
                isSplitView={true}
              />
            </div>
          </div>
        ) : (
          renderTabContent()
        )}
      </main>

      {/* Card Detail Modal */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onInitiateTransition={handleInitiateTransition}
          onUpdateCard={handleUpdateCard}
        />
      )}

      {/* Transition Modal (When facts are required for a transition) */}
      {transitionState && (
        <TransitionModal
          card={transitionState.card}
          targetState={transitionState.targetState}
          onClose={() => setTransitionState(null)}
          onConfirm={(facts) =>
            executeMove(transitionState.card.id, transitionState.targetState, facts)
          }
        />
      )}

      {/* New Card Modal */}
      {isNewCardOpen && (
        <NewCardModal
          onClose={() => setIsNewCardOpen(false)}
          onCreateCard={handleCreateCard}
        />
      )}

      {/* Floating Universal Agent Trigger Button */}
      <button
        onClick={() => setIsAgentDrawerOpen((prev) => !prev)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:shadow-indigo-500/30 transition-all font-semibold text-xs border border-indigo-400/30 group"
        title="Open Universal AI Agent"
      >
        <Bot className="w-4 h-4 group-hover:scale-110 transition-transform" />
        <span className="hidden sm:inline">PES AI Agent</span>
      </button>

      {/* Universal Agent Chat Drawer */}
      <UniversalAgentChatDrawer
        isOpen={isAgentDrawerOpen}
        onClose={() => setIsAgentDrawerOpen(false)}
        activeCard={activeCard}
        inboxCount={unprocessedInboxCount}
        onNavigateTab={(tab) => {
          setActiveTab(tab as ActiveTab);
        }}
        onSendToV2={(text) => handleSendToV2Pipeline(text)}
        onOpenStuckModal={(contextText) => {
          setStuckInitialText(contextText || '');
          setIsStuckModalOpen(true);
        }}
      />

      {/* The Stuck Feature Modal */}
      <StuckDiagnosticModal
        isOpen={isStuckModalOpen}
        onClose={() => setIsStuckModalOpen(false)}
        activeCard={activeCard}
        initialBlockerText={stuckInitialText}
        onApplyReroute={handleApplyReroute}
      />
    </div>
  );
};

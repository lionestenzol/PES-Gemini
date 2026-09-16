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
} from './types.js';
import { globalPesEngine, getMondayOfWeek } from './lib/pes-engine.js';
import { Header } from './components/Header.js';
import { ActiveBar } from './components/ActiveBar.js';
import { BoardView } from './components/BoardView.js';
import { DailyQueueView } from './components/DailyQueueView.js';
import { InboxView } from './components/InboxView.js';
import { CapacityView } from './components/CapacityView.js';
import { ProofLedgerView } from './components/ProofLedgerView.js';
import { AuditLogView } from './components/AuditLogView.js';
import { CardDetailModal } from './components/CardDetailModal.js';
import { TransitionModal } from './components/TransitionModal.js';
import { NewCardModal } from './components/NewCardModal.js';
import { AlertCircle, X } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('board');
  const [mode, setMode] = useState<OperatingMode>('Full');

  const [cards, setCards] = useState<CommitmentCard[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [capacity, setCapacity] = useState<CapacityRecord>(
    globalPesEngine.getCapacity(getMondayOfWeek())
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
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

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
    try {
      const res = await fetch(`/v1/commitments/${cardId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: targetState, ...facts }),
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
        globalPesEngine.moveCard(cardId, targetState, facts);
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
      });
      await refreshAll();
    } catch {
      globalPesEngine.verifyProof(cardId);
      await refreshAll();
    }
  };

  const activeCard = cards.find((c) => c.state === 'Active');
  const unprocessedInboxCount = inbox.filter((i) => i.mark === '?' && !i.processed_at).length;

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
      />

      {/* Single-Active Execution Banner */}
      <ActiveBar
        activeCard={activeCard}
        onComplete={(card) => handleInitiateTransition(card, 'Completed')}
        onPause={(card) => handleInitiateTransition(card, 'Paused')}
        onBlock={(card) => handleInitiateTransition(card, 'Blocked')}
        onViewCard={(card) => setSelectedCard(card)}
      />

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

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'board' && (
          <BoardView
            cards={cards}
            onSelectCard={(c) => setSelectedCard(c)}
            onInitiateTransition={handleInitiateTransition}
          />
        )}

        {activeTab === 'queue' && (
          <DailyQueueView
            cards={cards}
            onSelectCard={(c) => setSelectedCard(c)}
            onInitiateTransition={handleInitiateTransition}
          />
        )}

        {activeTab === 'inbox' && (
          <InboxView
            inbox={inbox}
            onAddInboxItem={handleAddInboxItem}
            onProcessInboxItem={handleProcessInboxItem}
          />
        )}

        {activeTab === 'capacity' && (
          <CapacityView
            capacity={capacity}
            cards={cards}
            onSaveCapacity={handleSaveCapacity}
          />
        )}

        {activeTab === 'proof' && (
          <ProofLedgerView
            proofs={proofs}
            cards={cards}
            onVerifyProof={handleVerifyProof}
            onSelectCard={(c) => setSelectedCard(c)}
          />
        )}

        {activeTab === 'logs' && (
          <AuditLogView
            logs={logs}
            cards={cards}
            onSelectCard={(c) => setSelectedCard(c)}
          />
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
    </div>
  );
};

import {
  CommitmentCard,
  CardState,
  CapacityRecord,
  InboxItem,
  AuditEvent,
  ProofRecord,
  CardLink,
  PesRole,
  UserIdentity,
  FixedEvent,
  OptimizerProposal,
  TemporalWorkflowInfo,
} from '../types.js';

export const DEFAULT_USERS: UserIdentity[] = [
  { id: 'worker-1', name: 'Alex Rivera (Worker)', role: 'worker' },
  { id: 'worker-2', name: 'Devon Smith (Worker)', role: 'worker' },
  { id: 'verifier-1', name: 'Jordan Vance (Verifier)', role: 'verifier' },
  { id: 'reviewer-1', name: 'Morgan Chen (Reviewer)', role: 'reviewer' },
  { id: 'scheduler-1', name: 'Sam Taylor (Scheduler)', role: 'scheduler' },
  { id: 'admin-1', name: 'System Admin (All Roles)', role: 'admin' },
];

export const VALID_TRANSITIONS: Record<CardState, CardState[]> = {
  Captured: ['Ready', 'Canceled'],
  Ready: ['Scheduled', 'Canceled', 'Captured'],
  Scheduled: ['Active', 'Ready', 'Canceled'],
  Active: ['Completed', 'Paused', 'Blocked', 'Canceled'],
  Completed: ['Verified', 'Active', 'Ready', 'Canceled'],
  Verified: ['Done', 'Canceled', 'Completed'],
  Done: [],
  Paused: ['Active', 'Canceled'],
  Blocked: ['Ready', 'Canceled'],
  Canceled: [],
};

// Helper to compute Monday of any date
export function getMondayOfWeek(d: Date | string = new Date()): string {
  const date = typeof d === 'string' ? new Date(d.includes('T') ? d : d + 'T00:00:00') : new Date(d.getTime());
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Compute available capacity and safe schedule limit
export function computeCapacity(
  total: number,
  fixed: number,
  mealsTravel: number,
  recovery: number,
  unit: number = 0.25
) {
  const available = Math.max(0, total - (fixed + mealsTravel + recovery));
  // Standard PES safety buffer: schedule limit is 85% of available capacity rounded to unit
  const rawLimit = available * 0.85;
  const scheduleLimit = Math.floor(rawLimit / unit) * unit;
  return {
    availableCapacity: Number(available.toFixed(2)),
    scheduleLimit: Number(scheduleLimit.toFixed(2)),
  };
}

export class PesEngine {
  private cards: Map<string, CommitmentCard> = new Map();
  private inbox: InboxItem[] = [];
  private capacityRecords: Map<string, CapacityRecord> = new Map();
  private auditLogs: AuditEvent[] = [];
  private proofRecords: Map<string, ProofRecord> = new Map();
  private links: CardLink[] = [];
  private fixedEvents: FixedEvent[] = [];
  private nextInboxId = 1;
  private nextLogId = 1;
  private nextProofId = 1;
  private nextFixedEventId = 1;

  constructor() {
    this.seedDefaultData();
  }

  private seedDefaultData() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const currentWeekMonday = getMondayOfWeek(today);

    // Initial Capacity
    const { availableCapacity, scheduleLimit } = computeCapacity(40, 10, 6, 6);
    this.capacityRecords.set(currentWeekMonday, {
      id: 1,
      week_of: currentWeekMonday,
      total_hours: 40,
      fixed_commitments: 10,
      meals_travel_transitions: 6,
      recovery_reserve: 6,
      available_capacity: availableCapacity,
      schedule_limit: scheduleLimit,
    });

    // Seed Cards
    const seedCards: CommitmentCard[] = [
      {
        id: 'T-001',
        level: 'Task',
        name: 'Implement Path E Verification Gate',
        current_state_desc: 'Initial specifications written, no active test harness',
        desired_state_desc: 'Guarded transition harness and HTTP test suite passing',
        proof_of_completion: 'Verified test run log artifact and exit code 0',
        next_physical_action: 'Run automated proof verification and sign off',
        state: 'Active',
        schedule_status: 'scheduled',
        planned_date: todayStr,
        planned_start: '09:30',
        planned_end: '11:00',
        planned_duration: 90,
        actual_start: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
        actual_end: null,
        result: null,
        proof_location: null,
        what_happened: null,
        review_date: null,
        block_reason: null,
        waiting_for: null,
        fallback_action: 'Revert to Path A CLI execution if needed',
        owner: 'worker-1',
        priority: 90,
        risk_level: 'High',
        temporal_workflow: {
          workflow_id: 'pes-wf-T-001',
          run_id: 'run-b8f2d1',
          status: 'RUNNING',
          started_at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
          last_heartbeat: new Date().toISOString(),
          heartbeat_count: 84,
          activity_name: 'VerifyHttpContractsActivity',
          retry_attempt: 1,
        },
        steps: [
          { text: 'Verify PKCE verification challenge in auth header', done: true },
          { text: 'Run integration test suite with synthetic dual-tenant context', done: false },
          { text: 'Verify tenant schema isolation barrier in memory engine', done: false },
        ],
        created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'T-002',
        level: 'Task',
        name: 'Draft System Operating Protocol',
        current_state_desc: 'Notes scattered in docs, missing unified protocol doc',
        desired_state_desc: 'Clean markdown protocol covering guarded transitions and proof',
        proof_of_completion: 'docs/SYSTEM_OPERATIONS.md committed and reviewed',
        next_physical_action: 'Outline operational safety rules',
        state: 'Ready',
        schedule_status: 'unscheduled',
        steps: [
          { text: 'Outline operational safety rules and single-active law', done: false },
          { text: 'Document proof ledger submission criteria', done: false },
          { text: 'Draft recovery protocol checklist for blocked items', done: false },
        ],
        planned_date: null,
        planned_start: null,
        planned_end: null,
        planned_duration: 60,
        actual_start: null,
        actual_end: null,
        result: null,
        proof_location: null,
        what_happened: null,
        review_date: null,
        block_reason: null,
        waiting_for: null,
        fallback_action: null,
        owner: 'user',
        priority: 50,
        risk_level: 'Low',
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'T-003',
        level: 'Task',
        name: 'Weekly Capacity Audit & Rebalance',
        current_state_desc: 'Weekly hours estimated without fixed reserve calculation',
        desired_state_desc: 'Capacity record locked with buffer limit and verified bounds',
        proof_of_completion: 'Capacity log entry with timestamp and signed limit',
        next_physical_action: 'Review scheduled card durations against 85% limit',
        state: 'Scheduled',
        schedule_status: 'scheduled',
        planned_date: todayStr,
        planned_start: '14:00',
        planned_end: '15:00',
        planned_duration: 60,
        actual_start: null,
        actual_end: null,
        result: null,
        proof_location: null,
        what_happened: null,
        review_date: null,
        block_reason: null,
        waiting_for: null,
        fallback_action: null,
        owner: 'user',
        priority: 70,
        risk_level: 'Medium',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'T-004',
        level: 'Task',
        name: 'Synchronize CalDAV Calendar Export',
        current_state_desc: 'ICS output generator lacks UID persistence',
        desired_state_desc: 'Export generator writes consistent PES card UID tags',
        proof_of_completion: 'calendar.ics exported and validated against RFC 5545',
        next_physical_action: 'Export calendar file and test in iCal',
        state: 'Completed',
        schedule_status: 'unscheduled',
        planned_date: todayStr,
        planned_start: '08:00',
        planned_end: '09:00',
        planned_duration: 60,
        actual_start: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
        actual_end: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        result: 'RFC 5545 compliant ICS export generated with permanent UID tags',
        proof_location: 'artifacts/exports/schedule.ics',
        what_happened: null,
        review_date: null,
        block_reason: null,
        waiting_for: null,
        fallback_action: null,
        owner: 'user',
        priority: 60,
        risk_level: 'Low',
        created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
        updated_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
      },
      {
        id: 'T-005',
        level: 'Task',
        name: 'Database Schema Migration to Node.js',
        current_state_desc: 'Python SQLite schema',
        desired_state_desc: 'Full TypeScript/Node.js reactive execution engine',
        proof_of_completion: 'Node.js dev server listening and responding on port 3000',
        next_physical_action: 'Verify API endpoints and UI responsiveness',
        state: 'Verified',
        schedule_status: 'unscheduled',
        planned_date: null,
        planned_start: null,
        planned_end: null,
        planned_duration: 120,
        actual_start: new Date(Date.now() - 360 * 60 * 1000).toISOString(),
        actual_end: new Date(Date.now() - 240 * 60 * 1000).toISOString(),
        result: 'TypeScript state machine and HTTP API initialized with guarded transitions',
        proof_location: 'tests/reports/migration_verification.json',
        what_happened: null,
        review_date: null,
        block_reason: null,
        waiting_for: null,
        fallback_action: null,
        owner: 'user',
        priority: 85,
        risk_level: 'Medium',
        created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
        updated_at: new Date(Date.now() - 240 * 60 * 1000).toISOString(),
      },
      {
        id: 'T-006',
        level: 'Task',
        name: 'Upstream Vendor API Contract Review',
        current_state_desc: 'Contract draft waiting on legal compliance team signoff',
        desired_state_desc: 'Signed addendum in repository compliance folder',
        proof_of_completion: 'Executed contract PDF with counter-signature',
        next_physical_action: 'Ping legal counsel on Slack channel',
        state: 'Blocked',
        schedule_status: 'unscheduled',
        planned_date: null,
        planned_start: null,
        planned_end: null,
        planned_duration: 45,
        actual_start: null,
        actual_end: null,
        result: null,
        proof_location: null,
        what_happened: 'Awaiting formal external legal review',
        review_date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
        block_reason: 'External legal department pending review of section 4 liability terms',
        waiting_for: 'Counsel Jane Doe (Compliance)',
        fallback_action: 'Issue interim memo with limited liability waiver',
        owner: 'user',
        priority: 85,
        risk_level: 'High',
        created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ];

    seedCards.forEach((c) => this.cards.set(c.id, c));

    // Seed Proofs
    this.proofRecords.set('T-004', {
      id: this.nextProofId++,
      card_id: 'T-004',
      card_name: 'Synchronize CalDAV Calendar Export',
      result: 'RFC 5545 compliant ICS export generated with permanent UID tags',
      proof_location: 'artifacts/exports/schedule.ics',
      verified: false,
      verified_at: null,
      timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    });

    this.proofRecords.set('T-005', {
      id: this.nextProofId++,
      card_id: 'T-005',
      card_name: 'Database Schema Migration to Node.js',
      result: 'TypeScript state machine and HTTP API initialized with guarded transitions',
      proof_location: 'tests/reports/migration_verification.json',
      verified: true,
      verified_at: new Date(Date.now() - 200 * 60 * 1000).toISOString(),
      timestamp: new Date(Date.now() - 240 * 60 * 1000).toISOString(),
    });

    // Seed Inbox
    this.inbox = [
      {
        id: this.nextInboxId++,
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        raw_text: 'Investigate automated backup sync to secondary cloud storage',
        mark: '?',
        processed_at: null,
        process_action: null,
        card_id: null,
      },
      {
        id: this.nextInboxId++,
        timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
        raw_text: 'Update team operating cadence notes for Q4 sprint kickoff',
        mark: '?',
        processed_at: null,
        process_action: null,
        card_id: null,
      },
    ];

    // Seed Audit Logs
    this.auditLogs = [
      {
        id: this.nextLogId++,
        card_id: 'T-001',
        timestamp: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
        state_from: 'Scheduled',
        state_to: 'Active',
        note: 'Execution started. Enforcing Single-Active gate.',
        actual_start: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
        actual_end: null,
      },
      {
        id: this.nextLogId++,
        card_id: 'T-004',
        timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        state_from: 'Active',
        state_to: 'Completed',
        note: 'Execution completed. Proof location documented.',
        actual_start: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
        actual_end: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
      },
      {
        id: this.nextLogId++,
        card_id: 'T-005',
        timestamp: new Date(Date.now() - 200 * 60 * 1000).toISOString(),
        state_from: 'Completed',
        state_to: 'Verified',
        note: 'Proof of completion audited and verified.',
        actor: 'verifier-1',
        actor_role: 'verifier',
        actual_start: null,
        actual_end: null,
      },
    ];

    // Seed Fixed Calendar Events (Path D Constraint Anchor)
    this.fixedEvents = [
      {
        id: 'FE-01',
        name: 'Weekly Planning & Capacity Lock',
        event_date: currentWeekMonday,
        start_time: '10:00',
        end_time: '11:00',
        resource: 'worker-1',
      },
      {
        id: 'FE-02',
        name: 'Architecture & Verification Sync',
        event_date: new Date(new Date(currentWeekMonday + 'T00:00:00').setDate(new Date(currentWeekMonday + 'T00:00:00').getDate() + 2)).toISOString().split('T')[0],
        start_time: '14:00',
        end_time: '15:00',
        resource: 'worker-1',
      },
    ];

    // Seed Precedence Links (Path D & Invariant Check)
    this.links = [
      { from_id: 'T-001', to_id: 'T-002', link_type: 'requires' },
    ];
  }

  // --- QUERY METHODS ---

  public getCards(): CommitmentCard[] {
    return Array.from(this.cards.values()).sort((a, b) => {
      // Sort by priority desc, then created_at
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }

  public getCard(id: string): CommitmentCard | undefined {
    return this.cards.get(id);
  }

  public getActiveCard(): CommitmentCard | undefined {
    for (const card of this.cards.values()) {
      if (card.state === 'Active') return card;
    }
    return undefined;
  }

  public getInbox(): InboxItem[] {
    return [...this.inbox].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public getCapacity(weekOf?: string): CapacityRecord {
    const monday = weekOf ? getMondayOfWeek(weekOf) : getMondayOfWeek(new Date());
    let record = this.capacityRecords.get(monday);
    if (!record) {
      const { availableCapacity, scheduleLimit } = computeCapacity(40, 10, 6, 6);
      record = {
        week_of: monday,
        total_hours: 40,
        fixed_commitments: 10,
        meals_travel_transitions: 6,
        recovery_reserve: 6,
        available_capacity: availableCapacity,
        schedule_limit: scheduleLimit,
      };
      this.capacityRecords.set(monday, record);
    }
    return record;
  }

  public getCapacityRecords(): CapacityRecord[] {
    return Array.from(this.capacityRecords.values()).sort(
      (a, b) => new Date(b.week_of).getTime() - new Date(a.week_of).getTime()
    );
  }

  public getProofIndex(cardId?: string): ProofRecord[] {
    const records = Array.from(this.proofRecords.values());
    if (cardId) return records.filter((p) => p.card_id === cardId);
    return records.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public getLogs(cardId?: string, limit: number = 100): AuditEvent[] {
    let list = this.auditLogs;
    if (cardId) list = list.filter((l) => l.card_id === cardId);
    return [...list]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  // --- COMMAND METHODS WITH GUARD LAW CHECKS ---

  public createCard(data: Partial<CommitmentCard>): CommitmentCard {
    if (!data.name || !data.name.trim()) {
      throw new Error('Card name is required');
    }

    let id = data.id?.trim();
    if (!id) {
      // Auto-assign ID format T-xxx
      const existingIds = Array.from(this.cards.keys());
      let counter = 1;
      while (existingIds.includes(`T-${String(counter).padStart(3, '0')}`)) {
        counter++;
      }
      id = `T-${String(counter).padStart(3, '0')}`;
    }

    if (this.cards.has(id)) {
      throw new Error(`Card with ID ${id} already exists`);
    }

    const now = new Date().toISOString();
    const card: CommitmentCard = {
      id,
      level: data.level || 'Task',
      name: data.name.trim(),
      parent_id: data.parent_id || null,
      current_state_desc: data.current_state_desc || '',
      desired_state_desc: data.desired_state_desc || '',
      proof_of_completion: data.proof_of_completion || '',
      next_physical_action: data.next_physical_action || '',
      state: data.state || 'Captured',
      schedule_status: 'unscheduled',
      planned_date: data.planned_date || null,
      planned_start: data.planned_start || null,
      planned_end: data.planned_end || null,
      planned_duration: data.planned_duration || null,
      actual_start: null,
      actual_end: null,
      result: null,
      proof_location: null,
      what_happened: null,
      review_date: null,
      block_reason: null,
      waiting_for: null,
      fallback_action: data.fallback_action || null,
      owner: data.owner || 'user',
      priority: data.priority !== undefined ? data.priority : 0,
      risk_level: data.risk_level || 'Low',
      created_at: now,
      updated_at: now,
    };

    this.cards.set(id, card);

    this.auditLogs.push({
      id: this.nextLogId++,
      card_id: id,
      timestamp: now,
      state_from: null,
      state_to: card.state,
      note: 'Commitment card created',
      actual_start: null,
      actual_end: null,
    });

    return card;
  }

  public updateCard(cardId: string, changes: Partial<CommitmentCard>): CommitmentCard {
    const card = this.cards.get(cardId);
    if (!card) throw new Error(`Card ${cardId} not found`);

    if ('state' in changes && changes.state !== card.state) {
      throw new Error('State must be transitioned using the moveCard command to satisfy guards');
    }

    const updated: CommitmentCard = {
      ...card,
      ...changes,
      updated_at: new Date().toISOString(),
    };

    this.cards.set(cardId, updated);
    return updated;
  }

  public moveCard(
    cardId: string,
    targetState: CardState,
    facts: Partial<CommitmentCard> & { note?: string; actor?: string; actor_role?: PesRole } = {}
  ): CommitmentCard {
    const card = this.cards.get(cardId);
    if (!card) throw new Error(`Card ${cardId} not found`);

    const currentState = card.state;
    if (currentState === targetState) return card;

    const allowed = VALID_TRANSITIONS[currentState] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(`Invalid transition: ${currentState} -> ${targetState}`);
    }

    // REGRESSION GUARD: If leaving Verified or Done, ensure no dependent cards are Scheduled or Active
    if (['Verified', 'Done'].includes(currentState) && !['Verified', 'Done'].includes(targetState)) {
      const dependentLinks = this.links.filter(
        (l) => l.from_id === cardId && (l.link_type === 'blocks' || l.link_type === 'requires')
      );
      for (const link of dependentLinks) {
        const dependentCard = this.cards.get(link.to_id);
        if (dependentCard && ['Scheduled', 'Active'].includes(dependentCard.state)) {
          throw new Error(
            `Cannot move ${cardId} back to ${targetState}: card ${dependentCard.id} depends on it and is ${dependentCard.state}. Reschedule or cancel it first.`
          );
        }
      }
    }

    // ENTRY GUARDS
    const mergedCard = { ...card, ...facts };

    // 1. Ready Gate
    if (targetState === 'Ready') {
      const requiredFields: (keyof CommitmentCard)[] = [
        'name',
        'current_state_desc',
        'desired_state_desc',
        'proof_of_completion',
        'next_physical_action',
      ];
      for (const f of requiredFields) {
        const val = mergedCard[f];
        if (!val || String(val).trim().length === 0) {
          throw new Error(`Ready gate failed: ${f} is required and cannot be empty`);
        }
      }
      if (mergedCard.priority >= 80 || mergedCard.risk_level === 'High') {
        if (!mergedCard.fallback_action || !mergedCard.fallback_action.trim()) {
          throw new Error(
            'Ready gate failed: fallback_action is strictly required for high-priority (>=80) or high-risk work'
          );
        }
      }
    }

    // 2. Schedule Gate
    if (targetState === 'Scheduled') {
      if (!mergedCard.proof_of_completion || !mergedCard.proof_of_completion.trim()) {
        throw new Error('Schedule gate failed: proof_of_completion is empty');
      }
      if (!facts.planned_date && !card.planned_date) {
        throw new Error('Schedule gate failed: planned_date must be set (YYYY-MM-DD)');
      }
      const plannedDate = facts.planned_date || card.planned_date!;
      const duration = facts.planned_duration !== undefined ? facts.planned_duration : card.planned_duration;
      if (!duration || duration <= 0) {
        throw new Error('Schedule gate failed: planned_duration must be a positive integer in minutes');
      }

      // Capacity verification
      const weekMonday = getMondayOfWeek(plannedDate);
      const cap = this.getCapacity(weekMonday);
      
      // Calculate total scheduled hours for that week
      let totalMinutes = 0;
      for (const c of this.cards.values()) {
        if (
          c.id !== cardId &&
          c.schedule_status === 'scheduled' &&
          c.planned_date
        ) {
          const cMonday = getMondayOfWeek(c.planned_date);
          if (cMonday === weekMonday && c.planned_duration) {
            totalMinutes += c.planned_duration;
          }
        }
      }
      const totalHours = (totalMinutes + duration) / 60.0;
      if (totalHours > cap.schedule_limit) {
        throw new Error(
          `Weekly capacity limit exceeded: ${totalHours.toFixed(1)}h planned exceeds safe limit of ${cap.schedule_limit}h for week of ${weekMonday}`
        );
      }

      // Check dependency blockers
      this.checkUnmetDependencies(cardId);
    }

    // 3. Active Gate (Single-Active Law!)
    if (targetState === 'Active') {
      this.checkUnmetDependencies(cardId);
      const activeCard = this.getActiveCard();
      if (activeCard && activeCard.id !== cardId) {
        throw new Error(
          `Single-Active law violation: Card ${activeCard.id} ("${activeCard.name}") is currently Active. You must Complete, Pause, or Block it before starting another task.`
        );
      }
      if (!facts.actual_start) {
        facts.actual_start = new Date().toISOString();
      }
    }

    // 4. Completed Gate
    if (targetState === 'Completed' && currentState === 'Active') {
      if (!facts.result || !String(facts.result).trim()) {
        throw new Error('Completed gate failed: result description is required');
      }
      if (!facts.proof_location || !String(facts.proof_location).trim()) {
        throw new Error('Completed gate failed: proof_location (file path or artifact URL) is required');
      }
      if (!facts.actual_end) {
        facts.actual_end = new Date().toISOString();
      }
    }

    // 5. Paused Gate
    if (targetState === 'Paused') {
      if (!facts.what_happened || !String(facts.what_happened).trim()) {
        throw new Error('Paused gate failed: what_happened is required');
      }
      if (!facts.next_physical_action || !String(facts.next_physical_action).trim()) {
        throw new Error('Paused gate failed: next_physical_action is required');
      }
      if (!facts.actual_end) {
        facts.actual_end = new Date().toISOString();
      }
    }

    // 6. Blocked Gate
    if (targetState === 'Blocked') {
      if (!facts.block_reason || !String(facts.block_reason).trim()) {
        throw new Error('Blocked gate failed: block_reason is required');
      }
      if (!facts.review_date || !String(facts.review_date).trim()) {
        throw new Error('Blocked gate failed: review_date is required');
      }
      if (!facts.waiting_for || !String(facts.waiting_for).trim()) {
        throw new Error('Blocked gate failed: waiting_for person/system is required');
      }
      if (card.priority >= 80 || card.risk_level === 'High') {
        const fallback = facts.fallback_action || card.fallback_action;
        if (!fallback || !String(fallback).trim()) {
          throw new Error('Blocked gate failed: fallback_action is required for high-priority or high-risk work');
        }
      }
    }

    // 7. Verified Gate
    if (targetState === 'Verified') {
      const res = facts.result || card.result;
      const proofLoc = facts.proof_location || card.proof_location;
      if (!res || !String(res).trim()) {
        throw new Error('Verified gate failed: result is required before verification');
      }
      if (!proofLoc || !String(proofLoc).trim()) {
        throw new Error('Verified gate failed: proof_location is required before verification');
      }

      // Path C Role verification: Only verifier or admin can certify proof
      const actor = facts.actor || 'verifier-1';
      const actorRole = facts.actor_role || 'verifier';
      if (actorRole !== 'verifier' && actorRole !== 'admin') {
        throw new Error(
          `Path C Authorization Failure: Role '${actorRole}' is not authorized to certify completion proof. Only 'verifier' or 'admin' may verify tasks.`
        );
      }
      // Path C Separation of Duties: Worker cannot self-verify own high-risk or high-priority task
      if ((card.risk_level === 'High' || card.priority >= 80) && card.owner === actor && actorRole !== 'admin') {
        throw new Error(
          `Path C Separation of Duties Violation: Task ${cardId} is high-risk/priority. Owner '${card.owner}' cannot self-verify their own completion. An independent verifier must sign off.`
        );
      }
    }

    // Update Schedule Status
    let newScheduleStatus = card.schedule_status;
    if (targetState === 'Scheduled') {
      newScheduleStatus = 'scheduled';
    } else if (['Completed', 'Verified', 'Done', 'Ready', 'Canceled'].includes(targetState)) {
      newScheduleStatus = 'unscheduled';
    }

    const now = new Date().toISOString();

    // Path B Temporal Workflow Tracking
    let workflowInfo = card.temporal_workflow || null;
    if (targetState === 'Active') {
      const startTime = facts.actual_start || now;
      workflowInfo = {
        workflow_id: `pes-wf-${cardId}`,
        run_id: `run-${Math.random().toString(36).substring(2, 8)}`,
        status: 'RUNNING',
        started_at: startTime,
        last_heartbeat: now,
        heartbeat_count: (card.temporal_workflow?.heartbeat_count || 0) + 1,
        activity_name: 'ExecutePhysicalAction',
        retry_attempt: 1,
      };
    } else if (targetState === 'Paused') {
      if (workflowInfo) {
        workflowInfo = { ...workflowInfo, status: 'PAUSED', last_heartbeat: now };
      }
    } else if (['Completed', 'Done', 'Canceled'].includes(targetState)) {
      if (workflowInfo) {
        workflowInfo = { ...workflowInfo, status: 'COMPLETED', last_heartbeat: now };
      }
    }

    const updatedCard: CommitmentCard = {
      ...card,
      ...facts,
      state: targetState,
      schedule_status: newScheduleStatus,
      temporal_workflow: workflowInfo,
      verified_by: targetState === 'Verified' ? (facts.actor || 'verifier-1') : card.verified_by,
      verified_role: targetState === 'Verified' ? (facts.actor_role || 'verifier') : card.verified_role,
      updated_at: now,
    };

    this.cards.set(cardId, updatedCard);

    // Update or Insert into Proof Index if Completed or Verified
    if (['Completed', 'Verified'].includes(targetState)) {
      const proofLoc = updatedCard.proof_location || '';
      const resultText = updatedCard.result || '';
      this.proofRecords.set(cardId, {
        id: this.proofRecords.get(cardId)?.id || this.nextProofId++,
        card_id: cardId,
        card_name: updatedCard.name,
        result: resultText,
        proof_location: proofLoc,
        verified: targetState === 'Verified' || this.proofRecords.get(cardId)?.verified || false,
        verified_at: targetState === 'Verified' ? now : this.proofRecords.get(cardId)?.verified_at || null,
        timestamp: now,
      });
    }

    // Log the transition in Audit Log
    this.auditLogs.push({
      id: this.nextLogId++,
      card_id: cardId,
      timestamp: now,
      state_from: currentState,
      state_to: targetState,
      note: facts.note || `Transitioned from ${currentState} to ${targetState}`,
      actor: facts.actor || 'worker-1',
      actor_role: facts.actor_role || 'worker',
      actual_start: facts.actual_start || null,
      actual_end: facts.actual_end || null,
    });

    return updatedCard;
  }

  private checkUnmetDependencies(cardId: string) {
    const blockers = this.links.filter(
      (l) => l.to_id === cardId && (l.link_type === 'blocks' || l.link_type === 'requires')
    );
    const unfinished: string[] = [];
    for (const b of blockers) {
      const parent = this.cards.get(b.from_id);
      if (parent && !['Verified', 'Done'].includes(parent.state)) {
        unfinished.push(`${parent.id} (${parent.name}) [${parent.state}]`);
      }
    }
    if (unfinished.length > 0) {
      throw new Error(`Dependencies not met. Waiting on verified completion of: ${unfinished.join(', ')}`);
    }
  }

  public verifyProof(
    cardId: string,
    actor: string = 'verifier-1',
    actorRole: PesRole = 'verifier'
  ): ProofRecord {
    const card = this.cards.get(cardId);
    if (!card) throw new Error(`Card ${cardId} not found`);

    if (card.state === 'Completed') {
      this.moveCard(cardId, 'Verified', {
        note: `Proof inspected and verified by ${actor} (${actorRole})`,
        actor,
        actor_role: actorRole,
      });
    }

    const proof = this.proofRecords.get(cardId);
    if (!proof) {
      throw new Error(`No proof record found for card ${cardId}`);
    }

    proof.verified = true;
    proof.verified_at = new Date().toISOString();
    proof.verified_by = actor;
    return proof;
  }

  public getFixedEvents(weekOf?: string): FixedEvent[] {
    if (!weekOf) return [...this.fixedEvents];
    const monday = getMondayOfWeek(weekOf);
    const sunday = new Date(monday + 'T00:00:00');
    sunday.setDate(sunday.getDate() + 6);
    const sundayStr = sunday.toISOString().split('T')[0];
    return this.fixedEvents.filter(
      (ev) => ev.event_date >= monday && ev.event_date <= sundayStr
    );
  }

  public addFixedEvent(event: Omit<FixedEvent, 'id'> & { id?: string }): FixedEvent {
    const id = event.id || `FE-${String(this.nextFixedEventId++).padStart(2, '0')}`;
    const newEvent: FixedEvent = {
      id,
      name: event.name.trim(),
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      resource: event.resource || 'worker-1',
    };
    this.fixedEvents.push(newEvent);
    return newEvent;
  }

  public deleteFixedEvent(id: string): boolean {
    const idx = this.fixedEvents.findIndex((e) => e.id === id);
    if (idx >= 0) {
      this.fixedEvents.splice(idx, 1);
      return true;
    }
    return false;
  }

  public getLinks(): CardLink[] {
    return [...this.links];
  }

  public addLink(link: CardLink): CardLink {
    if (link.from_id === link.to_id) {
      throw new Error('Self-referential links are not permitted');
    }
    const exists = this.links.some(
      (l) => l.from_id === link.from_id && l.to_id === link.to_id
    );
    if (exists) {
      throw new Error(`Link between ${link.from_id} and ${link.to_id} already exists`);
    }
    this.links.push(link);
    return link;
  }

  public deleteLink(from_id: string, to_id: string): boolean {
    const idx = this.links.findIndex((l) => l.from_id === from_id && l.to_id === to_id);
    if (idx >= 0) {
      this.links.splice(idx, 1);
      return true;
    }
    return false;
  }

  public importProposal(
    proposal: OptimizerProposal,
    actor: string = 'scheduler-1',
    actorRole: PesRole = 'scheduler'
  ): { imported: number; errors: string[] } {
    let imported = 0;
    const errors: string[] = [];

    for (const block of proposal.blocks) {
      const card = this.cards.get(block.card_id);
      if (!card) {
        errors.push(`Card ${block.card_id} not found`);
        continue;
      }
      try {
        this.moveCard(block.card_id, 'Scheduled', {
          planned_date: block.planned_date,
          planned_start: block.planned_start,
          planned_end: block.planned_end,
          planned_duration: block.planned_duration,
          note: `Path D Optimizer scheduled into slot ${block.planned_date} ${block.planned_start}-${block.planned_end} (Run ${proposal.run_id})`,
          actor,
          actor_role: actorRole,
        });
        imported++;
      } catch (err: any) {
        errors.push(`${block.card_id}: ${err.message}`);
      }
    }

    return { imported, errors };
  }

  public generateIcsCalendar(weekOf?: string): string {
    const monday = weekOf ? getMondayOfWeek(weekOf) : getMondayOfWeek(new Date());
    const sunday = new Date(monday + 'T00:00:00');
    sunday.setDate(sunday.getDate() + 6);
    const sundayStr = sunday.toISOString().split('T')[0];

    const scheduled = this.getCards().filter(
      (c) => c.state === 'Scheduled' && c.planned_date && c.planned_date >= monday && c.planned_date <= sundayStr
    );

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//PES//Personal Execution System//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:PES Commitments',
    ];

    for (const card of scheduled) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${card.id}@pes.local`);
      lines.push(`SUMMARY:${card.name.replace(/\n/g, ' ')}`);
      lines.push(
        `DESCRIPTION:PES card ${card.id}\\nDesired State: ${card.desired_state_desc.replace(/\n/g, ' ')}\\nProof: ${card.proof_of_completion.replace(/\n/g, ' ')}`
      );

      if (card.planned_date && card.planned_start) {
        const dateClean = card.planned_date.replace(/-/g, '');
        const startClean = card.planned_start.replace(/:/g, '') + '00';
        const duration = card.planned_duration || 60;

        const [sh, sm] = card.planned_start.split(':').map(Number);
        const endTotal = sh * 60 + sm + duration;
        const eh = Math.floor(endTotal / 60);
        const em = endTotal % 60;
        const endClean = `${String(eh).padStart(2, '0')}${String(em).padStart(2, '0')}00`;

        lines.push(`DTSTART:${dateClean}T${startClean}`);
        lines.push(`DTEND:${dateClean}T${endClean}`);
      } else if (card.planned_date) {
        const dateClean = card.planned_date.replace(/-/g, '');
        lines.push(`DTSTART;VALUE=DATE:${dateClean}`);
      }

      lines.push('STATUS:CONFIRMED');
      lines.push('END:VEVENT');
    }

    // Include fixed calendar events
    for (const ev of this.fixedEvents) {
      if (ev.event_date >= monday && ev.event_date <= sundayStr) {
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:fixed-${ev.id}@pes.local`);
        lines.push(`SUMMARY:${ev.name}`);
        lines.push(`DESCRIPTION:Fixed calendar commitment (${ev.resource})`);
        const dateClean = ev.event_date.replace(/-/g, '');
        const startClean = ev.start_time.replace(/:/g, '') + '00';
        const endClean = ev.end_time.replace(/:/g, '') + '00';
        lines.push(`DTSTART:${dateClean}T${startClean}`);
        lines.push(`DTEND:${dateClean}T${endClean}`);
        lines.push('STATUS:CONFIRMED');
        lines.push('END:VEVENT');
      }
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  public addInboxItem(rawText: string): InboxItem {
    if (!rawText || !rawText.trim()) throw new Error('Raw inbox item text cannot be empty');
    const item: InboxItem = {
      id: this.nextInboxId++,
      timestamp: new Date().toISOString(),
      raw_text: rawText.trim(),
      mark: '?',
      processed_at: null,
      process_action: null,
      card_id: null,
    };
    this.inbox.push(item);
    return item;
  }

  public processInboxItem(
    inboxId: number,
    action: 'define' | 'discard' | 'defer',
    cardPayload?: Partial<CommitmentCard>
  ): { item: InboxItem; card?: CommitmentCard } {
    const item = this.inbox.find((i) => i.id === inboxId);
    if (!item) throw new Error(`Inbox item ${inboxId} not found`);

    item.processed_at = new Date().toISOString();
    item.process_action = action;

    if (action === 'discard') {
      item.mark = 'X';
      return { item };
    }

    if (action === 'defer') {
      item.mark = '?';
      return { item };
    }

    if (action === 'define') {
      item.mark = '!';
      const created = this.createCard({
        name: cardPayload?.name || item.raw_text,
        current_state_desc: cardPayload?.current_state_desc || '',
        desired_state_desc: cardPayload?.desired_state_desc || '',
        proof_of_completion: cardPayload?.proof_of_completion || '',
        next_physical_action: cardPayload?.next_physical_action || '',
        priority: cardPayload?.priority || 0,
        risk_level: cardPayload?.risk_level || 'Low',
        fallback_action: cardPayload?.fallback_action || null,
        planned_duration: cardPayload?.planned_duration || null,
        state: 'Captured',
      });
      item.card_id = created.id;
      return { item, card: created };
    }

    return { item };
  }

  public setCapacity(record: Partial<CapacityRecord> & { week_of: string }): CapacityRecord {
    const monday = getMondayOfWeek(record.week_of);
    const total = Number(record.total_hours || 40);
    const fixed = Number(record.fixed_commitments || 0);
    const meals = Number(record.meals_travel_transitions || 0);
    const recovery = Number(record.recovery_reserve || 0);

    const { availableCapacity, scheduleLimit } = computeCapacity(total, fixed, meals, recovery);

    const saved: CapacityRecord = {
      id: this.capacityRecords.get(monday)?.id || this.capacityRecords.size + 1,
      week_of: monday,
      total_hours: total,
      fixed_commitments: fixed,
      meals_travel_transitions: meals,
      recovery_reserve: recovery,
      available_capacity: availableCapacity,
      schedule_limit: scheduleLimit,
    };

    this.capacityRecords.set(monday, saved);
    return saved;
  }
}

// Global singleton instance for shared backend and client-side access
export const globalPesEngine = new PesEngine();

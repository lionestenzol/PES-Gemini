export type CardState =
  | 'Captured'
  | 'Ready'
  | 'Scheduled'
  | 'Active'
  | 'Completed'
  | 'Verified'
  | 'Done'
  | 'Paused'
  | 'Blocked'
  | 'Canceled';

export type OperatingMode =
  | 'Full'
  | 'Reduced'
  | 'Recovery'
  | 'Admin'
  | 'Field'
  | 'Review';

export type RiskLevel = 'Low' | 'Medium' | 'High';

// Path C Roles & Personas
export type PesRole = 'worker' | 'scheduler' | 'verifier' | 'reviewer' | 'operator' | 'admin';

export interface UserIdentity {
  id: string;
  name: string;
  role: PesRole;
  avatar?: string;
}

// Path B Temporal Workflow Execution State
export interface TemporalWorkflowInfo {
  workflow_id: string;
  run_id: string;
  status: 'RUNNING' | 'COMPLETED' | 'PAUSED' | 'FAILED';
  started_at: string;
  last_heartbeat: string;
  heartbeat_count: number;
  activity_name: string;
  retry_attempt: number;
}

export interface CommitmentCard {
  id: string;
  level: 'Task' | 'Project' | 'Goal';
  name: string;
  parent_id?: string | null;
  // The Four Pillars of Definition
  current_state_desc: string;
  desired_state_desc: string;
  proof_of_completion: string;
  next_physical_action: string;
  
  state: CardState;
  schedule_status: 'unscheduled' | 'scheduled';
  
  // Scheduling (Path A & Path D)
  planned_date: string | null; // YYYY-MM-DD
  planned_start: string | null; // HH:MM
  planned_end: string | null; // HH:MM
  planned_duration: number | null; // in minutes
  earliest_start?: string | null; // ISO or YYYY-MM-DDTHH:MM
  latest_end?: string | null;
  deadline?: string | null;
  pinned?: boolean;
  
  // Execution & Single-Active facts
  actual_start: string | null; // ISO timestamp
  actual_end: string | null; // ISO timestamp
  result: string | null;
  proof_location: string | null;
  what_happened: string | null;
  
  // Blocking & Guard fields
  review_date: string | null;
  repeat_rule?: string | null;
  block_reason: string | null;
  waiting_for: string | null;
  fallback_action: string | null;
  
  owner: string;
  priority: number; // 0 - 100
  risk_level: RiskLevel;

  // Path B & Path C metadata
  temporal_workflow?: TemporalWorkflowInfo | null;
  verified_by?: string | null;
  verified_role?: PesRole | null;
  
  // Tactical steps (DropList sub-steps)
  steps?: { text: string; done: boolean }[];

  created_at: string;
  updated_at: string;
}

export interface InboxItem {
  id: number;
  timestamp: string;
  raw_text: string;
  mark: '?' | '!' | 'X';
  processed_at: string | null;
  process_action: string | null;
  card_id: string | null;
}

export interface CapacityRecord {
  id?: number;
  week_of: string; // Monday date YYYY-MM-DD
  total_hours: number;
  fixed_commitments: number;
  meals_travel_transitions: number;
  recovery_reserve: number;
  available_capacity: number;
  schedule_limit: number;
}

export interface AuditEvent {
  id: number;
  card_id: string;
  timestamp: string;
  state_from: string | null;
  state_to: string;
  note: string | null;
  actor?: string;
  actor_role?: PesRole;
  actual_start: string | null;
  actual_end: string | null;
}

export interface ProofRecord {
  id?: number;
  card_id: string;
  card_name?: string;
  result: string;
  proof_location: string;
  verified: boolean;
  verified_at: string | null;
  verified_by?: string | null;
  timestamp: string;
}

export interface CardLink {
  from_id: string;
  to_id: string;
  link_type: 'blocks' | 'requires' | 'relates' | 'excludes';
}

// Path D Solver Models
export interface FixedEvent {
  id: string;
  name: string;
  event_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  resource: string;
}

export interface ProposedBlock {
  card_id: string;
  card_name: string;
  planned_date: string; // YYYY-MM-DD
  planned_start: string; // HH:MM
  planned_end: string; // HH:MM
  planned_duration: number; // minutes
  priority: number;
  risk_level: RiskLevel;
  owner: string;
}

export interface UnscheduledItem {
  card_id: string;
  card_name: string;
  reason: string;
  priority: number;
  duration: number;
}

export interface OptimizerProposal {
  run_id: string;
  week_of: string;
  created_at: string;
  status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'INVALID_INPUT' | 'STOPPED';
  hard_score: number;
  soft_score: number;
  solve_time_ms: number;
  input_version: string;
  is_what_if: boolean;
  schedule_limit_hours: number;
  total_scheduled_hours: number;
  blocks: ProposedBlock[];
  unscheduled: UnscheduledItem[];
  errors: string[];
}

export interface WhatIfParameters {
  schedule_limit_override?: number;
  priority_overrides?: Record<string, number>;
  exclude_card_ids?: string[];
  additional_fixed_events?: FixedEvent[];
}

export type ActiveTab =
  | 'board'
  | 'queue'
  | 'optimizer'
  | 'droplist'
  | 'the-line'
  | 'v2-pipeline'
  | 'inbox'
  | 'capacity'
  | 'proof'
  | 'logs';

// ==========================================
// PES V2 — Complete Transformation Architecture
// ==========================================

export type PesV2Stage =
  | 'intent'
  | 'validation'
  | 'knowledge_resources'
  | 'list'
  | 'tree'
  | 'dependencies'
  | 'graph'
  | 'bpmn'
  | 'tickets'
  | 'execution'
  | 'proof'
  | 'state_update'
  | 'terminal_payload';

export interface PromptInterrogation {
  whatNeedsToKnow: string[];
  whatNeedsToDo: string[];
  whatNeedsToProduce: string[];
  whatConnectsTo: string[];
  whatCanStopIt: string[];
  whatHappensNext: string[];
}

export interface PromptIndexItem {
  id: string;
  category: 'Macro' | 'Micro';
  stage: PesV2Stage;
  title: string;
  component: string;
  interrogation: PromptInterrogation;
  rules: string[];
  gates: string[];
  failurePaths: string[];
  templateSnippet: string;
}

export interface V2IntakeRecord {
  id: string;
  rawInput: string;
  parsedSignal: {
    whatPersonWants: string;
    targetOutcome: string;
    parameters: Record<string, string>;
    constraints: string[];
  };
  intentBin: string;
  personHas: {
    assets: string[];
    capabilities: string[];
    currentSystemState: string;
  };
  intentHasComparison: {
    available: string[];
    missing: string[];
    clarificationNeeded: string[];
  };
  validationGate: {
    status: 'PASSED' | 'FAILED' | 'NEEDS_CLARIFICATION';
    completenessCheck: boolean;
    feasibilityCheck: boolean;
    constraintsMet: boolean;
    gateNotes: string;
  };
  timestamp: string;
}

export interface V2KnowledgeEntity {
  id: string;
  name: string;
  type: 'System' | 'Database' | 'Protocol' | 'Policy' | 'Environment';
  status: string;
  properties: Record<string, string>;
  relationships: { target: string; relation: string }[];
}

export interface V2ResourceEntity {
  id: string;
  name: string;
  type: 'Tool' | 'API' | 'File' | 'Credential' | 'Capability';
  availability: 'Available' | 'Locked' | 'Missing';
  purpose: string;
  location: string;
  dependencies: string[];
}

export interface V2DependencyCondition {
  id: string;
  source: string;
  target: string;
  conditionType: 'Prerequisite' | 'Resource_Blocker' | 'Verification_Requirement';
  description: string;
  satisfied: boolean;
}

export interface V2ListItem {
  id: string;
  order: number;
  item: string;
  type: 'Action' | 'Resource' | 'Output' | 'Prerequisite';
  requiredOutput: string;
}

export interface V2TreeNode {
  id: string;
  title: string;
  description: string;
  children?: V2TreeNode[];
  level: number;
}

export interface V2DependencyNode {
  id: string;
  title: string;
  prerequisites: string[];
  unlocks: string[];
  isBlocked: boolean;
  parallelGroup?: string;
}

export interface V2BpmnElement {
  id: string;
  type: 'StartEvent' | 'Task' | 'Gateway' | 'EndEvent';
  label: string;
  gatewayType?: 'Exclusive' | 'Parallel';
  condition?: string;
  next: string[];
}

export type V2ExecutorClass = 'Human' | 'AI' | 'System' | 'Tool';

export type V2TicketLifecycleState =
  | 'Created'
  | 'Sent'
  | 'Received'
  | 'Executing'
  | 'Executed'
  | 'ProofSubmitted'
  | 'ProofChecked'
  | 'Completed'
  | 'Failed';

export interface V2Ticket {
  id: string;
  title: string;
  workDescription: string;
  inputs: Record<string, string>;
  requirements: string[];
  dependencies: string[];
  destination: string;
  executorClass: V2ExecutorClass;
  expectedResult: string;
  proofRequirements: string;
  lifecycleState: V2TicketLifecycleState;
  executionResult?: string;
  submittedProof?: string;
  proofValid?: boolean;
  telemetry: string[];
  createdAt: string;
  executedAt?: string;
}

export interface V2TelemetryLogEntry {
  id: string;
  timestamp: string;
  ticketId: string;
  eventType: 'SENT' | 'RECEIVED' | 'EXECUTE_START' | 'EXECUTE_STEP' | 'STDOUT' | 'STDERR' | 'PROOF_SUBMITTED' | 'STATE_UPDATE';
  message: string;
  metadata?: Record<string, any>;
}

export interface V2TroubleshootingTicket {
  id: string;
  failedTicketId: string;
  failureEvidence: string;
  rootCauseHypothesis: string;
  mitigationPlan: string[];
  reEntryStage: PesV2Stage;
  status: 'Open' | 'Resolved' | 'Escalated';
  createdAt: string;
  resolvedAt?: string;
}

export interface V2TerminalJsonPayload {
  payload_version: '2.0.0';
  system: 'PES V2 (Planning Execution System)';
  timestamp: string;
  integrity_hash: string;
  original_input: string;
  validated_intent: V2IntakeRecord;
  knowledge_and_resources: {
    knowledge_entities: V2KnowledgeEntity[];
    resource_entities: V2ResourceEntity[];
    dependency_matrix: V2DependencyCondition[];
  };
  structural_evolution: {
    list: V2ListItem[];
    tree: V2TreeNode[];
    dependency_graph: V2DependencyNode[];
    bpmn_routing: V2BpmnElement[];
  };
  tickets: V2Ticket[];
  telemetry_logs: V2TelemetryLogEntry[];
  troubleshooting_history: V2TroubleshootingTicket[];
  final_state_updates: {
    knowledge_updated: boolean;
    resources_released: string[];
    dependencies_unlocked: string[];
    overall_status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  };
}

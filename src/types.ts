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
  
  // Scheduling
  planned_date: string | null; // YYYY-MM-DD
  planned_start: string | null; // HH:MM
  planned_end: string | null; // HH:MM
  planned_duration: number | null; // in minutes
  
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
  timestamp: string;
}

export interface CardLink {
  from_id: string;
  to_id: string;
  link_type: 'blocks' | 'requires' | 'relates';
}

export type ActiveTab =
  | 'board'
  | 'queue'
  | 'inbox'
  | 'capacity'
  | 'proof'
  | 'logs';

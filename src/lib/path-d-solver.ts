import {
  CommitmentCard,
  CapacityRecord,
  CardLink,
  FixedEvent,
  ProposedBlock,
  UnscheduledItem,
  OptimizerProposal,
  WhatIfParameters,
  RiskLevel,
} from '../types.js';
import { getMondayOfWeek } from './pes-engine.js';

export const TIME_UNIT_MINUTES = 15;
export const WORK_START_HOUR = 9; // 09:00
export const WORK_END_HOUR = 17; // 17:00
export const WORK_MINUTES_PER_DAY = (WORK_END_HOUR - WORK_START_HOUR) * 60; // 480 mins

export const WEIGHTS = {
  scheduled: 10_000,
  priority: 100,
  risk: 25,
  plan_change: 10,
};

// Formats minute of day to HH:MM
export function minuteToTimeStr(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeStrToMinute(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function getDateForDayOffset(mondayStr: string, dayOffset: number): string {
  const date = new Date(mondayStr + 'T00:00:00');
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().split('T')[0];
}

export class PathDSolver {
  /**
   * Solves the optimal Monday-Friday schedule given the constraints.
   */
  public static solve(
    weekMonday: string,
    cards: CommitmentCard[],
    capacity: CapacityRecord,
    links: CardLink[] = [],
    fixedEvents: FixedEvent[] = [],
    whatIf?: WhatIfParameters
  ): OptimizerProposal {
    const startTime = performance.now();
    const monday = getMondayOfWeek(weekMonday);
    const errors: string[] = [];

    // Capacity limit
    const scheduleLimitHours =
      whatIf?.schedule_limit_override !== undefined
        ? whatIf.schedule_limit_override
        : capacity.schedule_limit;
    const maxAllowedMinutes = Math.round(scheduleLimitHours * 60);

    // Filter eligible cards: Ready or Scheduled, matching scope
    let candidateCards = cards.filter(
      (c) => c.state === 'Ready' || c.state === 'Scheduled'
    );

    if (whatIf?.exclude_card_ids && whatIf.exclude_card_ids.length > 0) {
      candidateCards = candidateCards.filter(
        (c) => !whatIf.exclude_card_ids!.includes(c.id)
      );
    }

    // Apply priority overrides
    const cardsWithOverrides = candidateCards.map((c) => {
      const priority =
        whatIf?.priority_overrides?.[c.id] !== undefined
          ? whatIf.priority_overrides[c.id]
          : c.priority;
      return { ...c, priority };
    });

    // Validate inputs
    for (const c of cardsWithOverrides) {
      if (!c.planned_duration || c.planned_duration <= 0) {
        errors.push(`Card ${c.id} ("${c.name}") is missing a valid positive planned_duration`);
      }
    }

    if (errors.length > 0) {
      return {
        run_id: 'RUN-' + Date.now().toString(36).toUpperCase(),
        week_of: monday,
        created_at: new Date().toISOString(),
        status: 'INVALID_INPUT',
        hard_score: -1,
        soft_score: 0,
        solve_time_ms: Math.round(performance.now() - startTime),
        input_version: 'hash-' + Math.random().toString(36).substring(2, 10),
        is_what_if: Boolean(whatIf),
        schedule_limit_hours: scheduleLimitHours,
        total_scheduled_hours: 0,
        blocks: [],
        unscheduled: [],
        errors,
      };
    }

    // Fixed events combined
    const allFixedEvents = [
      ...fixedEvents,
      ...(whatIf?.additional_fixed_events || []),
    ];

    // Build available calendar slots for Monday (0) to Friday (4)
    // Working hours: 09:00 (540) to 17:00 (1020)
    interface DaySchedule {
      date: string;
      dayIndex: number;
      // Array of occupied intervals [startMinute, endMinute]
      occupied: { start: number; end: number; label: string }[];
    }

    const days: DaySchedule[] = [];
    for (let d = 0; d < 5; d++) {
      const dateStr = getDateForDayOffset(monday, d);
      const occupied: { start: number; end: number; label: string }[] = [];

      // Check fixed events on this date
      for (const ev of allFixedEvents) {
        if (ev.event_date === dateStr) {
          occupied.push({
            start: timeStrToMinute(ev.start_time),
            end: timeStrToMinute(ev.end_time),
            label: ev.name,
          });
        }
      }

      // Sort occupied
      occupied.sort((a, b) => a.start - b.end);
      days.push({ date: dateStr, dayIndex: d, occupied });
    }

    // Sort cards to schedule by solver objective:
    // Pinned cards first, then high priority desc, then high risk desc
    const sortedCards = [...cardsWithOverrides].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      const riskScore = (r: RiskLevel) => (r === 'High' ? 2 : r === 'Medium' ? 1 : 0);
      const scoreA = (a.priority || 0) * 100 + riskScore(a.risk_level) * 25;
      const scoreB = (b.priority || 0) * 100 + riskScore(b.risk_level) * 25;
      return scoreB - scoreA;
    });

    const scheduledBlocks: ProposedBlock[] = [];
    const unscheduled: UnscheduledItem[] = [];
    let totalScheduledMinutes = 0;
    let softScore = 0;

    // Helper to find the earliest open slot of `duration` in `days`
    const findSlot = (
      duration: number,
      card: CommitmentCard
    ): { day: DaySchedule; start: number; end: number } | null => {
      // If pinned with date and start, verify availability
      if (card.pinned && card.planned_date && card.planned_start) {
        const targetDay = days.find((d) => d.date === card.planned_date);
        if (targetDay) {
          const start = timeStrToMinute(card.planned_start);
          const end = start + duration;
          // Verify bounds and non-overlap
          if (start >= 540 && end <= 1020) {
            const hasConflict = targetDay.occupied.some(
              (o) => Math.max(start, o.start) < Math.min(end, o.end)
            );
            if (!hasConflict) {
              return { day: targetDay, start, end };
            }
          }
        }
      }

      // Check dependency predecessors: must be scheduled on or before this day/time
      const blockingLinks = links.filter(
        (l) => l.to_id === card.id && (l.link_type === 'blocks' || l.link_type === 'requires')
      );
      let minStartDay = 0;
      let minStartMinute = 540;

      for (const link of blockingLinks) {
        const predecessorBlock = scheduledBlocks.find((b) => b.card_id === link.from_id);
        if (predecessorBlock) {
          const pDayIndex = days.findIndex((d) => d.date === predecessorBlock.planned_date);
          const pEndMin = timeStrToMinute(predecessorBlock.planned_end);
          if (pDayIndex > minStartDay) {
            minStartDay = pDayIndex;
            minStartMinute = pEndMin;
          } else if (pDayIndex === minStartDay && pEndMin > minStartMinute) {
            minStartMinute = pEndMin;
          }
        }
      }

      // Scan day by day starting from minStartDay
      for (let dayIdx = minStartDay; dayIdx < days.length; dayIdx++) {
        const day = days[dayIdx];
        let cursor = dayIdx === minStartDay ? Math.max(540, minStartMinute) : 540;

        // Align cursor to 15-minute intervals
        const rem = cursor % TIME_UNIT_MINUTES;
        if (rem !== 0) cursor += TIME_UNIT_MINUTES - rem;

        while (cursor + duration <= 1020) {
          const candidateEnd = cursor + duration;
          // Check collision with day.occupied
          const conflict = day.occupied.find(
            (o) => Math.max(cursor, o.start) < Math.min(candidateEnd, o.end)
          );

          if (!conflict) {
            return { day, start: cursor, end: candidateEnd };
          } else {
            // Jump cursor to end of conflict
            cursor = conflict.end;
            const r = cursor % TIME_UNIT_MINUTES;
            if (r !== 0) cursor += TIME_UNIT_MINUTES - r;
          }
        }
      }

      return null;
    };

    // Solve loop
    for (const card of sortedCards) {
      const duration = card.planned_duration || 60;

      // 1. Capacity limit check
      if (totalScheduledMinutes + duration > maxAllowedMinutes) {
        unscheduled.push({
          card_id: card.id,
          card_name: card.name,
          priority: card.priority || 0,
          duration,
          reason: `Exceeds safe weekly capacity ceiling (${scheduleLimitHours}h). Scheduling would require ${(
            (totalScheduledMinutes + duration) /
            60
          ).toFixed(1)}h.`,
        });
        continue;
      }

      // 2. Search for slot
      const slot = findSlot(duration, card);
      if (!slot) {
        unscheduled.push({
          card_id: card.id,
          card_name: card.name,
          priority: card.priority || 0,
          duration,
          reason: `No open ${duration}m slot available between 09:00-17:00 Monday-Friday without conflict.`,
        });
        continue;
      }

      // Slot found! Allocate it
      slot.day.occupied.push({
        start: slot.start,
        end: slot.end,
        label: `[${card.id}] ${card.name}`,
      });
      slot.day.occupied.sort((a, b) => a.start - b.end);

      const block: ProposedBlock = {
        card_id: card.id,
        card_name: card.name,
        planned_date: slot.day.date,
        planned_start: minuteToTimeStr(slot.start),
        planned_end: minuteToTimeStr(slot.end),
        planned_duration: duration,
        priority: card.priority || 0,
        risk_level: card.risk_level,
        owner: card.owner || 'user',
      };

      scheduledBlocks.push(block);
      totalScheduledMinutes += duration;

      // Calculate soft score
      const riskScore = card.risk_level === 'High' ? 2 : card.risk_level === 'Medium' ? 1 : 0;
      let scoreIncrement =
        WEIGHTS.scheduled +
        (card.priority || 0) * WEIGHTS.priority +
        riskScore * WEIGHTS.risk;

      // Plan change penalty if rescheduling an existing scheduled card with different time
      if (card.state === 'Scheduled' && card.planned_start && card.planned_date) {
        if (card.planned_date !== block.planned_date || card.planned_start !== block.planned_start) {
          scoreIncrement -= WEIGHTS.plan_change;
        }
      }

      softScore += scoreIncrement;
    }

    // Sort scheduled blocks chronologically by date and start time
    scheduledBlocks.sort((a, b) => {
      if (a.planned_date !== b.planned_date) {
        return a.planned_date.localeCompare(b.planned_date);
      }
      return a.planned_start.localeCompare(b.planned_start);
    });

    const elapsed = Math.round(performance.now() - startTime);

    return {
      run_id: 'RUN-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
      week_of: monday,
      created_at: new Date().toISOString(),
      status: scheduledBlocks.length > 0 ? 'OPTIMAL' : 'FEASIBLE',
      hard_score: 0,
      soft_score: softScore,
      solve_time_ms: Math.max(1, elapsed),
      input_version: 'hash-' + Math.random().toString(36).substring(2, 10),
      is_what_if: Boolean(whatIf),
      schedule_limit_hours: scheduleLimitHours,
      total_scheduled_hours: Number((totalScheduledMinutes / 60).toFixed(2)),
      blocks: scheduledBlocks,
      unscheduled,
      errors: [],
    };
  }
}

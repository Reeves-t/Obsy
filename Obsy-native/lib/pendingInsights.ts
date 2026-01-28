import { startOfDay, startOfWeek, startOfMonth, endOfDay } from 'date-fns';
import { Capture } from '@/types/capture';
import { InsightHistory } from '@/services/insightHistory';

export type InsightKind = "daily" | "weekly" | "monthly";

export interface InsightSnapshot {
    kind: InsightKind;
    generatedAt: number; // ms
    periodStart: number; // ms
    periodEnd: number; // ms
    includedCaptureIds: string[];
}

export interface PendingInsightInfo {
    pendingCount: number;
    totalEligible: number;
}

export type PendingInsights = Record<InsightKind, PendingInsightInfo>;

/**
 * Defines time windows consistently across the app.
 * Matches existing logic in insightsEngine.ts and longTermInsights.ts
 */
export function getPeriod(kind: InsightKind, date: Date = new Date()): { start: number; end: number } {
    const now = date.getTime();

    switch (kind) {
        case "daily":
            return {
                start: startOfDay(date).getTime(),
                end: now
            };
        case "weekly":
            // Consistent with WEEK_STARTS_ON (Sunday start)
            return {
                start: startOfWeek(date, { weekStartsOn: 0 }).getTime(),
                end: now
            };
        case "monthly":
            return {
                start: startOfMonth(date).getTime(),
                end: now
            };
    }
}

/**
 * Single source of truth for capture eligibility in insights.
 */
export function isEligibleForInsights(capture: Capture): boolean {
    // A capture is eligible only if it hasn't been explicitly opted out
    return capture.includeInInsights !== false;
}

/**
 * Main computation engine for pending insights.
 * Zero-AI, zero-token cost, deterministic.
 */
export function computePendingInsights(
    captures: Capture[],
    snapshots: Partial<Record<InsightKind, InsightSnapshot>>,
    now: Date = new Date()
): PendingInsights {
    const result = {} as PendingInsights;

    (["daily", "weekly", "monthly"] as InsightKind[]).forEach((kind) => {
        const { start, end } = getPeriod(kind, now);

        // 1. Filter eligible captures for this period
        const eligible = captures.filter((c) => {
            const createdAt = new Date(c.created_at).getTime();
            return createdAt >= start && createdAt <= end && isEligibleForInsights(c);
        });

        // 2. Get the set of IDs already included in the snapshot
        const includedSet = new Set(snapshots[kind]?.includedCaptureIds ?? []);

        // 3. Count captures that are eligible but not in the snapshot
        const pendingCount = eligible.reduce((acc, c) => acc + (includedSet.has(c.id) ? 0 : 1), 0);

        result[kind] = {
            pendingCount,
            totalEligible: eligible.length
        };
    });

    return result;
}

/**
 * Helper to create a snapshot from an existing InsightHistory row
 */
export function createSnapshotFromHistory(
    history: InsightHistory | null,
    kind: InsightKind
): InsightSnapshot | null {
    if (!history) return null;

    return {
        kind,
        generatedAt: new Date(history.created_at).getTime(),
        periodStart: new Date(history.start_date).getTime(),
        periodEnd: new Date(history.end_date).getTime(),
        includedCaptureIds: history.capture_ids || []
    };
}

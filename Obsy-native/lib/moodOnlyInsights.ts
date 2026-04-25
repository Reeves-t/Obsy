import { Capture } from '@/types/capture';

type InsightScope = 'daily' | 'weekly' | 'monthly';

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isMoodOnlyEntry(capture: Capture): boolean {
  return !hasText(capture.image_url) && !hasText(capture.note);
}

export function areAllMoodOnlyEntries(captures: Capture[]): boolean {
  return captures.length > 0 && captures.every(isMoodOnlyEntry);
}

function getDominantMoodLabel(captures: Capture[]): string {
  const counts = new Map<string, number>();

  captures.forEach((capture) => {
    const label = capture.mood_name_snapshot?.trim() || 'Neutral';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? 'Neutral';
}

function getUniqueMoodCount(captures: Capture[]): number {
  return new Set(
    captures.map((capture) => capture.mood_name_snapshot?.trim() || 'Neutral')
  ).size;
}

function getScopePrefix(scope: InsightScope): string {
  if (scope === 'daily') return 'Today';
  if (scope === 'weekly') return 'This week';
  return 'This month';
}

export function buildMoodOnlyInsight(scope: InsightScope, captures: Capture[]): string {
  const prefix = getScopePrefix(scope);
  const dominantMood = getDominantMoodLabel(captures);
  const uniqueMoodCount = getUniqueMoodCount(captures);

  if (captures.length === 1) {
    return `${prefix} lands on ${dominantMood}. That mood is logged as it is, without trying to turn it into more than a simple check in.`;
  }

  if (uniqueMoodCount === 1) {
    return `${prefix} stays mostly in ${dominantMood}. There is a clear mood signal here, even without photos or written context attached to it.`;
  }

  return `${prefix} leans most toward ${dominantMood}, with a few shifts around it. The mood pattern is visible, and it does not need extra story added on top of it.`;
}

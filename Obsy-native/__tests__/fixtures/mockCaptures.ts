/**
 * Mock capture factory functions for testing insight generation.
 * These utilities create valid Capture objects without requiring actual database calls.
 */

import { Capture } from '@/types/capture';

/**
 * Default values for mock captures
 */
const DEFAULTS = {
  user_id: 'test-user-123',
  image_url: 'file:///test/image.jpg',
  tags: [] as string[],
  includeInInsights: true,
  usePhotoForInsight: false,
  note: null as string | null,
};

/**
 * Create a single mock capture with optional overrides.
 * 
 * @param overrides - Partial capture fields to override defaults
 * @returns A valid Capture object
 */
export function createMockCapture(overrides: Partial<Capture> = {}): Capture {
  const id = overrides.id || `capture-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const created_at = overrides.created_at || new Date().toISOString();
  
  return {
    id,
    user_id: DEFAULTS.user_id,
    created_at,
    mood_id: overrides.mood_id || 'joyful',
    mood_name_snapshot: overrides.mood_name_snapshot || 'Joyful',
    note: overrides.note ?? DEFAULTS.note,
    image_url: overrides.image_url || DEFAULTS.image_url,
    tags: overrides.tags || DEFAULTS.tags,
    includeInInsights: overrides.includeInInsights ?? DEFAULTS.includeInInsights,
    usePhotoForInsight: overrides.usePhotoForInsight ?? DEFAULTS.usePhotoForInsight,
    ...overrides,
  };
}

/**
 * Create 2 captures with reversed timestamps (second capture has earlier timestamp).
 * Used to test chronological ordering.
 * 
 * @returns Array of 2 captures with out-of-order timestamps
 */
export function createOutOfOrderCaptures(): Capture[] {
  const baseDate = new Date('2025-02-04T10:00:00Z');
  
  // First capture has LATER timestamp
  const capture1 = createMockCapture({
    id: 'out-of-order-1',
    created_at: new Date(baseDate.getTime() + 3600000).toISOString(), // +1 hour
    mood_id: 'calm',
    mood_name_snapshot: 'Calm',
    note: 'Afternoon reflection',
  });
  
  // Second capture has EARLIER timestamp (out of order in array)
  const capture2 = createMockCapture({
    id: 'out-of-order-2',
    created_at: baseDate.toISOString(), // Earlier time
    mood_id: 'joyful',
    mood_name_snapshot: 'Joyful',
    note: 'Morning start',
  });
  
  // Return in wrong order - chronological sorting should fix this
  return [capture1, capture2];
}

/**
 * Create 4 days worth of captures (2-3 captures per day) for weekly testing.
 * Spans Monday to Thursday of the week containing 2025-02-03.
 * 
 * @returns Array of 8-12 captures spanning 4 days
 */
export function createWeeklyCaptures(): Capture[] {
  const captures: Capture[] = [];
  
  // Monday - 2 captures
  captures.push(createMockCapture({
    id: 'weekly-mon-1',
    created_at: '2025-02-03T09:00:00Z',
    mood_id: 'joyful',
    mood_name_snapshot: 'Joyful',
    note: 'Monday morning energy',
  }));
  captures.push(createMockCapture({
    id: 'weekly-mon-2',
    created_at: '2025-02-03T18:00:00Z',
    mood_id: 'calm',
    mood_name_snapshot: 'Calm',
    note: 'Monday evening wind-down',
  }));
  
  // Tuesday - 3 captures
  captures.push(createMockCapture({
    id: 'weekly-tue-1',
    created_at: '2025-02-04T08:30:00Z',
    mood_id: 'anxious',
    mood_name_snapshot: 'Anxious',
    note: 'Tuesday deadline stress',
  }));
  captures.push(createMockCapture({
    id: 'weekly-tue-2',
    created_at: '2025-02-04T12:00:00Z',
    mood_id: 'neutral',
    mood_name_snapshot: 'Neutral',
  }));
  captures.push(createMockCapture({
    id: 'weekly-tue-3',
    created_at: '2025-02-04T20:00:00Z',
    mood_id: 'content',
    mood_name_snapshot: 'Content',
    note: 'Project completed',
  }));
  
  // Wednesday - 2 captures
  captures.push(createMockCapture({
    id: 'weekly-wed-1',
    created_at: '2025-02-05T10:00:00Z',
    mood_id: 'joyful',
    mood_name_snapshot: 'Joyful',
  }));
  captures.push(createMockCapture({
    id: 'weekly-wed-2',
    created_at: '2025-02-05T16:00:00Z',
    mood_id: 'calm',
    mood_name_snapshot: 'Calm',
  }));
  
  // Thursday - 2 captures
  captures.push(createMockCapture({
    id: 'weekly-thu-1',
    created_at: '2025-02-06T11:00:00Z',
    mood_id: 'excited',
    mood_name_snapshot: 'Excited',
    note: 'Weekend plans',
  }));
  captures.push(createMockCapture({
    id: 'weekly-thu-2',
    created_at: '2025-02-06T19:00:00Z',
    mood_id: 'grateful',
    mood_name_snapshot: 'Grateful',
  }));
  
  return captures;
}

/**
 * Create 3 captures with different moods for mood flow testing.
 * 
 * @returns Array of 3 captures with distinct moods
 */
export function createMoodFlowCaptures(): Capture[] {
  const baseDate = new Date('2025-02-04T08:00:00Z');
  
  return [
    createMockCapture({
      id: 'mood-flow-1',
      created_at: baseDate.toISOString(),
      mood_id: 'joyful',
      mood_name_snapshot: 'Joyful',
      note: 'Great start to the day',
    }),
    createMockCapture({
      id: 'mood-flow-2',
      created_at: new Date(baseDate.getTime() + 4 * 3600000).toISOString(), // +4 hours
      mood_id: 'anxious',
      mood_name_snapshot: 'Anxious',
      note: 'Work meeting stress',
    }),
    createMockCapture({
      id: 'mood-flow-3',
      created_at: new Date(baseDate.getTime() + 8 * 3600000).toISOString(), // +8 hours
      mood_id: 'calm',
      mood_name_snapshot: 'Calm',
      note: 'Evening relaxation',
    }),
  ];
}


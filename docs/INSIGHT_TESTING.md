# Insight Testing Guide

## Overview

This document describes the regression testing strategy for the insight generation system. The tests validate three critical behaviors:

1. **Chronological Ordering** - Captures must be sorted by `created_at` ascending
2. **Length Scaling** - Weekly/monthly insights handle multi-day data correctly
3. **AI-Generated Mood Flow** - Mood flow segments are properly structured and validated

## Running Tests

### Jest Test Suite

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run with coverage report
npm test -- --coverage
```

### Dev Harness (Manual Testing)

```bash
# Run interactive test scenarios with formatted output
npm run test:insights
```

The dev harness provides colored console output showing:
- Input data (capture counts, timestamps)
- Output data (sorted captures, validation results)
- Pass/fail indicators (✓ green, ✗ red)

## Test Scenarios

| Scenario | Input | Expected Output | Validates |
|----------|-------|-----------------|-----------|
| Daily - Out of Order | 2 captures with reversed timestamps | Captures sorted by `created_at` ASC | Chronological ordering |
| Weekly - Multi-Day | 4 days of captures (8-12 total) | Captures grouped by date, sorted chronologically | Length scaling, time-awareness |
| Mood Flow - Segments | 3 captures with distinct moods | Valid `mood_flow` array with 3 segments | AI-generated mood flow structure |
| Parsing - Markdown Fences | AI response with ` ```json ` fences | Clean JSON object, no backticks | Defensive parsing |

## Adding New Tests

### Guidelines

1. **Use mock capture factories** - Import from `__tests__/fixtures/mockCaptures.ts`
2. **Validate against canonical schema** - Use types from `types/insights.ts`
3. **Avoid actual AI calls** - Tests should be fast and deterministic
4. **Test edge cases** - Empty arrays, single captures, boundary dates

### File Locations

- **Jest tests**: `Obsy-native/__tests__/*.test.ts`
- **Test fixtures**: `Obsy-native/__tests__/fixtures/`
- **Dev harness**: `Obsy-native/scripts/testInsights.ts`

### Naming Convention

- Test files: `*.test.ts`
- Describe blocks: Feature name (e.g., "Daily Insight - Chronological Ordering")
- Test cases: `it('should...')` format

### Example: Adding a New Test

```typescript
import { createMockCapture } from './fixtures/mockCaptures';
import { getCapturesForDaily } from '@/lib/insightTime';

describe('New Feature', () => {
  it('should handle edge case correctly', () => {
    // Arrange
    const captures = [createMockCapture({ /* overrides */ })];
    
    // Act
    const result = getCapturesForDaily(new Date(), captures);
    
    // Assert
    expect(result).toHaveLength(1);
  });
});
```

## Debugging Failed Tests

### Common Issues

1. **Invalid timestamps**
   - Ensure `created_at` is a valid ISO string
   - Check timezone handling with `getLocalDayKey()`

2. **Mood ID mismatches**
   - System moods: `'joyful'`, `'calm'`, `'anxious'`, etc.
   - Custom moods: `'custom_<uuid>'` format

3. **includeInInsights flag**
   - Should be `true` or `undefined` for inclusion
   - `false` excludes from insight generation

4. **Mood flow percentage sum**
   - Must equal 100 (±1 tolerance for rounding)
   - Each segment must have positive percentage

### Debug Logging

Enable verbose logging in tests:

```typescript
it('should...', () => {
  const result = getCapturesForDaily(date, captures);
  console.log('Filtered captures:', JSON.stringify(result, null, 2));
  // ... assertions
});
```

## Mock Data Reference

### `createMockCapture(overrides)`

Creates a single valid `Capture` object.

**Default values:**
- `user_id`: `'test-user-123'`
- `mood_id`: `'joyful'`
- `mood_name_snapshot`: `'Joyful'`
- `includeInInsights`: `true`
- `usePhotoForInsight`: `false`

**Usage:**
```typescript
const capture = createMockCapture({
  id: 'custom-id',
  mood_id: 'anxious',
  mood_name_snapshot: 'Anxious',
  note: 'Optional note',
});
```

### `createOutOfOrderCaptures()`

Returns 2 captures with timestamps in wrong order (for testing chronological sorting).

### `createWeeklyCaptures()`

Returns 8-12 captures spanning 4 days (Monday-Thursday) for weekly insight testing.

### `createMoodFlowCaptures()`

Returns 3 captures with distinct moods (joyful, anxious, calm) for mood flow testing.

## Validation Functions

### `getCapturesForDaily(date, captures)`

Filters and sorts captures for a specific day.

- **Returns**: Captures sorted by `created_at` ascending
- **Filters**: `includeInInsights !== false`

### `getCapturesForWeek(weekStart, captures)`

Filters and sorts captures for a week range.

- **Returns**: Captures within week range, sorted chronologically
- **Week**: Sunday to Saturday (configurable)

### `validateMoodFlowSegments(segments)`

Validates mood flow segment structure.

- **Required fields**: `mood`, `percentage`, `color`
- **Color format**: `#RRGGBB` (hex)
- **Percentage sum**: Must equal 100 (±1 tolerance)

### `stripMarkdownFences(text)`

Removes markdown code fences from AI responses.

- Removes ` ```json ` and ` ``` ` patterns
- Trims whitespace


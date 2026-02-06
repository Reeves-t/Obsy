/**
 * Insight Regression Test Suite
 * 
 * Tests critical insight behaviors:
 * - Chronological ordering of captures
 * - Length scaling across time periods
 * - AI-generated mood flow structure
 * - Defensive parsing of AI responses
 */

import {
  createOutOfOrderCaptures,
  createWeeklyCaptures,
  createMoodFlowCaptures,
} from './fixtures/mockCaptures';
import { getCapturesForDaily, getCapturesForWeek } from '@/lib/insightTime';
import { stripMarkdownFences, parseInsightResponse, validateMoodFlowSegments } from '@/lib/insightValidator';
import { generateFallbackMoodFlow, CaptureData } from '@/services/secureAI';

describe('Insight Generation', () => {
  /**
   * Test 1: Daily Insight - Chronological Ordering
   * Verifies that captures are sorted by created_at ascending
   */
  describe('Daily Insight - Chronological Ordering', () => {
    it('should sort captures by created_at ascending', () => {
      // Arrange: Get 2 captures with reversed timestamps
      const outOfOrderCaptures = createOutOfOrderCaptures();
      const targetDate = new Date('2025-02-04T10:00:00Z');
      
      // Act: Filter and sort captures for the day
      const sortedCaptures = getCapturesForDaily(targetDate, outOfOrderCaptures);
      
      // Assert: Captures should be in chronological order
      expect(sortedCaptures.length).toBe(2);
      
      const firstTimestamp = new Date(sortedCaptures[0].created_at).getTime();
      const secondTimestamp = new Date(sortedCaptures[1].created_at).getTime();
      
      expect(firstTimestamp).toBeLessThan(secondTimestamp);
    });

    it('should preserve capture count after filtering', () => {
      const captures = createOutOfOrderCaptures();
      const targetDate = new Date('2025-02-04T10:00:00Z');
      
      const result = getCapturesForDaily(targetDate, captures);
      
      expect(result.length).toBe(captures.length);
    });
  });

  /**
   * Test 2: Weekly Insight - Length Scaling
   * Verifies multi-day coverage and chronological sorting
   */
  describe('Weekly Insight - Multi-Day Coverage', () => {
    it('should filter captures within week range and sort chronologically', () => {
      // Arrange: Get 4 days of captures
      const weeklyCaptures = createWeeklyCaptures();
      const weekStart = new Date('2025-02-02T00:00:00Z'); // Sunday
      
      // Act: Filter and sort captures for the week
      const result = getCapturesForWeek(weekStart, weeklyCaptures);
      
      // Assert: Should have captures from multiple days
      expect(result.length).toBeGreaterThan(0);
      
      // Group by date to verify multi-day coverage
      const uniqueDates = new Set(
        result.map(c => c.created_at.split('T')[0])
      );
      expect(uniqueDates.size).toBeGreaterThanOrEqual(4);
    });

    it('should sort captures chronologically across all days', () => {
      const weeklyCaptures = createWeeklyCaptures();
      const weekStart = new Date('2025-02-02T00:00:00Z');
      
      const result = getCapturesForWeek(weekStart, weeklyCaptures);
      
      // Verify chronological order
      for (let i = 1; i < result.length; i++) {
        const prevTime = new Date(result[i - 1].created_at).getTime();
        const currTime = new Date(result[i].created_at).getTime();
        expect(prevTime).toBeLessThanOrEqual(currTime);
      }
    });

    it('should only include captures with includeInInsights !== false', () => {
      const weeklyCaptures = createWeeklyCaptures();
      const weekStart = new Date('2025-02-02T00:00:00Z');
      
      const result = getCapturesForWeek(weekStart, weeklyCaptures);
      
      result.forEach(capture => {
        expect(capture.includeInInsights).not.toBe(false);
      });
    });
  });

  /**
   * Test 3: Mood Flow - Segment Validation
   * Verifies mood_flow structure and percentage sum
   */
  describe('Mood Flow - Segment Validation', () => {
    it('should validate valid mood_flow segments', () => {
      // Arrange: Create valid mood_flow array
      const moodFlow = [
        { mood: 'quiet contentment', percentage: 40, color: '#7CB9E8' },
        { mood: 'restless energy', percentage: 35, color: '#E57373' },
        { mood: 'gentle calm', percentage: 25, color: '#81C784' },
      ];
      
      // Act: Validate segments
      const result = validateMoodFlowSegments(moodFlow);
      
      // Assert: Should pass validation
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require mood, percentage, and color fields', () => {
      const invalidSegments = [
        { mood: 'test' }, // Missing percentage and color
      ];
      
      const result = validateMoodFlowSegments(invalidSegments);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate hex color format', () => {
      const invalidColor = [
        { mood: 'test', percentage: 100, color: 'red' }, // Invalid hex
      ];
      
      const result = validateMoodFlowSegments(invalidColor);
      
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('hex format'))).toBe(true);
    });

    it('should require percentages to sum to 100 (±1 tolerance)', () => {
      const wrongSum = [
        { mood: 'test1', percentage: 50, color: '#FFFFFF' },
        { mood: 'test2', percentage: 40, color: '#000000' },
        // Missing 10%
      ];

      const result = validateMoodFlowSegments(wrongSum);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sum to'))).toBe(true);
    });
  });

  /**
   * Test 4: Parsing - No JSON in Output
   * Verifies markdown fence stripping and JSON extraction
   */
  describe('Parsing - Markdown Fence Stripping', () => {
    it('should remove markdown json fences', () => {
      const rawResponse = '```json\n{"insight": "test content"}\n```';

      const cleaned = stripMarkdownFences(rawResponse);

      expect(cleaned).not.toContain('```');
      expect(cleaned).not.toContain('json');
      expect(cleaned).toBe('{"insight": "test content"}');
    });

    it('should remove plain backtick fences', () => {
      const rawResponse = '```\n{"data": "value"}\n```';

      const cleaned = stripMarkdownFences(rawResponse);

      expect(cleaned).not.toContain('`');
      expect(cleaned).toBe('{"data": "value"}');
    });

    it('should parse cleaned response as valid JSON', () => {
      const rawResponse = '```json\n{"insight": "The morning carried a sense of calm."}\n```';

      const result = parseInsightResponse(rawResponse, 'daily');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.insight).toBe('The morning carried a sense of calm.');
    });

    it('should handle plain text monthly insights', () => {
      const rawResponse = 'The month unfolded with steady rhythms and occasional peaks.';

      const result = parseInsightResponse(rawResponse, 'monthly');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.insight).toBe(rawResponse);
    });
  });

  /**
   * Test 5: Capture-Derived Mood Flow
   * Verifies that generateFallbackMoodFlow produces valid segments from captures
   */
  describe('Capture-Derived Mood Flow', () => {
    /**
     * Helper to convert mock Capture to CaptureData format
     */
    function toCaptureData(captures: ReturnType<typeof createMoodFlowCaptures>): CaptureData[] {
      return captures.map(c => ({
        mood: c.mood_name_snapshot,
        note: c.note || undefined,
        capturedAt: c.created_at,
        tags: c.tags,
      }));
    }

    it('should generate 3 segments from 3 captures with distinct moods', () => {
      // Arrange: Get 3 captures with different moods
      const captures = createMoodFlowCaptures();
      const captureData = toCaptureData(captures);

      // Act: Generate fallback mood flow
      const moodFlow = generateFallbackMoodFlow(captureData);

      // Assert: Should have 3 segments (one per unique mood)
      expect(moodFlow).toHaveLength(3);
    });

    it('should produce segments with valid mood, color, and percentage fields', () => {
      const captures = createMoodFlowCaptures();
      const captureData = toCaptureData(captures);

      const moodFlow = generateFallbackMoodFlow(captureData);

      // Each segment should have required fields
      moodFlow.forEach((segment, i) => {
        expect(segment.mood).toBeDefined();
        expect(typeof segment.mood).toBe('string');
        expect(segment.mood.length).toBeGreaterThan(0);

        expect(segment.color).toBeDefined();
        expect(segment.color).toMatch(/^#[0-9A-Fa-f]{6}$/);

        expect(segment.percentage).toBeDefined();
        expect(typeof segment.percentage).toBe('number');
        expect(segment.percentage).toBeGreaterThan(0);
      });
    });

    it('should produce percentages that sum to 100', () => {
      const captures = createMoodFlowCaptures();
      const captureData = toCaptureData(captures);

      const moodFlow = generateFallbackMoodFlow(captureData);

      const totalPercentage = moodFlow.reduce((sum, s) => sum + s.percentage, 0);

      // Allow ±1 tolerance for rounding
      expect(Math.abs(totalPercentage - 100)).toBeLessThanOrEqual(1);
    });

    it('should pass validateMoodFlowSegments validation', () => {
      const captures = createMoodFlowCaptures();
      const captureData = toCaptureData(captures);

      const moodFlow = generateFallbackMoodFlow(captureData);
      const validation = validateMoodFlowSegments(moodFlow);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should return empty array for empty captures', () => {
      const moodFlow = generateFallbackMoodFlow([]);

      expect(moodFlow).toHaveLength(0);
    });
  });
});


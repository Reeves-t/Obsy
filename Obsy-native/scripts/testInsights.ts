/**
 * Dev Harness Script for Manual Insight Testing
 * 
 * Run with: npx ts-node scripts/testInsights.ts
 * 
 * This script provides interactive test scenarios for validating
 * insight generation without requiring actual AI calls.
 */

import {
  createOutOfOrderCaptures,
  createWeeklyCaptures,
  createMoodFlowCaptures,
} from '../__tests__/fixtures/mockCaptures';
import { getCapturesForDaily, getCapturesForWeek, getCapturesForMonth } from '../lib/insightTime';
import { parseInsightResponse, validateMoodFlowSegments, stripMarkdownFences } from '../lib/insightValidator';

// ANSI color codes for console output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function logPass(message: string) {
  console.log(`${GREEN}✓${RESET} ${message}`);
}

function logFail(message: string) {
  console.log(`${RED}✗${RESET} ${message}`);
}

function logInfo(message: string) {
  console.log(`${CYAN}ℹ${RESET} ${message}`);
}

/**
 * Test 1: Daily Insight - Chronological Ordering
 */
function testDailyOrdering() {
  console.log('\n' + '═'.repeat(60));
  console.log(`${YELLOW}TEST 1: Daily Insight - Chronological Ordering${RESET}`);
  console.log('═'.repeat(60));

  const captures = createOutOfOrderCaptures();
  const targetDate = new Date('2025-02-04T10:00:00Z');

  logInfo(`Input: ${captures.length} captures with out-of-order timestamps`);
  captures.forEach((c, i) => {
    console.log(`  [${i}] ${c.id}: ${c.created_at} (${c.mood_name_snapshot})`);
  });

  const sorted = getCapturesForDaily(targetDate, captures);

  console.log('\nOutput (sorted):');
  sorted.forEach((c, i) => {
    console.log(`  [${i}] ${c.id}: ${c.created_at} (${c.mood_name_snapshot})`);
  });

  // Validate
  if (sorted.length === 2) {
    const first = new Date(sorted[0].created_at).getTime();
    const second = new Date(sorted[1].created_at).getTime();
    if (first < second) {
      logPass('Captures sorted chronologically (first < second)');
    } else {
      logFail('Captures NOT in chronological order');
    }
  } else {
    logFail(`Expected 2 captures, got ${sorted.length}`);
  }
}

/**
 * Test 2: Weekly Insight - Multi-Day Coverage
 */
function testWeeklyCoverage() {
  console.log('\n' + '═'.repeat(60));
  console.log(`${YELLOW}TEST 2: Weekly Insight - Multi-Day Coverage${RESET}`);
  console.log('═'.repeat(60));

  const captures = createWeeklyCaptures();
  const weekStart = new Date('2025-02-02T00:00:00Z');

  logInfo(`Input: ${captures.length} captures spanning 4 days`);

  const filtered = getCapturesForWeek(weekStart, captures);

  // Group by date
  const byDate: Record<string, number> = {};
  filtered.forEach(c => {
    const date = c.created_at.split('T')[0];
    byDate[date] = (byDate[date] || 0) + 1;
  });

  console.log('\nOutput (grouped by date):');
  Object.entries(byDate).sort().forEach(([date, count]) => {
    console.log(`  ${date}: ${count} capture(s)`);
  });

  const uniqueDays = Object.keys(byDate).length;
  if (uniqueDays >= 4) {
    logPass(`Covers ${uniqueDays} unique days`);
  } else {
    logFail(`Expected 4+ days, got ${uniqueDays}`);
  }

  // Check chronological order
  let isOrdered = true;
  for (let i = 1; i < filtered.length; i++) {
    if (new Date(filtered[i - 1].created_at) > new Date(filtered[i].created_at)) {
      isOrdered = false;
      break;
    }
  }
  if (isOrdered) {
    logPass('Captures sorted chronologically across all days');
  } else {
    logFail('Captures NOT in chronological order');
  }
}

/**
 * Test 3: Mood Flow - Segment Validation
 */
function testMoodFlowValidation() {
  console.log('\n' + '═'.repeat(60));
  console.log(`${YELLOW}TEST 3: Mood Flow - Segment Validation${RESET}`);
  console.log('═'.repeat(60));

  const mockMoodFlow = [
    { mood: 'quiet contentment', percentage: 40, color: '#7CB9E8' },
    { mood: 'restless energy', percentage: 35, color: '#E57373' },
    { mood: 'gentle calm', percentage: 25, color: '#81C784' },
  ];

  logInfo(`Input: ${mockMoodFlow.length} mood segments`);
  mockMoodFlow.forEach((s, i) => {
    console.log(`  [${i}] ${s.mood}: ${s.percentage}% (${s.color})`);
  });

  const result = validateMoodFlowSegments(mockMoodFlow);

  console.log('\nValidation Result:');
  if (result.valid) {
    logPass('All segments valid');
    logPass('Percentages sum to 100');
    logPass('Colors are valid hex format');
  } else {
    logFail('Validation failed');
    result.errors.forEach(e => console.log(`  ${RED}•${RESET} ${e}`));
  }
}

/**
 * Test 4: Parsing - Markdown Fence Stripping
 */
function testMarkdownParsing() {
  console.log('\n' + '═'.repeat(60));
  console.log(`${YELLOW}TEST 4: Parsing - Markdown Fence Stripping${RESET}`);
  console.log('═'.repeat(60));

  const rawResponse = '```json\n{"insight": "The morning carried calm."}\n```';

  logInfo('Input (raw AI response):');
  console.log(`  ${rawResponse.replace(/\n/g, '\\n')}`);

  const cleaned = stripMarkdownFences(rawResponse);
  console.log('\nOutput (cleaned):');
  console.log(`  ${cleaned}`);

  if (!cleaned.includes('```') && !cleaned.includes('json')) {
    logPass('Markdown fences removed');
  } else {
    logFail('Markdown fences still present');
  }

  const parsed = parseInsightResponse(rawResponse, 'daily');
  if (parsed.success) {
    logPass('JSON parsed successfully');
    console.log(`  Data: ${JSON.stringify(parsed.data)}`);
  } else {
    logFail(`Parse failed: ${parsed.error}`);
  }
}

/**
 * Main execution
 */
export function runAllTests() {
  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(15) + 'INSIGHT REGRESSION TESTS' + ' '.repeat(19) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  testDailyOrdering();
  testWeeklyCoverage();
  testMoodFlowValidation();
  testMarkdownParsing();

  console.log('\n' + '═'.repeat(60));
  console.log(`${GREEN}All tests complete!${RESET}`);
  console.log('═'.repeat(60) + '\n');
}

// Run if executed directly
runAllTests();


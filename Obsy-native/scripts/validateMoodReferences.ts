/**
 * Mood Reference Validation Script
 *
 * Validates all entries in the database to ensure mood references are valid
 * and mood_name_snapshot is populated.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=your_key npx ts-node scripts/validateMoodReferences.ts [options]
 *
 * Options:
 *   --fix       Automatically repair issues
 *   --dry-run   Preview changes without applying (use with --fix)
 *   --output    Export report to JSON file
 *
 * Environment Variables:
 *   EXPO_PUBLIC_SUPABASE_URL     - Supabase project URL (required)
 *   SUPABASE_SERVICE_ROLE_KEY    - Service role key for privileged access (required for --fix)
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY - Anon key for read-only validation (fallback if no service key)
 *
 * SECURITY NOTE: The service role key bypasses RLS and should NEVER be exposed
 * in client-side code. This script is intended for server-side/CLI use only.
 */

import { createClient } from '@supabase/supabase-js';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

const log = {
    info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
    success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
    warning: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
    error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
};

// Parse command line arguments
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const isDryRun = args.includes('--dry-run');
const outputIndex = args.indexOf('--output');
const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : null;

// Initialize Supabase client with appropriate key
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
    log.error('Missing EXPO_PUBLIC_SUPABASE_URL environment variable');
    process.exit(1);
}

// For --fix operations, require service role key to bypass RLS
if (shouldFix && !isDryRun) {
    if (!serviceRoleKey) {
        log.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
        log.error('The service role key is required for --fix operations to bypass RLS.');
        log.error('Set it via: SUPABASE_SERVICE_ROLE_KEY=your_key npx ts-node scripts/validateMoodReferences.ts --fix');
        process.exit(1);
    }
    log.warning('Using service role key for privileged database access');
}

// Use service role key if available, otherwise fall back to anon key for read-only validation
const supabaseKey = serviceRoleKey || anonKey;

if (!supabaseKey) {
    log.error('Missing Supabase key. Provide either SUPABASE_SERVICE_ROLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface ValidationReport {
    totalEntries: number;
    validEntries: number;
    invalidMoodReferences: number;
    missingSnapshots: number;
    systemMoodEntries: number;
    customMoodEntries: number;
    orphanedEntries: { id: string; mood: string; snapshot: string | null }[];
    fixedEntries: number;
}

async function validateMoodReferences(): Promise<ValidationReport> {
    log.info('Starting mood reference validation...\n');

    // Fetch all moods
    const { data: moods, error: moodsError } = await supabase
        .from('moods')
        .select('id, name, type')
        .is('deleted_at', null);

    if (moodsError) {
        log.error(`Failed to fetch moods: ${moodsError.message}`);
        process.exit(1);
    }

    const moodMap = new Map(moods?.map(m => [m.id, m]) || []);
    log.info(`Loaded ${moodMap.size} moods from database`);

    // Fetch all entries
    const { data: entries, error: entriesError } = await supabase
        .from('entries')
        .select('id, mood, mood_name_snapshot, user_id');

    if (entriesError) {
        log.error(`Failed to fetch entries: ${entriesError.message}`);
        process.exit(1);
    }

    const report: ValidationReport = {
        totalEntries: entries?.length || 0,
        validEntries: 0,
        invalidMoodReferences: 0,
        missingSnapshots: 0,
        systemMoodEntries: 0,
        customMoodEntries: 0,
        orphanedEntries: [],
        fixedEntries: 0,
    };

    log.info(`Validating ${report.totalEntries} entries...\n`);

    const entriesToFix: { id: string; mood_name_snapshot: string }[] = [];

    for (const entry of entries || []) {
        const mood = moodMap.get(entry.mood);
        const hasValidMood = !!mood;
        const hasSnapshot = !!entry.mood_name_snapshot;

        if (hasValidMood) {
            report.validEntries++;
            if (mood.type === 'system') {
                report.systemMoodEntries++;
            } else {
                report.customMoodEntries++;
            }
        } else if (entry.mood) {
            report.invalidMoodReferences++;
            report.orphanedEntries.push({
                id: entry.id,
                mood: entry.mood,
                snapshot: entry.mood_name_snapshot,
            });
        }

        if (!hasSnapshot) {
            report.missingSnapshots++;
            if (shouldFix) {
                const snapshotValue = mood?.name || 
                    (entry.mood?.startsWith('custom_') ? 'Custom Mood' : 
                    entry.mood ? entry.mood.charAt(0).toUpperCase() + entry.mood.slice(1) : 'Neutral');
                entriesToFix.push({ id: entry.id, mood_name_snapshot: snapshotValue });
            }
        }
    }

    // Apply fixes if requested
    if (shouldFix && entriesToFix.length > 0) {
        if (isDryRun) {
            log.warning(`[DRY RUN] Would fix ${entriesToFix.length} entries`);
            report.fixedEntries = entriesToFix.length;
        } else {
            for (const fix of entriesToFix) {
                const { error } = await supabase
                    .from('entries')
                    .update({ mood_name_snapshot: fix.mood_name_snapshot })
                    .eq('id', fix.id);
                if (!error) report.fixedEntries++;
            }
            log.success(`Fixed ${report.fixedEntries} entries`);
        }
    }

    return report;
}

function printReport(report: ValidationReport): void {
    console.log('\n' + '='.repeat(50));
    console.log('           VALIDATION REPORT');
    console.log('='.repeat(50) + '\n');

    console.log(`Total Entries:          ${report.totalEntries}`);
    console.log(`Valid Entries:          ${colors.green}${report.validEntries}${colors.reset}`);
    console.log(`  - System Moods:       ${report.systemMoodEntries}`);
    console.log(`  - Custom Moods:       ${report.customMoodEntries}`);
    console.log(`Invalid References:     ${report.invalidMoodReferences > 0 ? colors.red : colors.green}${report.invalidMoodReferences}${colors.reset}`);
    console.log(`Missing Snapshots:      ${report.missingSnapshots > 0 ? colors.yellow : colors.green}${report.missingSnapshots}${colors.reset}`);
    if (shouldFix) {
        console.log(`Fixed Entries:          ${colors.cyan}${report.fixedEntries}${colors.reset}`);
    }

    if (report.orphanedEntries.length > 0 && report.orphanedEntries.length <= 10) {
        console.log('\nOrphaned Entries:');
        report.orphanedEntries.forEach(e => {
            console.log(`  - ${e.id}: mood="${e.mood}", snapshot="${e.snapshot || 'NULL'}"`);
        });
    }

    console.log('\n' + '='.repeat(50));
    const isValid = report.invalidMoodReferences === 0 && report.missingSnapshots === 0;
    if (isValid) {
        log.success('All entries are valid!');
    } else {
        log.warning('Issues found. Run with --fix to repair.');
    }
}

async function main(): Promise<void> {
    const report = await validateMoodReferences();
    printReport(report);

    if (outputFile) {
        const fs = await import('fs');
        fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
        log.info(`Report exported to ${outputFile}`);
    }

    const hasIssues = report.invalidMoodReferences > 0 || report.missingSnapshots > 0;
    process.exit(hasIssues && !shouldFix ? 1 : 0);
}

main().catch(err => {
    log.error(`Validation failed: ${err.message}`);
    process.exit(1);
});


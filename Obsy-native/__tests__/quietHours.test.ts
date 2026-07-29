import {
    isWithinQuietHours,
    parseTimeToMinutes,
    minutesSinceMidnightInZone,
// No .ts extension: Deno requires it in the module's own imports, but tsc
// rejects it here unless allowImportingTsExtensions is on. Jest resolves the
// extensionless path via moduleFileExtensions.
} from '../../supabase/functions/_shared/push/index';

/**
 * Quiet hours decide whether a notification reaches someone at 3am, so the
 * midnight-wrapping case is the one that matters. A naive range check treats
 * 22:00–08:00 as an empty window and leaves the small hours unprotected.
 */

describe('isWithinQuietHours', () => {
    const START = 22 * 60; // 22:00
    const END = 8 * 60;    // 08:00

    describe('window wrapping midnight (the default 22:00 → 08:00)', () => {
        it('suppresses late evening', () => {
            expect(isWithinQuietHours(23 * 60, START, END)).toBe(true);
        });

        it('suppresses the small hours', () => {
            expect(isWithinQuietHours(3 * 60, START, END)).toBe(true);
            expect(isWithinQuietHours(0, START, END)).toBe(true);
        });

        it('allows the middle of the day', () => {
            expect(isWithinQuietHours(12 * 60, START, END)).toBe(false);
            expect(isWithinQuietHours(20 * 60, START, END)).toBe(false);
        });

        it('treats the start boundary as quiet and the end boundary as awake', () => {
            expect(isWithinQuietHours(START, START, END)).toBe(true);
            expect(isWithinQuietHours(END, START, END)).toBe(false);
        });
    });

    describe('window inside one day (01:00 → 06:00)', () => {
        const s = 60;
        const e = 6 * 60;

        it('suppresses inside the window', () => {
            expect(isWithinQuietHours(3 * 60, s, e)).toBe(true);
        });

        it('allows outside the window on both sides', () => {
            expect(isWithinQuietHours(30, s, e)).toBe(false);
            expect(isWithinQuietHours(7 * 60, s, e)).toBe(false);
        });
    });

    it('treats a zero-length window as never quiet', () => {
        expect(isWithinQuietHours(0, 600, 600)).toBe(false);
        expect(isWithinQuietHours(600, 600, 600)).toBe(false);
    });
});

describe('parseTimeToMinutes', () => {
    it('parses HH:MM', () => {
        expect(parseTimeToMinutes('22:00', 0)).toBe(1320);
        expect(parseTimeToMinutes('08:30', 0)).toBe(510);
    });

    it('parses the HH:MM:SS that Postgres time columns return', () => {
        expect(parseTimeToMinutes('08:30:00', 0)).toBe(510);
    });

    it('falls back when the value is missing or unparseable', () => {
        expect(parseTimeToMinutes(null, 480)).toBe(480);
        expect(parseTimeToMinutes('not-a-time', 480)).toBe(480);
    });
});

describe('minutesSinceMidnightInZone', () => {
    it('reads the clock in the requested zone, not the server zone', () => {
        const noonUtc = new Date('2026-07-28T12:00:00Z');
        expect(minutesSinceMidnightInZone(noonUtc, 'UTC')).toBe(720);
        // July: New York is UTC-4, so 12:00Z is 08:00 local.
        expect(minutesSinceMidnightInZone(noonUtc, 'America/New_York')).toBe(480);
    });

    it('normalizes midnight to 0 rather than 1440', () => {
        const midnightUtc = new Date('2026-07-28T00:00:00Z');
        expect(minutesSinceMidnightInZone(midnightUtc, 'UTC')).toBe(0);
    });

    it('falls back to UTC when the zone is unknown or null', () => {
        const noonUtc = new Date('2026-07-28T12:00:00Z');
        expect(minutesSinceMidnightInZone(noonUtc, null)).toBe(720);
        expect(minutesSinceMidnightInZone(noonUtc, 'Not/AZone')).toBe(720);
    });

    it('puts a user in their own small hours while it is daytime in UTC', () => {
        // 09:00Z is 02:00 in Los Angeles (UTC-7 in July) — inside quiet hours
        // for them, wide awake for a UTC-based scheduler.
        const morningUtc = new Date('2026-07-28T09:00:00Z');
        const local = minutesSinceMidnightInZone(morningUtc, 'America/Los_Angeles');
        expect(local).toBe(120);
        expect(isWithinQuietHours(local, 22 * 60, 8 * 60)).toBe(true);
    });
});

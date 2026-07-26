import {
    detectPlatform,
    platformAspect,
    aspectRatioValue,
    platformToGradient,
    extractUrlFromSharePayload,
    isValidShareUrl,
} from '@/services/sharedLinkService';
import { isPendingSharedLink, withMood } from '@/types/capture';
import type { Capture } from '@/types/capture';

function makeCapture(overrides: Partial<Capture> = {}): Capture {
    return {
        id: 'c1',
        user_id: 'u1',
        created_at: new Date().toISOString(),
        mood_id: 'calm',
        mood_name_snapshot: 'Calm',
        note: null,
        image_url: '',
        tags: [],
        includeInInsights: true,
        usePhotoForInsight: false,
        ...overrides,
    };
}

describe('platformAspect', () => {
    it('frames TikTok as portrait', () => {
        expect(platformAspect('TikTok')).toBe('portrait');
    });

    it('frames a normal YouTube video as landscape but a Short as portrait', () => {
        expect(platformAspect('YouTube', 'video', 'https://youtube.com/watch?v=abc')).toBe('landscape');
        expect(platformAspect('YouTube', 'video', 'https://youtube.com/shorts/abc')).toBe('portrait');
    });

    it('frames an Instagram reel as portrait and a normal post as square', () => {
        expect(platformAspect('Instagram', 'social', 'https://instagram.com/reel/abc/')).toBe('portrait');
        expect(platformAspect('Instagram', 'social', 'https://instagram.com/p/abc/')).toBe('square');
    });

    it('frames music by media type even on an unknown platform', () => {
        expect(platformAspect('Web', 'music')).toBe('square');
        expect(platformAspect('Spotify')).toBe('square');
    });

    it('maps each aspect to a usable ratio', () => {
        expect(aspectRatioValue('square')).toBe(1);
        expect(aspectRatioValue('landscape')).toBeGreaterThan(1);
        expect(aspectRatioValue('portrait')).toBeLessThan(1);
    });
});

describe('platformToGradient', () => {
    it('returns two distinct stops for a known platform', () => {
        const [from, to] = platformToGradient('TikTok');
        expect(from).toMatch(/^#/);
        expect(to).toMatch(/^#/);
        expect(from).not.toBe(to);
    });

    it('falls back to a neutral pair for unknown platforms', () => {
        expect(platformToGradient('Web')).toHaveLength(2);
    });
});

describe('share payload parsing', () => {
    it('pulls the URL out of a "title - url" payload', () => {
        expect(extractUrlFromSharePayload('Check this out - https://tiktok.com/@a/video/1'))
            .toBe('https://tiktok.com/@a/video/1');
    });

    it('returns null when there is no link to save', () => {
        expect(extractUrlFromSharePayload('just some text')).toBeNull();
    });

    it('rejects non-http schemes', () => {
        expect(isValidShareUrl('javascript:alert(1)')).toBe(false);
        expect(isValidShareUrl('https://example.com')).toBe(true);
    });

    it('detects x.com as the Twitter platform', () => {
        expect(detectPlatform('https://x.com/jack/status/20')).toBe('Twitter');
    });
});

describe('inbox queue', () => {
    it('queues a shared link that has not been processed', () => {
        expect(isPendingSharedLink(makeCapture({
            source_type: 'shared_link',
            shared_link_processed_at: null,
        }))).toBe(true);
    });

    it('removes a link from the queue once it is processed', () => {
        expect(isPendingSharedLink(makeCapture({
            source_type: 'shared_link',
            shared_link_processed_at: new Date().toISOString(),
        }))).toBe(false);
    });

    it('keeps a moodless-but-kept link out of the queue', () => {
        // "Keep" is a real decision. Deriving the queue from mood instead of
        // from processed_at would strand every kept link in it forever.
        const kept = makeCapture({
            source_type: 'shared_link',
            mood_id: null,
            shared_link_processed_at: new Date().toISOString(),
        });
        expect(isPendingSharedLink(kept)).toBe(false);
        expect(withMood([kept])).toHaveLength(0);
    });

    it('does not queue entries that are not shared links', () => {
        expect(isPendingSharedLink(makeCapture({ source_type: 'journal' }))).toBe(false);
    });

    it('keeps moodless entries out of mood aggregation', () => {
        const captures = [
            makeCapture({ id: 'a', mood_id: 'calm' }),
            makeCapture({ id: 'b', source_type: 'shared_link', mood_id: null }),
        ];
        expect(withMood(captures).map(c => c.id)).toEqual(['a']);
    });

    it('excludes a moodless entry even though its snapshot reads Neutral', () => {
        // The database trigger backfills the snapshot, so the snapshot alone
        // must never be treated as evidence that a mood was chosen.
        const phantom = makeCapture({
            source_type: 'shared_link',
            mood_id: null,
            mood_name_snapshot: 'Neutral',
        });
        expect(withMood([phantom])).toHaveLength(0);
    });
});

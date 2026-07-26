/**
 * Jest setup — stand-ins for native modules the test environment has no access to.
 *
 * These tests run on plain Node, so anything that reaches for a native module at
 * import time fails on load rather than on use. That matters more than it
 * sounds: `lib/supabase.ts` is imported transitively by most of the insight
 * code, so a single unmocked native dependency takes out whole suites that
 * never meant to touch storage at all.
 */

// AsyncStorage's real implementation throws on import without the linked
// native module. The package ships its own in-memory mock for exactly this.
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// `lib/supabase.ts` builds its client at module scope, so importing anything
// downstream of it throws "supabaseUrl is required" without these. Deliberately
// obvious placeholders: no test should ever reach the network, and a real
// project URL sitting here would be an invitation to do so by accident.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key-not-a-real-credential';

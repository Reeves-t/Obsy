import { supabase } from './supabase';
import { CustomAiToneRow, CustomAiToneInsert, CustomAiToneUpdate } from '@/types/supabase.types';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CustomTone extends CustomAiToneRow { }

const GUEST_TONES_KEY = 'obsy_guest_custom_tones';

/**
 * Validation rules for custom tone prompts
 */
export const CUSTOM_TONE_RULES = {
    MAX_NAME_LENGTH: 50,
    MAX_PROMPT_LENGTH: 250,
    BANNED_PHRASES: ['act as', 'pretend', 'you are', 'roleplay', 'impersonate', 'system prompt'],
    MARKDOWN_CHARS: ['*', '_', '#', '[', ']', '`'],
    EMOJI_REGEX: /[\u{1F300}-\u{1F9FF}]/u,
};

/**
 * Validates a custom tone prompt and name
 */
export function validateCustomTone(name: string, prompt: string): { valid: boolean; error?: string } {
    if (!name.trim()) return { valid: false, error: 'Name is required' };
    if (name.length > CUSTOM_TONE_RULES.MAX_NAME_LENGTH) return { valid: false, error: `Name must be ${CUSTOM_TONE_RULES.MAX_NAME_LENGTH} characters or less` };

    if (!prompt.trim()) return { valid: false, error: 'Description is required' };
    if (prompt.length > CUSTOM_TONE_RULES.MAX_PROMPT_LENGTH) return { valid: false, error: `Description must be ${CUSTOM_TONE_RULES.MAX_PROMPT_LENGTH} characters or less` };

    // Emoji check
    if (CUSTOM_TONE_RULES.EMOJI_REGEX.test(prompt)) {
        return { valid: false, error: 'Emojis are not allowed in custom tones' };
    }

    // Markdown check
    if (CUSTOM_TONE_RULES.MARKDOWN_CHARS.some(char => prompt.includes(char))) {
        return { valid: false, error: 'Markdown symbols (*, _, #, etc.) are not allowed' };
    }

    // Roleplay check
    const lowerPrompt = prompt.toLowerCase();
    if (CUSTOM_TONE_RULES.BANNED_PHRASES.some(phrase => lowerPrompt.includes(phrase))) {
        return { valid: false, error: 'Style-only descriptions please. Avoid "act as" or "pretend".' };
    }

    return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Guest tone storage (AsyncStorage)
// ─────────────────────────────────────────────────────────────────────────────

function generateLocalId(): string {
    // Simple local UUID without crypto dependency
    return 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

async function getGuestTones(): Promise<CustomTone[]> {
    try {
        const raw = await AsyncStorage.getItem(GUEST_TONES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

async function saveGuestTones(tones: CustomTone[]): Promise<void> {
    await AsyncStorage.setItem(GUEST_TONES_KEY, JSON.stringify(tones));
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD operations for Custom Tones
// ─────────────────────────────────────────────────────────────────────────────

export async function getCustomTones(): Promise<CustomTone[]> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return getGuestTones();
    }

    const { data, error } = await supabase
        .from('custom_ai_tones')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching custom tones:', error);
        return [];
    }
    return data || [];
}

export async function getCustomToneById(id: string): Promise<CustomTone | null> {
    // Check Supabase first for authenticated users
    const { data, error } = await supabase
        .from('custom_ai_tones')
        .select('*')
        .eq('id', id)
        .single();

    if (!error && data) return data;

    // Fallback: check guest tones in AsyncStorage
    const guestTones = await getGuestTones();
    return guestTones.find(t => t.id === id) || null;
}

export async function createCustomTone(name: string, prompt: string): Promise<CustomTone | null> {
    const validation = validateCustomTone(name, prompt);
    if (!validation.valid) throw new Error(validation.error);

    const { data: { user } } = await supabase.auth.getUser();

    // Guest path: store in AsyncStorage
    if (!user) {
        const now = new Date().toISOString();
        const guestTone: CustomTone = {
            id: generateLocalId(),
            user_id: 'guest',
            name: name.trim(),
            prompt: prompt.trim(),
            created_at: now,
            updated_at: now,
        } as CustomTone;

        const tones = await getGuestTones();
        tones.unshift(guestTone);
        await saveGuestTones(tones);
        return guestTone;
    }

    // Authenticated path: store in Supabase
    const { data, error } = await supabase
        .from('custom_ai_tones')
        .insert({
            user_id: user.id,
            name: name.trim(),
            prompt: prompt.trim(),
        } as CustomAiToneInsert)
        .select()
        .single();

    if (error) {
        console.error('Error creating custom tone:', error);
        throw error;
    }
    return data;
}

export async function updateCustomTone(id: string, updates: Partial<CustomAiToneUpdate>): Promise<CustomTone | null> {
    if (updates.name || updates.prompt) {
        // Fetch current to validate combined
        const { data: current } = await supabase.from('custom_ai_tones').select('*').eq('id', id).single();
        if (current) {
            const validation = validateCustomTone(updates.name || current.name, updates.prompt || current.prompt);
            if (!validation.valid) throw new Error(validation.error);
        }
    }

    const { data, error } = await supabase
        .from('custom_ai_tones')
        .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating custom tone:', error);
        throw error;
    }
    return data;
}

export async function deleteCustomTone(id: string): Promise<void> {
    const { error } = await supabase
        .from('custom_ai_tones')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting custom tone:', error);
        throw error;
    }
}

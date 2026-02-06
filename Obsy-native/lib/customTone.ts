import { supabase } from './supabase';
import { CustomAiToneRow, CustomAiToneInsert, CustomAiToneUpdate } from '@/types/supabase.types';

export interface CustomTone extends CustomAiToneRow { }

/**
 * Validation rules for custom tone prompts
 */
export const CUSTOM_TONE_RULES = {
    MAX_NAME_LENGTH: 50,
    MAX_PROMPT_LENGTH: 250,
    BANNED_PHRASES: [
        'act as', 'pretend', 'you are', 'roleplay', 'impersonate', 'system prompt',
        'like a', 'as a', 'from the perspective of'  // Often precede character names
    ],
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

/**
 * CRUD operations for Custom Tones
 */

export async function getCustomTones(): Promise<CustomTone[]> {
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
    const { data, error } = await supabase
        .from('custom_ai_tones')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching custom tone by ID:', error);
        return null;
    }
    return data;
}

export async function createCustomTone(name: string, prompt: string): Promise<CustomTone | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const validation = validateCustomTone(name, prompt);
    if (!validation.valid) throw new Error(validation.error);

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

import { useState, useEffect, useCallback } from 'react';
import { CustomTone, getCustomTones, createCustomTone, updateCustomTone, deleteCustomTone } from '@/lib/customTone';

export function useCustomTones() {
    const [tones, setTones] = useState<CustomTone[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadTones = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getCustomTones();
            setTones(data);
            setError(null);
        } catch (e: any) {
            setError(e.message || 'Failed to load custom tones');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTones();
    }, [loadTones]);

    const addTone = async (name: string, prompt: string) => {
        try {
            const newTone = await createCustomTone(name, prompt);
            if (newTone) {
                setTones(prev => [newTone, ...prev]);
            }
            return newTone;
        } catch (e: any) {
            throw e;
        }
    };

    const editTone = async (id: string, name: string, prompt: string) => {
        try {
            const updated = await updateCustomTone(id, { name, prompt });
            if (updated) {
                setTones(prev => prev.map(t => t.id === id ? updated : t));
            }
            return updated;
        } catch (e: any) {
            throw e;
        }
    };

    const removeTone = async (id: string) => {
        try {
            await deleteCustomTone(id);
            setTones(prev => prev.filter(t => t.id !== id));
        } catch (e: any) {
            throw e;
        }
    };

    return {
        tones,
        isLoading,
        error,
        refreshTones: loadTones,
        addTone,
        editTone,
        removeTone
    };
}

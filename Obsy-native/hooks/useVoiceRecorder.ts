import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const MAX_DURATION_SECONDS = 180;

export type RecorderStatus = 'idle' | 'recording' | 'processing' | 'ready' | 'error';

export interface VoiceRecorderResult {
    localUri: string;
    /** Storage path in the private voice-notes bucket (re-signed for playback). */
    storagePath: string | null;
    transcript: string;
    durationSec: number;
}

/**
 * Inline voice recording for the home composer. Recording, upload, and
 * transcription logic adapted from app/voice/index.tsx (that screen is
 * untouched); no metering/waveform — the composer only shows a duration chip.
 */
export function useVoiceRecorder() {
    const { user } = useAuth();
    const [status, setStatus] = useState<RecorderStatus>('idle');
    const [elapsed, setElapsed] = useState(0);
    const [result, setResult] = useState<VoiceRecorderResult | null>(null);
    const [transcriptError, setTranscriptError] = useState(false);

    const recordingRef = useRef<Audio.Recording | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const elapsedRef = useRef(0);
    const cancelledRef = useRef(false);

    const clearTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    useEffect(() => {
        return () => {
            clearTimer();
            recordingRef.current?.stopAndUnloadAsync().catch(() => {});
        };
    }, []);

    const reset = useCallback(() => {
        clearTimer();
        recordingRef.current?.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
        elapsedRef.current = 0;
        setElapsed(0);
        setResult(null);
        setTranscriptError(false);
        setStatus('idle');
    }, []);

    const processRecording = useCallback(
        async (uri: string, durationSec: number) => {
            setStatus('processing');
            let storagePath: string | null = null;
            let transcript = '';
            let failedTranscript = false;

            try {
                const fileName = `${Date.now()}.m4a`;
                const path = `${user?.id ?? 'guest'}/${fileName}`;

                const base64 = await FileSystem.readAsStringAsync(uri, {
                    encoding: FileSystem.EncodingType.Base64,
                });

                const { error: uploadError } = await supabase.storage
                    .from('voice-notes')
                    .upload(path, decode(base64), {
                        contentType: 'audio/m4a',
                        upsert: false,
                    });

                if (uploadError) throw uploadError;
                storagePath = path;

                try {
                    // Owned storage path; the edge function verifies ownership and
                    // downloads the object server-side.
                    const { data, error } = await supabase.functions.invoke('transcribe-voice-note', {
                        body: { storagePath: path, language: 'en' },
                    });
                    if (error) throw error;
                    transcript = data?.transcript ?? '';
                } catch (transcribeError) {
                    console.error('[useVoiceRecorder] Transcription failed:', transcribeError);
                    failedTranscript = true;
                }
            } catch (error) {
                console.error('[useVoiceRecorder] Upload failed:', error);
                if (!cancelledRef.current) setStatus('error');
                return;
            }

            if (cancelledRef.current) return;
            setTranscriptError(failedTranscript);
            setResult({ localUri: uri, storagePath, transcript, durationSec });
            setStatus('ready');
        },
        [user?.id]
    );

    const stop = useCallback(async () => {
        if (!recordingRef.current) return;

        clearTimer();
        try {
            await recordingRef.current.stopAndUnloadAsync();
            const uri = recordingRef.current.getURI();
            recordingRef.current = null;
            if (!uri) throw new Error('Recording URI is null');

            await processRecording(uri, elapsedRef.current);
        } catch (error) {
            console.error('[useVoiceRecorder] Stop recording error:', error);
            setStatus('error');
        }
    }, [processRecording]);

    const start = useCallback(async () => {
        if (recordingRef.current) return;

        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) {
            Alert.alert(
                'Microphone Access Needed',
                'Obsy needs microphone access to record voice notes. Enable it in Settings.',
                [{ text: 'OK' }]
            );
            return;
        }

        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
        });

        const { recording } = await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
        );

        recordingRef.current = recording;
        cancelledRef.current = false;
        elapsedRef.current = 0;
        setElapsed(0);
        setResult(null);
        setTranscriptError(false);
        setStatus('recording');

        timerRef.current = setInterval(() => {
            elapsedRef.current += 1;
            setElapsed(elapsedRef.current);
            if (elapsedRef.current >= MAX_DURATION_SECONDS) {
                stop();
            }
        }, 1000);
    }, [stop]);

    const cancel = useCallback(() => {
        cancelledRef.current = true;
        reset();
    }, [reset]);

    return { status, elapsed, result, transcriptError, start, stop, cancel, reset };
}

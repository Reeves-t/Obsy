import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { UnpackLoader } from '@/components/unpack/UnpackLoader';
import { useUnpackStore, selectQuestionAnswers } from '@/lib/unpackStore';
import {
    generateUnpackQuestions,
    generateUnpackReflection,
    requestLinkPreview,
} from '@/services/unpackClient';
import { optimizeCapture } from '@/services/imageOptimizer';

const GENERAL_PHRASES = ['Holding the moment...', 'Finding the signal...', 'Preparing your questions...'];
const LINK_PHRASES = ['Reading the link...', 'Pulling out the signal...', 'Connecting it to your mood...'];
const VOICE_PHRASES = ['Listening back...', 'Catching the main thought...', 'Preparing your questions...'];
const PHOTO_PHRASES = ['Looking at the moment...', 'Reading the attached context...', 'Preparing your questions...'];
const REFLECTION_PHRASES = ['Shaping your reflection...', 'Keeping your voice intact...', 'Almost ready...'];

export default function UnpackLoadingScreen() {
    const router = useRouter();
    const status = useUnpackStore((s) => s.status);
    const contextType = useUnpackStore((s) => s.context?.type);
    const startedRef = useRef(false);

    // Pick the phrase set for the current phase.
    const phrases =
        status === 'generating'
            ? REFLECTION_PHRASES
            : contextType === 'link'
                ? LINK_PHRASES
                : contextType === 'voice'
                    ? VOICE_PHRASES
                    : contextType === 'photo'
                        ? PHOTO_PHRASES
                        : GENERAL_PHRASES;

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        const initialStatus = useUnpackStore.getState().status;
        if (initialStatus === 'generating') {
            void runReflection();
        } else {
            void runEnrichAndQuestions();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function runEnrichAndQuestions() {
        const store = useUnpackStore.getState();
        const ctx = store.context;
        if (!ctx) {
            store.setError('Something went wrong. Please try again.');
            return;
        }

        try {
            // Shared link → digest by URL (no entry saved yet).
            if (ctx.type === 'link' && ctx.sharedLink?.url && !ctx.sharedLink.summary) {
                const res = await requestLinkPreview(
                    ctx.sharedLink.url,
                    ctx.sharedLink.platform,
                    ctx.sharedLink.title,
                );
                if (res.ok) {
                    store.setEnrichedContext({
                        sharedLink: {
                            ...ctx.sharedLink,
                            summary: res.digest ?? ctx.sharedLink.summary ?? null,
                            title: res.title ?? ctx.sharedLink.title ?? null,
                            mediaType: res.mediaType ?? ctx.sharedLink.mediaType ?? null,
                            thumbnailUrl: res.thumbnailUrl ?? ctx.sharedLink.thumbnailUrl ?? null,
                            source: res.source ?? ctx.sharedLink.source ?? null,
                        },
                    });
                }
            }

            // Photo → optimize + base64 for the vision step.
            if (ctx.type === 'photo' && ctx.photoLocalUri && !ctx.imageBase64) {
                try {
                    const optimized = await optimizeCapture(ctx.photoLocalUri);
                    const base64 = await FileSystem.readAsStringAsync(optimized.preview, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                    store.setEnrichedContext({ imageBase64: base64, imageMimeType: 'image/jpeg' });
                } catch {
                    // Degrade: continue with caption + mood only.
                }
            }

            const latest = useUnpackStore.getState();
            const res = await generateUnpackQuestions(latest.context!, {
                id: latest.moodId,
                name: latest.moodName,
            });

            if (!res.ok) {
                useUnpackStore.getState().setError(friendlyError(res.error));
                return;
            }

            const s = useUnpackStore.getState();
            if (res.imageContext) s.setEnrichedContext({ imageContext: res.imageContext });
            if (res.usage) s.setUsage(res.usage);
            s.setQuestions(res.questions);
            router.replace('/unpack/question');
        } catch (e: any) {
            useUnpackStore.getState().setError(e?.message || 'Something went wrong. Please try again.');
        }
    }

    async function runReflection() {
        const store = useUnpackStore.getState();
        const ctx = store.context;
        if (!ctx) {
            store.setError('Something went wrong. Please try again.');
            return;
        }
        try {
            const answers = selectQuestionAnswers(store);
            const res = await generateUnpackReflection(ctx, { id: store.moodId, name: store.moodName }, answers);
            if (!res.ok) {
                useUnpackStore.getState().setError(friendlyError(res.error));
                return;
            }
            const s = useUnpackStore.getState();
            if (res.usage) s.setUsage(res.usage);
            s.setReflection(res.reflection);
            router.replace('/unpack/review');
        } catch (e: any) {
            useUnpackStore.getState().setError(e?.message || 'Something went wrong. Please try again.');
        }
    }

    function retry() {
        startedRef.current = true;
        const st = useUnpackStore.getState();
        // Re-enter the phase we failed in.
        if (st.questions.length === 3) {
            st.setStatus('generating');
            void runReflection();
        } else {
            st.setStatus('enriching');
            void runEnrichAndQuestions();
        }
    }

    function close() {
        useUnpackStore.getState().reset();
        router.dismissAll();
    }

    if (status === 'error') {
        const message = useUnpackStore.getState().error ?? 'Something went wrong.';
        return (
            <View style={styles.errorContainer}>
                <LinearGradient
                    colors={['#050a16', '#071019', '#04121a']}
                    start={{ x: 0.2, y: 0 }}
                    end={{ x: 0.8, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>We hit a snag</Text>
                    <Text style={styles.errorMessage}>{message}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={retry} activeOpacity={0.85}>
                        <Text style={styles.retryText}>Try again</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.closeButton} onPress={close} activeOpacity={0.7}>
                        <Text style={styles.closeText}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return <UnpackLoader phrases={phrases} />;
}

function friendlyError(error?: { stage: string; message: string; status: number }): string {
    if (!error) return 'Something went wrong. Please try again.';
    if (error.status === 403 || error.stage === 'plus_required') {
        return 'Unpack is a Plus feature.';
    }
    if (error.status === 429 || error.stage === 'rate_limit') {
        return "You've reached today's Unpack limit. Try again tomorrow.";
    }
    if (error.stage === 'auth') return 'Please sign in to use Unpack.';
    return 'We couldn’t finish unpacking this moment. Please try again.';
}

const styles = StyleSheet.create({
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 28,
    },
    errorCard: {
        width: '100%',
        maxWidth: 360,
        alignItems: 'center',
    },
    errorTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#EAF6FB',
        marginBottom: 10,
    },
    errorMessage: {
        fontSize: 15,
        lineHeight: 22,
        color: 'rgba(200,220,235,0.7)',
        textAlign: 'center',
        marginBottom: 28,
    },
    retryButton: {
        alignSelf: 'stretch',
        backgroundColor: 'rgba(65,202,236,0.16)',
        borderWidth: 1,
        borderColor: 'rgba(65,202,236,0.5)',
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: 12,
    },
    retryText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#41caec',
    },
    closeButton: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    closeText: {
        fontSize: 14.5,
        color: 'rgba(200,220,235,0.6)',
    },
});

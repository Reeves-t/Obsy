import React, { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useUnpackStore } from '@/lib/unpackStore';

const COBALT = '#41caec';

export default function UnpackQuestionScreen() {
    const router = useRouter();
    const questions = useUnpackStore((s) => s.questions);
    const stepIndex = useUnpackStore((s) => s.stepIndex);
    const answers = useUnpackStore((s) => s.answers);
    const setAnswer = useUnpackStore((s) => s.setAnswer);
    const skipCurrent = useUnpackStore((s) => s.skipCurrent);
    const goNext = useUnpackStore((s) => s.goNext);
    const goBack = useUnpackStore((s) => s.goBack);
    const reset = useUnpackStore((s) => s.reset);

    const [text, setText] = useState('');

    // Sync the field to the stored answer whenever the step changes.
    useEffect(() => {
        setText(answers[stepIndex]?.answer ?? '');
    }, [stepIndex, answers]);

    const total = questions.length || 3;
    const current = questions[stepIndex];
    const isLast = stepIndex >= total - 1;
    const canContinue = text.trim().length > 0;

    const advance = () => {
        const wasLast = useUnpackStore.getState().stepIndex >= (useUnpackStore.getState().questions.length - 1);
        goNext();
        if (wasLast) {
            router.replace('/unpack/loading');
        }
    };

    const handleContinue = () => {
        setAnswer(stepIndex, text.trim());
        advance();
    };

    const handleSkip = () => {
        skipCurrent();
        advance();
    };

    const handleBack = () => {
        if (stepIndex === 0) return;
        goBack();
    };

    const handleClose = () => {
        reset();
        router.dismissAll();
    };

    if (!current) {
        // Defensive: no questions in the store (e.g. hot-reload). Bail out.
        return (
            <View style={styles.container}>
                <LinearGradient colors={['#050a16', '#071019', '#04121a']} style={StyleSheet.absoluteFill} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#050a16', '#071019', '#04121a']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={handleClose} hitSlop={12} style={styles.headerBtn}>
                            <Ionicons name="close" size={24} color="rgba(220,235,245,0.75)" />
                        </TouchableOpacity>
                        <Text style={styles.progress}>{stepIndex + 1} of {total}</Text>
                        <View style={styles.headerBtn} />
                    </View>

                    {/* Progress dots */}
                    <View style={styles.dots}>
                        {Array.from({ length: total }).map((_, i) => (
                            <View
                                key={i}
                                style={[styles.dot, i <= stepIndex && styles.dotActive]}
                            />
                        ))}
                    </View>

                    {/* Question + input */}
                    <Animated.View key={stepIndex} entering={FadeIn.duration(320)} style={styles.body}>
                        <Text style={styles.flowTitle}>Unpack this moment</Text>
                        <Text style={styles.question}>{current.question}</Text>
                        <TextInput
                            value={text}
                            onChangeText={setText}
                            placeholder="Take your time…"
                            placeholderTextColor="rgba(200,220,235,0.35)"
                            multiline
                            autoFocus
                            style={styles.input}
                            selectionColor={COBALT}
                        />
                    </Animated.View>

                    {/* Actions */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            onPress={handleBack}
                            disabled={stepIndex === 0}
                            style={[styles.secondaryBtn, stepIndex === 0 && styles.hidden]}
                        >
                            <Ionicons name="chevron-back" size={18} color="rgba(220,235,245,0.75)" />
                            <Text style={styles.secondaryText}>Back</Text>
                        </TouchableOpacity>

                        <View style={styles.footerRight}>
                            <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
                                <Text style={styles.skipText}>Skip</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleContinue}
                                disabled={!canContinue}
                                style={[styles.continueBtn, !canContinue && styles.continueDisabled]}
                            >
                                <Text style={styles.continueText}>{isLast ? 'Unpack' : 'Continue'}</Text>
                                <Ionicons name="arrow-forward" size={16} color="#04121a" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safe: { flex: 1 },
    flex: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    progress: {
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.6,
        color: 'rgba(200,220,235,0.65)',
    },
    dots: {
        flexDirection: 'row',
        gap: 6,
        justifyContent: 'center',
        marginTop: 4,
        marginBottom: 8,
    },
    dot: {
        width: 22,
        height: 3,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.14)',
    },
    dotActive: { backgroundColor: COBALT },
    body: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 28,
    },
    flowTitle: {
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'rgba(65,202,236,0.8)',
        marginBottom: 16,
    },
    question: {
        fontSize: 24,
        lineHeight: 32,
        fontWeight: '600',
        color: '#EAF6FB',
        marginBottom: 24,
    },
    input: {
        fontSize: 18,
        lineHeight: 26,
        color: '#EAF6FB',
        textAlignVertical: 'top',
        minHeight: 120,
        maxHeight: 260,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    footerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    secondaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 10,
        paddingHorizontal: 8,
    },
    hidden: { opacity: 0 },
    secondaryText: {
        fontSize: 15,
        color: 'rgba(220,235,245,0.75)',
    },
    skipBtn: {
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    skipText: {
        fontSize: 15,
        color: 'rgba(200,220,235,0.6)',
    },
    continueBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: COBALT,
        borderRadius: 14,
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    continueDisabled: { opacity: 0.4 },
    continueText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#04121a',
    },
});

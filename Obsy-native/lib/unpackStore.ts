import { create } from 'zustand';
import type {
    UnpackAnswer,
    UnpackContext,
    UnpackQuestion,
    UnpackReflection,
    UnpackUsage,
} from '@/lib/unpack/types';

/**
 * Transient state machine for the Unpack flow. Deliberately NOT persisted — a
 * draft reflection is never saved until the user confirms on the review screen,
 * so backgrounding the app mid-flow discards the draft by design.
 */

export type UnpackStatus =
    | 'idle'
    | 'enriching' // processing media/link/transcript, then requesting questions
    | 'questioning' // showing the 3 clarifying questions
    | 'generating' // requesting the reflection draft
    | 'review' // reflection ready, awaiting Save/Edit/Discard
    | 'error';

interface UnpackState {
    context: UnpackContext | null;
    moodId: string | null;
    moodName: string;
    status: UnpackStatus;
    questions: UnpackQuestion[];
    stepIndex: number;
    answers: UnpackAnswer[];
    reflection: UnpackReflection | null;
    editedReflection: string | null;
    error: string | null;
    usage: UnpackUsage | null;

    /** Start a fresh flow from the composer. Resets everything. */
    begin: (context: UnpackContext, moodId: string, moodName: string) => void;
    /** Merge enrichment results (link summary, image context, base64, …). */
    setEnrichedContext: (patch: Partial<UnpackContext>) => void;
    setStatus: (status: UnpackStatus) => void;
    setError: (message: string | null) => void;
    /** Store the generated questions and move to the questioning step. */
    setQuestions: (questions: UnpackQuestion[]) => void;
    setAnswer: (index: number, text: string) => void;
    skipCurrent: () => void;
    /** Advance to the next question, or to `generating` after the last one. */
    goNext: () => void;
    goBack: () => void;
    setReflection: (reflection: UnpackReflection) => void;
    setEditedReflection: (text: string | null) => void;
    setUsage: (usage: UnpackUsage | null) => void;
    reset: () => void;
}

const initialState = {
    context: null,
    moodId: null,
    moodName: '',
    status: 'idle' as UnpackStatus,
    questions: [] as UnpackQuestion[],
    stepIndex: 0,
    answers: [] as UnpackAnswer[],
    reflection: null,
    editedReflection: null,
    error: null,
    usage: null,
};

export const useUnpackStore = create<UnpackState>((set, get) => ({
    ...initialState,

    begin: (context, moodId, moodName) =>
        set({
            ...initialState,
            context,
            moodId,
            moodName,
            status: 'enriching',
        }),

    setEnrichedContext: (patch) =>
        set((state) => ({
            context: state.context ? { ...state.context, ...patch } : state.context,
        })),

    setStatus: (status) => set({ status }),

    setError: (message) => set({ error: message, status: message ? 'error' : get().status }),

    setQuestions: (questions) =>
        set({
            questions,
            answers: questions.map(() => ({ answer: '', skipped: false })),
            stepIndex: 0,
            status: 'questioning',
            error: null,
        }),

    setAnswer: (index, text) =>
        set((state) => {
            const answers = [...state.answers];
            answers[index] = { answer: text, skipped: false };
            return { answers };
        }),

    skipCurrent: () =>
        set((state) => {
            const answers = [...state.answers];
            answers[state.stepIndex] = { answer: '', skipped: true };
            return { answers };
        }),

    goNext: () =>
        set((state) => {
            if (state.stepIndex < state.questions.length - 1) {
                return { stepIndex: state.stepIndex + 1 };
            }
            // Past the last question → hand off to reflection generation.
            return { status: 'generating' };
        }),

    goBack: () =>
        set((state) => ({ stepIndex: Math.max(0, state.stepIndex - 1) })),

    setReflection: (reflection) =>
        set({ reflection, editedReflection: null, status: 'review', error: null }),

    setEditedReflection: (text) => set({ editedReflection: text }),

    setUsage: (usage) => set({ usage }),

    reset: () => set({ ...initialState }),
}));

/** Map the current questions + answers into the API question/answer shape. */
export function selectQuestionAnswers(state: UnpackState) {
    return state.questions.map((q, i) => ({
        question: q.question,
        answer: state.answers[i]?.answer ?? '',
        skipped: state.answers[i]?.skipped ?? false,
    }));
}

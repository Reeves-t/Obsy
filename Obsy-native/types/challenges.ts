export type ChallengeType = 'emotional' | 'observational' | 'environmental';

export type ChallengeTemplate = {
    id: string;          // stable slug, e.g. 'subtle-tension'
    title: string;       // short human label, e.g. 'Subtle tension'
    prompt: string;      // full UI text, e.g. 'Capture something in your day that carries subtle tension.'
    type: ChallengeType;
    isActive: boolean;
    cooldownDays: number;
};

export type DailyChallengeStatus = 'pending' | 'completed';

export type UserDailyChallenge = {
    id: string;
    userId: string | null;
    date: string; // YYYY-MM-DD in user timezone
    challengeTemplateId: string;
    status: DailyChallengeStatus;
    captureId?: string;
    createdAt: string;
    updatedAt: string;
};

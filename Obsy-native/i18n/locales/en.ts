export interface TranslationDictionary {
  navigation: {
    home: string;
    gallery: string;
    insights: string;
    settings: string;
  };
  common: {
    refresh: string;
    cancel: string;
    language: string;
    notSet: string;
  };
  settings: {
    title: string;
    languageTitle: string;
    languageSubtitle: string;
    appearance: string;
  };
  insight: {
    dailyTitle: string;
    dailyTitleFlat: string;
    emptyDaily: string;
    pendingCaptureOne: string;
    pendingCaptureOther: string;
    weekInReview: string;
    weekSubline: string;
    viewHistory: string;
    generateNarrative: string;
    monthlyInsight: string;
    unlockAfterWeekOne: string;
    createMonthly: string;
    keepCapturing: string;
  };
}

export const en: TranslationDictionary = {
  navigation: {
    home: 'Home',
    gallery: 'Gallery',
    insights: 'Insights',
    settings: 'Settings',
  },
  common: {
    refresh: 'Refresh',
    cancel: 'Cancel',
    language: 'Language',
    notSet: 'Not set',
  },
  settings: {
    title: 'Settings',
    languageTitle: 'Language',
    languageSubtitle: 'Choose your app language',
    appearance: 'APPEARANCE',
  },
  insight: {
    dailyTitle: "Today's Insight",
    dailyTitleFlat: 'DAILY INSIGHT',
    emptyDaily: 'No entries for today yet. Capture a moment to start your day.',
    pendingCaptureOne: '{{count}} new capture not yet included. Refresh to update',
    pendingCaptureOther: '{{count}} new captures not yet included. Refresh to update',
    weekInReview: 'Week in Review',
    weekSubline: 'A reflection across your days so far',
    viewHistory: 'View history',
    generateNarrative: 'Generate Narrative',
    monthlyInsight: 'Monthly Insight',
    unlockAfterWeekOne: 'Unlocks after week one',
    createMonthly: 'Create a monthly narrative to see long-form patterns.',
    keepCapturing: 'Keep capturing your days to unlock this insight.',
  },
};

export type TranslationKey =
  | 'navigation.home'
  | 'navigation.gallery'
  | 'navigation.insights'
  | 'navigation.settings'
  | 'common.refresh'
  | 'common.cancel'
  | 'common.language'
  | 'common.notSet'
  | 'settings.title'
  | 'settings.languageTitle'
  | 'settings.languageSubtitle'
  | 'settings.appearance'
  | 'insight.dailyTitle'
  | 'insight.dailyTitleFlat'
  | 'insight.emptyDaily'
  | 'insight.pendingCaptureOne'
  | 'insight.pendingCaptureOther'
  | 'insight.weekInReview'
  | 'insight.weekSubline'
  | 'insight.viewHistory'
  | 'insight.generateNarrative'
  | 'insight.monthlyInsight'
  | 'insight.unlockAfterWeekOne'
  | 'insight.createMonthly'
  | 'insight.keepCapturing';

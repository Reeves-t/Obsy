import type { TranslationDictionary } from './en';

export const tl: TranslationDictionary = {
  navigation: {
    home: 'Home',
    gallery: 'Gallery',
    insights: 'Insights',
    settings: 'Settings',
  },
  common: {
    refresh: 'I-refresh',
    cancel: 'Kanselahin',
    language: 'Wika',
    notSet: 'Hindi nakatakda',
  },
  settings: {
    title: 'Settings',
    languageTitle: 'Wika',
    languageSubtitle: 'Piliin ang wika ng app',
    appearance: 'ITSURA',
  },
  insight: {
    dailyTitle: 'Insight Ngayon',
    dailyTitleFlat: 'DAILY INSIGHT',
    emptyDaily: 'Wala pang entry ngayon. Mag-capture ng moment para magsimula.',
    pendingCaptureOne: '{{count}} bagong capture ang hindi pa naisama. I-refresh para ma-update',
    pendingCaptureOther: '{{count}} bagong capture ang hindi pa naisama. I-refresh para ma-update',
    weekInReview: 'Review ng Linggo',
    weekSubline: 'Maikling pagninilay sa mga araw mo',
    viewHistory: 'Tingnan ang history',
    generateNarrative: 'Gumawa ng Narrative',
    monthlyInsight: 'Monthly Insight',
    unlockAfterWeekOne: 'Magbubukas pagkatapos ng first week',
    createMonthly: 'Gumawa ng monthly narrative para makita ang long-form patterns.',
    keepCapturing: 'Magpatuloy sa pag-capture para ma-unlock ito.',
  },
};

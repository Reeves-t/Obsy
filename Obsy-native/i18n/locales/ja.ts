import type { TranslationDictionary } from './en';

export const ja: TranslationDictionary = {
  navigation: {
    home: 'ホーム',
    gallery: 'ギャラリー',
    insights: 'インサイト',
    settings: '設定',
  },
  common: {
    refresh: '更新',
    cancel: 'キャンセル',
    language: '言語',
    notSet: '未設定',
  },
  settings: {
    title: '設定',
    languageTitle: '言語',
    languageSubtitle: 'アプリの言語を選択',
    appearance: '表示',
  },
  insight: {
    dailyTitle: '今日のインサイト',
    dailyTitleFlat: 'デイリーインサイト',
    emptyDaily: '今日はまだ記録がありません。1つキャプチャして始めましょう。',
    pendingCaptureOne: '未反映のキャプチャが{{count}}件あります。更新してください',
    pendingCaptureOther: '未反映のキャプチャが{{count}}件あります。更新してください',
    weekInReview: '週のレビュー',
    weekSubline: '今週の流れを振り返る',
    viewHistory: '履歴を見る',
    generateNarrative: '生成する',
    monthlyInsight: '月間インサイト',
    unlockAfterWeekOne: '1週目以降に解放',
    createMonthly: '月間ナラティブを作成して、長期の傾向を確認しましょう。',
    keepCapturing: '記録を続けるとこのインサイトが解放されます。',
  },
};

import { createContext, useContext, useEffect, useState } from 'react';

export type AppLanguage = 'zh' | 'en';

export const translations = {
  zh: {
    appName: '赛事战绩统计系统',
    setup: '设置中',
    inProgress: '进行中',
    finished: '已结束',
    round: '轮',
    players: '选手',
    completedMatches: '已完成对局',
    previewPlayers: '预览选手',
    exportImage: '导出图片',
    exportExcel: '导出 Excel',
    groupSwitch: '小组切换',
    help: '帮助与说明',
    testModeOn: '关闭测试模式',
    testModeOff: '开启测试模式',
    previewAllPlayers: '整体预览',
    totalPlayers: '共 {count} 名选手',
    groupCount: '共 {count} 个小组',
    copyAll: '复制全部',
    copied: '已复制',
    searchPlayers: '搜索选手名称...',
    duplicateAlert: '检测到重名选手（共 {count} 个）',
    emptyGroupAlert: '存在空小组',
    noPlayerFound: '未找到匹配的选手',
    close: '关闭',
    progressText: '部分小组已开始比赛，仅展示当前选手名单',
    waitingText: '比赛尚未开始，可在“选手管理”中修改选手名称',
    swapLanguage: 'EN',
  },
  en: {
    appName: 'Tournament Results System',
    setup: 'Setup',
    inProgress: 'In progress',
    finished: 'Finished',
    round: 'Round',
    players: 'Players',
    completedMatches: 'Completed matches',
    previewPlayers: 'Preview players',
    exportImage: 'Export image',
    exportExcel: 'Export Excel',
    groupSwitch: 'Group switch',
    help: 'Help & instructions',
    testModeOn: 'Turn off test mode',
    testModeOff: 'Turn on test mode',
    previewAllPlayers: 'Overview',
    totalPlayers: '{count} players',
    groupCount: '{count} groups',
    copyAll: 'Copy all',
    copied: 'Copied',
    searchPlayers: 'Search player names...',
    duplicateAlert: 'Duplicate players detected ({count})',
    emptyGroupAlert: 'Empty groups found',
    noPlayerFound: 'No matching players found',
    close: 'Close',
    progressText: 'Some groups have started; displaying current roster only',
    waitingText: 'The event has not started yet. You can edit player names in the player manager.',
    swapLanguage: '中',
  },
} as const;

export function getStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'zh';
  const saved = localStorage.getItem('app-language');
  return saved === 'en' || saved === 'zh' ? saved : 'zh';
}

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (typeof translations)[AppLanguage];
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(getStoredLanguage);

  useEffect(() => {
    localStorage.setItem('app-language', language);
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguagePreference() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguagePreference must be used inside LanguageProvider');
  }

  return context;
}

export function formatText(template: string, values: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

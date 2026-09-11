import { useEffect, useState } from 'react';
import { getStoredLanguage, translations, type AppLanguage } from './i18nData';
import { LanguageContext } from './i18nContext';

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

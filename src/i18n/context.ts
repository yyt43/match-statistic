import { createContext, useContext } from 'react';
import type { AppLanguage, translations } from './data';

export interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (typeof translations)[AppLanguage];
}

export const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function useLanguagePreference() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguagePreference must be used inside LanguageProvider');
  }
  return context;
}

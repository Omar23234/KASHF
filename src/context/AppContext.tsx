import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, testConnection } from '../firebase/config';
import { TRANSLATIONS, type Language } from '../i18n/translations';
import type { AppScreen } from '../types/game';
import {
  loadChatNotificationsEnabled,
  saveChatNotificationsEnabled,
} from '../utils/chatNotifications';

interface AppContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (typeof TRANSLATIONS)['ar'] | (typeof TRANSLATIONS)['en'];
  isRTL: boolean;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  chatNotificationsEnabled: boolean;
  setChatNotificationsEnabled: (val: boolean) => void;
  screen: AppScreen;
  setScreen: (screen: AppScreen) => void;
  activeRoomCode: string | null;
  setActiveRoomCode: (code: string | null) => void;
  authUser: User | null;
  authReady: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

const LANG_KEY = 'kashf_lang';
const SOUND_KEY = 'kashf_sound';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      return saved === 'en' ? 'en' : 'ar';
    } catch {
      return 'ar';
    }
  });

  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(SOUND_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const [chatNotificationsEnabled, setChatNotificationsEnabledState] = useState<boolean>(() =>
    loadChatNotificationsEnabled()
  );

  const [screen, setScreen] = useState<AppScreen>('home');
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // ignore
    }
  };

  const setSoundEnabled = (val: boolean) => {
    setSoundEnabledState(val);
    try {
      localStorage.setItem(SOUND_KEY, String(val));
    } catch {
      // ignore
    }
  };

  const setChatNotificationsEnabled = (val: boolean) => {
    setChatNotificationsEnabledState(val);
    saveChatNotificationsEnabled(val);
  };

  useEffect(() => {
    const html = document.documentElement;
    html.lang = language;
    html.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  useEffect(() => {
    testConnection();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const t = TRANSLATIONS[language];
  const isRTL = language === 'ar';

  return (
    <AppContext.Provider
      value={{
        language,
        setLanguage,
        t,
        isRTL,
        soundEnabled,
        setSoundEnabled,
        chatNotificationsEnabled,
        setChatNotificationsEnabled,
        screen,
        setScreen,
        activeRoomCode,
        setActiveRoomCode,
        authUser,
        authReady,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

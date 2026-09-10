// ============================================================
// مزوّد الثيم: يحفظ اختيار المستخدم (فاتح/داكن) على الجهاز
// ويعيد رسم الشجرة كاملة عند التبديل فتتبدل الواجهة فوراً.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getThemeMode, isDarkMode, setThemeMode, type ThemeMode } from '../theme';

export const THEME_STORAGE_KEY = 'mrcenter.theme.mode';

async function persistTheme(mode: ThemeMode): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // تجاهل — الوضع يبقى مطبقاً لهذه الجلسة
  }
}

async function loadSavedTheme(): Promise<ThemeMode | null> {
  try {
    const raw = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'dark' || raw === 'light') return raw;
  } catch {
    // تجاهل
  }
  return null;
}

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getThemeMode());

  // استرجاع الاختيار المحفوظ عند الإقلاع
  useEffect(() => {
    let mounted = true;
    void loadSavedTheme().then((saved) => {
      if (mounted && saved && saved !== getThemeMode()) {
        setThemeMode(saved);
        setModeState(saved);
      }
    });
    return () => { mounted = false; };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setThemeMode(next);
    setModeState(next);
    void persistTheme(next);
  }, []);

  const toggle = useCallback(() => {
    setMode(isDarkMode() ? 'light' : 'dark');
  }, [setMode]);

  return (
    <ThemeContext.Provider value={{ mode, isDark: mode === 'dark', setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme يجب أن يُستخدم داخل ThemeProvider');
  return ctx;
}

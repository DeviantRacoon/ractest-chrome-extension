import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import storageService from "../lib/storage";
import type { AppLanguage, AppLanguagePreference } from "../types";
import en from "./messages/en";
import es from "./messages/es";

type TranslationKey = keyof typeof en;
type TranslationValues = Record<string, string | number>;

type Dictionary = Record<TranslationKey, string>;

const dictionaries: Record<AppLanguage, Dictionary> = {
  en,
  es,
};

const supportedLanguages: AppLanguage[] = ["en", "es"];
const supportedLanguagePreferences: AppLanguagePreference[] = [
  "auto",
  "en",
  "es",
];

const normalizeLanguage = (value?: string | null): AppLanguage => {
  if (!value) return "en";
  const lower = value.toLowerCase();
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("en")) return "en";
  return "en";
};

const normalizeLanguagePreference = (
  value?: string | null,
): AppLanguagePreference => {
  if (!value) return "en";
  const lower = value.toLowerCase();
  if (lower === "auto") return "auto";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("en")) return "en";
  return "en";
};

const detectSystemLanguage = (): AppLanguage => {
  try {
    if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
      return normalizeLanguage(chrome.i18n.getUILanguage());
    }
    if (typeof navigator !== "undefined") {
      return normalizeLanguage(navigator.language);
    }
  } catch (error) {
    console.warn("Could not detect UI language:", error);
  }
  return "en";
};

const interpolate = (template: string, values?: TranslationValues): string => {
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
};

interface I18nContextValue {
  language: AppLanguage;
  systemLanguage: AppLanguage;
  languagePreference: AppLanguagePreference;
  setLanguage: (
    languagePreference: AppLanguagePreference,
    persist?: boolean,
  ) => Promise<void>;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  supportedLanguages: AppLanguage[];
  supportedLanguagePreferences: AppLanguagePreference[];
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [systemLanguage, setSystemLanguage] =
    useState<AppLanguage>(detectSystemLanguage);
  const [languagePreference, setLanguagePreference] =
    useState<AppLanguagePreference>("en");

  const language = useMemo<AppLanguage>(() => {
    if (languagePreference === "auto") {
      return systemLanguage;
    }
    return normalizeLanguage(languagePreference);
  }, [languagePreference, systemLanguage]);

  useEffect(() => {
    setSystemLanguage(detectSystemLanguage());

    const loadLanguageFromSettings = async () => {
      try {
        const settings = await storageService.getSettings();
        if (settings.language) {
          setLanguagePreference(normalizeLanguagePreference(settings.language));
        }
      } catch (error) {
        console.error("Error loading language from settings:", error);
      }
    };

    void loadLanguageFromSettings();
  }, []);

  const setLanguage = useCallback(
    async (nextLanguagePreference: AppLanguagePreference, persist = true) => {
      const normalized = normalizeLanguagePreference(nextLanguagePreference);
      setLanguagePreference(normalized);
      if (!persist) return;

      try {
        await storageService.updateSettings({ language: normalized });
      } catch (error) {
        console.error("Error saving language:", error);
      }
    },
    [],
  );

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) => {
      const dictionary = dictionaries[language] ?? dictionaries.en;
      const template = dictionary[key] ?? dictionaries.en[key] ?? key;
      return interpolate(template, values);
    },
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      systemLanguage,
      languagePreference,
      setLanguage,
      t,
      supportedLanguages,
      supportedLanguagePreferences,
    }),
    [
      language,
      systemLanguage,
      languagePreference,
      setLanguage,
      t,
    ],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
};

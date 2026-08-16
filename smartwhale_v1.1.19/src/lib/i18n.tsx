import React, { createContext, useContext } from "react";
import translations, {
  type TranslationSection,
} from "@/locales";

// t("section", "key", ...args) 其中 {0}, {1} 為佔位符
type TFn = (section: TranslationSection, key: string, ...args: (string | number)[]) => string;

interface I18nContextValue {
  t: TFn;
}

const t: TFn = (section, key, ...args) => {
  const sectionObj = (translations as Record<string, Record<string, string>>)[section];
  if (!sectionObj) return key;
  let text: string = sectionObj[key as string] ?? key;
  args.forEach((arg, i) => {
    text = text.replaceAll(`{${i}}`, String(arg));
  });
  return text;
};

const I18nContext = createContext<I18nContextValue>({ t });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  return (
    <I18nContext.Provider value={{ t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

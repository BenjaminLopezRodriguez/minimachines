"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark" | "system";
const storageKey = "minimachines-theme";
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
}>({
  theme: "system",
  setTheme: () => undefined,
});

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.themePreference = theme;
  root.dataset.theme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>("system");
  const setTheme = useCallback((value: Theme) => {
    applyTheme(value);
    updateTheme(value);
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      /* Keep the in-session preference. */
    }
  }, []);

  useEffect(() => {
    const initial = document.documentElement.dataset.themePreference;
    const value = isTheme(initial) ? initial : "system";
    applyTheme(value);
    updateTheme(value);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (document.documentElement.dataset.themePreference === "system")
        applyTheme("system");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      const next = isTheme(event.newValue) ? event.newValue : "system";
      applyTheme(next);
      updateTheme(next);
    };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

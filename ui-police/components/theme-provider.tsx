"use client"

import type * as React from "react"
import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"
type Language = "en" | "hi"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  defaultLanguage?: Language
  storageKey?: string
  languageStorageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  language: Language
  setTheme: (theme: Theme) => void
  setLanguage: (language: Language) => void
}

const initialState: ThemeProviderState = {
  theme: "dark",
  language: "en",
  setTheme: () => null,
  setLanguage: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  defaultLanguage = "en",
  storageKey = "vite-ui-theme",
  languageStorageKey = "vite-ui-language",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme
    return (window.localStorage.getItem(storageKey) as Theme) || defaultTheme
  })
  const [language, setLanguage] = useState<Language>(
    () => {
      if (typeof window === "undefined") return defaultLanguage
      return (window.localStorage.getItem(languageStorageKey) as Language) || defaultLanguage
    },
  )

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove("light", "dark")

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

      root.classList.add(systemTheme)
      return
    }

    root.classList.add(theme)
  }, [theme])

  const value = {
    theme,
    language,
    setTheme: (theme: Theme) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, theme)
      }
      setTheme(theme)
    },
    setLanguage: (language: Language) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(languageStorageKey, language)
      }
      setLanguage(language)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider")

  return context
}

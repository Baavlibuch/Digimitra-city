"use client"

import { useEffect, useState } from "react"
import { Dashboard } from "@/components/dashboard"
import { LoginPage } from "@/components/login-page"
import { ThemeProvider } from "@/components/theme-provider"
import { getStoredAccessToken } from "@/src/lib/auth-token"

export default function Home() {
  const [sessionKnown, setSessionKnown] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    setIsAuthenticated(Boolean(getStoredAccessToken()))
    setSessionKnown(true)
  }, [])

  if (!sessionKnown) {
    return <div className="min-h-screen bg-background" aria-busy="true" />
  }

  if (!isAuthenticated) {
    return (
      <ThemeProvider defaultTheme="dark" defaultLanguage="en">
        <LoginPage onLogin={() => setIsAuthenticated(true)} />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider defaultTheme="dark" defaultLanguage="en">
      <Dashboard />
    </ThemeProvider>
  )
}

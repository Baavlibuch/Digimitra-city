"use client"

import { Suspense, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Dashboard } from "@/components/dashboard"
import { ThemeProvider } from "@/components/theme-provider"
import { useAuth } from "@/components/auth-provider"

export default function Home() {
  const router = useRouter()
  const { isAuthenticated, isCheckingAuth, logout } = useAuth()

  useEffect(() => {
    if (!isCheckingAuth && !isAuthenticated) {
      router.replace("/login")
    }
  }, [isAuthenticated, isCheckingAuth, router])

  return (
    <ThemeProvider defaultTheme="light" defaultLanguage="en">
      {isCheckingAuth ? (
        <div className="min-h-screen bg-background" aria-busy="true" />
      ) : (
        <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
          <Dashboard
            onSignOut={() => {
              void logout()
            }}
          />
        </Suspense>
      )}
    </ThemeProvider>
  )
}

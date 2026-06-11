"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ThemeProvider } from "@/components/theme-provider"
import { useAuth } from "@/components/auth-provider"
import { Navigation } from "@/components/navigation"
import { RecordingsHistory } from "@/components/recordings-history"
import { AIAgentPanel } from "@/components/ai-agent-panel"

export default function RecordingsPage() {
  const router = useRouter()
  const { isAuthenticated, isCheckingAuth, logout } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [catalogRefreshTrigger, setCatalogRefreshTrigger] = useState(0)

  useEffect(() => {
    if (!isCheckingAuth && !isAuthenticated) {
      router.replace("/login")
    }
  }, [isAuthenticated, isCheckingAuth, router])

  const handleNav = useCallback(
    (id: string) => {
      if (id === "recordings") return
      if (id === "dashboard") {
        router.push("/")
        return
      }
      router.push(`/?section=${encodeURIComponent(id)}`)
    },
    [router],
  )

  const handleSignOut = async () => {
    if (isSigningOut) return
    setSignOutError(null)
    setIsSigningOut(true)
    try {
      await logout()
    } catch (e) {
      setSignOutError(e instanceof Error ? e.message : "Unable to sign out right now.")
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <ThemeProvider defaultTheme="dark" defaultLanguage="en">
      {isCheckingAuth ? (
        <div className="min-h-screen bg-background" aria-busy="true" />
      ) : isAuthenticated ? (
        <div className="min-h-screen bg-background">
          <Navigation
            activeSection="recordings"
            onSectionChange={handleNav}
            onSignOut={() => void handleSignOut()}
            isSigningOut={isSigningOut}
          />

          {signOutError && (
            <div className="container mx-auto px-6 pt-4">
              <p className="text-sm text-red-400" role="alert">
                {signOutError}
              </p>
            </div>
          )}

          <main className="container mx-auto px-6 py-8">
            <RecordingsHistory
              catalogRefreshTrigger={catalogRefreshTrigger}
              onUploaded={() => setCatalogRefreshTrigger((n) => n + 1)}
            />
          </main>

          <AIAgentPanel />
        </div>
      ) : null}
    </ThemeProvider>
  )
}

"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { LoginPage } from "@/components/login-page"
import { ThemeProvider } from "@/components/theme-provider"
import { useAuth } from "@/components/auth-provider"

export default function LoginRoutePage() {
  const router = useRouter()
  const { isAuthenticated, isCheckingAuth } = useAuth()

  useEffect(() => {
    if (!isCheckingAuth && isAuthenticated) {
      router.replace("/")
    }
  }, [isAuthenticated, isCheckingAuth, router])

  return (
    <ThemeProvider defaultTheme="dark" defaultLanguage="en">
      {isCheckingAuth ? <div className="min-h-screen bg-background" aria-busy="true" /> : <LoginPage />}
    </ThemeProvider>
  )
}

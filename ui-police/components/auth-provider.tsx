"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  confirmEmailSignUp,
  getAuthenticatedUser,
  hasValidSession,
  resendVerificationCode,
  signInWithEmail,
  signOutUser,
  signUpWithEmail,
} from "@/lib/cognito"

type AuthUser = {
  userId: string
  username: string
  email?: string
}

type AuthContextValue = {
  user: AuthUser | null
  isAuthenticated: boolean
  isCheckingAuth: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<{ requiresVerification: boolean; isComplete: boolean }>
  verifyAccount: (email: string, code: string) => Promise<void>
  resendCode: (email: string) => Promise<void>
  logout: () => Promise<void>
  refreshAuthState: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function setAuthCookie(isAuthenticated: boolean) {
  if (typeof document === "undefined") return
  document.cookie = isAuthenticated
    ? "dm_auth=1; path=/; SameSite=Lax"
    : "dm_auth=; Max-Age=0; path=/; SameSite=Lax"
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  const refreshAuthState = useCallback(async () => {
    setIsCheckingAuth(true)
    try {
      const validSession = await hasValidSession()
      if (!validSession) {
        setUser(null)
        setAuthCookie(false)
        return
      }
      const currentUser = await getAuthenticatedUser()
      setUser(currentUser)
      setAuthCookie(Boolean(currentUser))
    } finally {
      setIsCheckingAuth(false)
    }
  }, [])

  useEffect(() => {
    void refreshAuthState()
  }, [refreshAuthState])

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await signInWithEmail(email, password)
    if (result.nextStep.signInStep === "DONE") {
      await refreshAuthState()
      return
    }
    if (result.nextStep.signInStep === "CONFIRM_SIGN_UP") {
      throw new Error("Please verify your email before logging in.")
    }
    throw new Error("Additional sign-in step required. Please complete verification.")
  }, [refreshAuthState])

  const signUp = useCallback(async (fullName: string, email: string, password: string) => {
    const result = await signUpWithEmail({ fullName, email, password })
    const step = result.nextStep.signUpStep
    return {
      requiresVerification: step === "CONFIRM_SIGN_UP",
      isComplete: step === "DONE",
    }
  }, [])

  const verifyAccount = useCallback(async (email: string, code: string) => {
    await confirmEmailSignUp(email, code)
  }, [])

  const resendCode = useCallback(async (email: string) => {
    await resendVerificationCode(email)
  }, [])

  const logout = useCallback(async () => {
    await signOutUser()
    setUser(null)
    setAuthCookie(false)
    router.push("/login")
  }, [router])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isCheckingAuth,
      signIn,
      signUp,
      verifyAccount,
      resendCode,
      logout,
      refreshAuthState,
    }),
    [isCheckingAuth, logout, refreshAuthState, resendCode, signIn, signUp, user, verifyAccount],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}

import { fetchAuthSession } from "aws-amplify/auth"
import { configureCognito, signInWithEmail } from "@/lib/cognito"

export async function getStoredAccessToken(): Promise<string | null> {
  try {
    configureCognito()
    const session = await fetchAuthSession()
    return session.tokens?.accessToken?.toString() ?? null
  } catch {
    return null
  }
}

export async function clearStoredAccessToken() {
  if (typeof document !== "undefined") {
    document.cookie = "dm_auth=; Max-Age=0; path=/; SameSite=Lax"
  }
}

export async function authHeaders(): Promise<HeadersInit> {
  const token = await getStoredAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function loginWithPassword(username: string, password: string): Promise<void> {
  const result = await signInWithEmail(username, password)
  if (result.nextStep.signInStep !== "DONE") {
    throw new Error("Additional sign-in step required.")
  }
}

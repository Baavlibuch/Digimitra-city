const STORAGE_KEY = "digimitra_access_token"

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null
  return sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY)
}

export function setStoredAccessToken(token: string) {
  localStorage.setItem(STORAGE_KEY, token)
}

export function clearStoredAccessToken() {
  sessionStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(STORAGE_KEY)
}

export function authHeaders(): HeadersInit {
  const token = getStoredAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function loginWithPassword(username: string, password: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
  const body = new URLSearchParams({ username: username.trim(), password })
  const res = await fetch(`${base}/api/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(text || `Login failed (${res.status})`)
  }
  let data: { access_token?: string }
  try {
    data = JSON.parse(text) as { access_token?: string }
  } catch {
    throw new Error("Invalid login response")
  }
  if (!data.access_token) {
    throw new Error("No access token returned")
  }
  setStoredAccessToken(data.access_token)
}

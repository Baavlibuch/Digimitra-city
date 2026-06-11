/** Feature flag: true live WebSocket alerts (separate from delayed detection polling). */

export function isLiveWebSocketEnabled(): boolean {
  if (typeof process === "undefined") return false
  return process.env.NEXT_PUBLIC_ENABLE_LIVE_WS === "true"
}

export function surveillanceApiBase(): string {
  if (typeof process === "undefined") return "http://localhost:8000"
  return (
    process.env.NEXT_PUBLIC_SURVEILLANCE_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    "http://localhost:8000"
  ).replace(/\/$/, "")
}

export function liveAlertsWebSocketUrl(token: string): string {
  const base = surveillanceApiBase()
  const wsBase = base.replace(/^http/, "ws")
  return `${wsBase}/api/v1/live/alerts?token=${encodeURIComponent(token)}`
}

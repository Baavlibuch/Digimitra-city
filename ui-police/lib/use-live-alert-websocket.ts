"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchSurveillanceAccessToken } from "@/lib/surveillance-api"
import { isLiveWebSocketEnabled, liveAlertsWebSocketUrl } from "@/lib/live-ws-config"

export type LiveWsAlert = {
  type: "live_alert"
  camera_id: string
  alert_type: string
  severity: "low" | "medium" | "high" | "critical"
  message: string
  timestamp: string
  track_ids: number[]
  bboxes: number[][]
  alert_id?: string
}

export type LiveWsConnectionStatus = "disabled" | "connecting" | "connected" | "error"

export type LiveWsSceneStatus = {
  type: "live_scene_status"
  camera_id: string
  scene_status: string
  message: string
  timestamp: string
  source_alert_type?: string
  severity?: string
}

type Result = {
  enabled: boolean
  status: LiveWsConnectionStatus
  alerts: LiveWsAlert[]
  alertByCameraId: Map<string, LiveWsAlert>
  latestBboxesByCameraId: Map<string, number[][]>
  sceneStatusByCameraId: Map<string, LiveWsSceneStatus>
  error: string | null
}

export function useLiveAlertWebSocket(operatorUsername: string, authReady: boolean): Result {
  const enabled = isLiveWebSocketEnabled()
  const [status, setStatus] = useState<LiveWsConnectionStatus>(enabled ? "connecting" : "disabled")
  const [alerts, setAlerts] = useState<LiveWsAlert[]>([])
  const [sceneStatusByCameraId, setSceneStatusByCameraId] = useState<Map<string, LiveWsSceneStatus>>(
    () => new Map(),
  )
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const tokenRef = useRef<string | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushAlert = useCallback((alert: LiveWsAlert) => {
    setAlerts((prev) => [alert, ...prev].slice(0, 50))
  }, [])

  useEffect(() => {
    if (!enabled || !authReady || !operatorUsername.trim()) {
      setStatus(enabled ? "connecting" : "disabled")
      return
    }

    let cancelled = false

    const connect = async () => {
      try {
        setStatus("connecting")
        let tok = tokenRef.current
        if (!tok) {
          tok = await fetchSurveillanceAccessToken(operatorUsername)
          tokenRef.current = tok
        }
        if (cancelled) return

        const ws = new WebSocket(liveAlertsWebSocketUrl(tok))
        wsRef.current = ws

        ws.onopen = () => {
          if (!cancelled) {
            setStatus("connected")
            setError(null)
          }
        }

        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(String(ev.data)) as Record<string, unknown>
            if (data.type === "connection") {
              setStatus("connected")
              return
            }
            if (data.type === "live_alert") {
              pushAlert(data as LiveWsAlert)
              return
            }
            if (data.type === "live_scene_status") {
              const scene = data as LiveWsSceneStatus
              setSceneStatusByCameraId((prev) => {
                const next = new Map(prev)
                next.set(scene.camera_id, scene)
                return next
              })
            }
          } catch {
            /* ignore malformed */
          }
        }

        ws.onerror = () => {
          if (!cancelled) {
            setStatus("error")
            setError("Live WebSocket connection error")
          }
        }

        ws.onclose = () => {
          wsRef.current = null
          if (!cancelled) {
            setStatus("connecting")
            reconnectRef.current = setTimeout(() => {
              void connect()
            }, 4000)
          }
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("error")
          setError(e instanceof Error ? e.message : "Failed to connect live alerts")
          tokenRef.current = null
          reconnectRef.current = setTimeout(() => {
            void connect()
          }, 6000)
        }
      }
    }

    void connect()

    return () => {
      cancelled = true
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [enabled, authReady, operatorUsername, pushAlert])

  const alertByCameraId = new Map<string, LiveWsAlert>()
  const latestBboxesByCameraId = new Map<string, number[][]>()
  for (const a of alerts) {
    if (!alertByCameraId.has(a.camera_id)) alertByCameraId.set(a.camera_id, a)
    if (a.bboxes?.length) latestBboxesByCameraId.set(a.camera_id, a.bboxes)
  }

  return {
    enabled,
    status,
    alerts,
    alertByCameraId,
    latestBboxesByCameraId,
    sceneStatusByCameraId,
    error,
  }
}

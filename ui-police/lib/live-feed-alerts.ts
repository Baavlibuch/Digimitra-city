"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  buildIncidentCandidatesFromDetections,
  type IncidentSeverity,
} from "@/lib/event-deduplication"
import {
  fetchDetections,
  fetchSurveillanceAccessToken,
  type DetectionDto,
} from "@/lib/surveillance-api"

export type FeedAlertSeverity = IncidentSeverity

export type FeedAlert = {
  cameraId: string
  message: string
  title: string
  severity: FeedAlertSeverity
  absoluteEventTime: string
  detectionId: string
}

export type LiveFeedNotification = {
  id: string
  cameraId: string
  message: string
  timestamp: string
  type: "motion" | "alert" | "suggestion"
  action?: "zoom" | "focus"
}

const POLL_MS_DEFAULT = 8_000
const LOOKBACK_MS = 24 * 60 * 60 * 1000

function severityFromLabel(label: string): FeedAlertSeverity | "low" {
  switch (label) {
    case "Accident Alert":
      return "critical"
    case "Possible Altercation":
    case "Suspicious Activity":
    case "Security Alert":
      return "high"
    case "Crowd Formation":
    case "Traffic Congestion":
    case "High Human Activity":
    case "Vehicle Cluster Detected":
      return "medium"
    default:
      return "low"
  }
}

function overlayMessage(title: string, absoluteEventTime: string, severity: FeedAlertSeverity): string {
  const time = formatShortTime(absoluteEventTime)
  const prefix = severity === "critical" ? "⚠️ " : ""
  return time ? `${prefix}${title} — ${time}` : `${prefix}${title}`
}

export function buildFeedAlerts(detections: DetectionDto[]): FeedAlert[] {
  const incidents = buildIncidentCandidatesFromDetections(detections, {
    severityFromLabel,
    isUploadedSource: (cameraId) => cameraId === "file-upload",
  })

  return incidents.map((incident) => ({
    cameraId: incident.cameraId,
    title: incident.incidentType,
    message: overlayMessage(incident.incidentType, incident.firstDetectedAt, incident.severity),
    severity: incident.severity,
    absoluteEventTime: incident.firstDetectedAt,
    detectionId: incident.detectionId,
  }))
}

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime()
    if (diffMs < 60_000) return "just now"
    const mins = Math.floor(diffMs / 60_000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return formatShortTime(iso)
  } catch {
    return ""
  }
}

export function alertsByCameraId(alerts: FeedAlert[]): Map<string, FeedAlert> {
  const map = new Map<string, FeedAlert>()
  for (const alert of alerts) {
    if (!map.has(alert.cameraId)) map.set(alert.cameraId, alert)
  }
  return map
}

export function toLiveFeedNotifications(alerts: FeedAlert[], limit = 3): LiveFeedNotification[] {
  return alerts.slice(0, limit).map((alert) => ({
    id: alert.detectionId,
    cameraId: alert.cameraId,
    message: alert.title,
    timestamp: formatRelativeTime(alert.absoluteEventTime),
    type: alert.severity === "critical" || alert.severity === "high" ? "alert" : "suggestion",
    action: "zoom" as const,
  }))
}

type UseLiveFeedAlertsResult = {
  alertByFeedId: Map<string, FeedAlert>
  notifications: LiveFeedNotification[]
  alertsLoading: boolean
  alertsError: string | null
  refreshAlerts: () => void
}

export function useLiveFeedAlerts(
  operatorUsername: string,
  pollIntervalMs = POLL_MS_DEFAULT,
  enabled = true,
): UseLiveFeedAlertsResult {
  const [alertByFeedId, setAlertByFeedId] = useState<Map<string, FeedAlert>>(() => new Map())
  const [notifications, setNotifications] = useState<LiveFeedNotification[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)

  const loadAlerts = useCallback(async () => {
    if (!enabled || !operatorUsername.trim() || inFlightRef.current) return
    inFlightRef.current = true
    setAlertsLoading(true)

    try {
      let tok = tokenRef.current
      if (!tok) {
        tok = await fetchSurveillanceAccessToken(operatorUsername)
        tokenRef.current = tok
      }

      const end = new Date()
      const start = new Date(end.getTime() - LOOKBACK_MS)

      const page = await fetchDetections({
        token: tok,
        eventAfter: start.toISOString(),
        eventBefore: end.toISOString(),
        limit: 200,
        offset: 0,
      })

      const alerts = buildFeedAlerts(page.items)
      setAlertByFeedId(alertsByCameraId(alerts))
      setNotifications(toLiveFeedNotifications(alerts))
      setAlertsError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load alerts."
      setAlertsError(msg)
      tokenRef.current = null
    } finally {
      inFlightRef.current = false
      setAlertsLoading(false)
    }
  }, [enabled, operatorUsername])

  useEffect(() => {
    if (!enabled || !operatorUsername.trim()) {
      setAlertByFeedId(new Map())
      setNotifications([])
      return
    }

    void loadAlerts()
    const id = window.setInterval(() => {
      void loadAlerts()
    }, pollIntervalMs)

    return () => {
      window.clearInterval(id)
    }
  }, [enabled, operatorUsername, pollIntervalMs, loadAlerts])

  return {
    alertByFeedId,
    notifications,
    alertsLoading,
    alertsError,
    refreshAlerts: () => {
      void loadAlerts()
    },
  }
}

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  AlertTriangle,
  Clock,
  MapPin,
  Search,
  Bell,
  BellRing,
  Eye,
  Play,
  Zap,
  Users,
  Car,
  Shield,
  CheckCircle,
  ArrowUp,
  Send,
  Download,
  Pin,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import {
  fetchCameras,
  fetchDetectionPlaybackUrl,
  fetchDetections,
  fetchRecordingPlaybackUrl,
  fetchSurveillanceAccessToken,
  type DetectionDto,
} from "@/lib/surveillance-api"
import {
  buildIncidentCandidatesFromDetections,
  buildMergedIncidentDescription,
} from "@/lib/event-deduplication"
import {
  RecordingPlaybackPlayer,
  type PlaybackEntryContext,
} from "@/components/recording-playback-player"

type EventSeverity = "medium" | "high" | "critical"

const DISMISSED_EVENTS_STORAGE_KEY = "digimitra.eventsAlerts.dismissedEventIds.v1"
const INITIAL_HIGH_SEVERITY_FEED_LIMIT = 50

function loadDismissedEventIds(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(DISMISSED_EVENTS_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === "string"))
  } catch {
    return new Set()
  }
}

function persistDismissedEventIds(ids: Set<string>): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(DISMISSED_EVENTS_STORAGE_KEY, JSON.stringify([...ids]))
}

interface DisplayEvent {
  id: string
  detectionId: string
  recordingSegmentId: string
  type: string
  severity: EventSeverity
  title: string
  description: string
  camera: string
  location: string
  timestamp: string
  absoluteEventTime: string
  aiConfidence: number
  status: "new"
  previewFrame?: string
}

function detectionPreviewFrame(detection: DetectionDto): string | undefined {
  const extended = detection as DetectionDto & {
    preview_frame?: string
    previewFrame?: string
    preview_url?: string
    previewUrl?: string
    thumbnail?: string
    thumbnail_url?: string
  }
  return (
    extended.preview_frame ??
    extended.previewFrame ??
    extended.preview_url ??
    extended.previewUrl ??
    extended.thumbnail ??
    extended.thumbnail_url
  )
}

/** Severity mapping lives only in this file — not shared utilities. */
function severityFromLabel(label: string): EventSeverity | "low" {
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

function formatEventTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "medium",
    })
  } catch {
    return iso
  }
}

function severityRank(severity: EventSeverity): number {
  switch (severity) {
    case "critical":
      return 0
    case "high":
      return 1
    case "medium":
      return 2
    default:
      return 3
  }
}

function sortEventsBySeverityThenTime(events: DisplayEvent[]): DisplayEvent[] {
  return [...events].sort((a, b) => {
    const severityDiff = severityRank(a.severity) - severityRank(b.severity)
    if (severityDiff !== 0) return severityDiff
    return b.absoluteEventTime.localeCompare(a.absoluteEventTime)
  })
}

function buildDisplayEvents(
  detections: DetectionDto[],
  cameraNameById: Map<string, string>,
): DisplayEvent[] {
  const uploadedCctvBySegmentId = buildUploadedCctvLabels(detections, cameraNameById)
  const incidents = buildIncidentCandidatesFromDetections(detections, {
    severityFromLabel,
    isUploadedSource: (cameraId) => isUploadedDetection(cameraId, cameraNameById),
    previewFrame: detectionPreviewFrame,
  })

  return incidents.map((incident) => {
    const cameraLabel = displayDetectionCameraName(
      incident.anchorDetection,
      cameraNameById,
      uploadedCctvBySegmentId,
    )

    return {
      id: incident.id,
      detectionId: incident.detectionId,
      recordingSegmentId: incident.recordingSegmentId,
      type: incident.incidentType,
      severity: incident.severity,
      title: incident.incidentType,
      description: buildMergedIncidentDescription(incident.mergedGroups),
      camera: cameraLabel,
      location: cameraLabel,
      timestamp: formatEventTime(incident.firstDetectedAt),
      absoluteEventTime: incident.firstDetectedAt,
      aiConfidence: incident.aiConfidence,
      status: "new",
      previewFrame: incident.previewFrame,
    }
  })
}

function isUploadedDetection(cameraId: string, cameraNameById: Map<string, string>): boolean {
  return cameraId === "file-upload" || cameraNameById.get(cameraId) === "Uploaded video"
}

function buildUploadedCctvLabels(
  detections: DetectionDto[],
  cameraNameById: Map<string, string>,
): Map<string, string> {
  const segmentFirstTime = new Map<string, string>()
  for (const d of detections) {
    if (!isUploadedDetection(d.camera_id, cameraNameById)) continue
    const existing = segmentFirstTime.get(d.recording_segment_id)
    if (!existing || d.absolute_event_time < existing) {
      segmentFirstTime.set(d.recording_segment_id, d.absolute_event_time)
    }
  }
  const orderedSegmentIds = [...segmentFirstTime.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([segmentId]) => segmentId)
  const labels = new Map<string, string>()
  for (let i = 0; i < orderedSegmentIds.length; i++) {
    labels.set(orderedSegmentIds[i], `CCTV ${i + 1}`)
  }
  return labels
}

function displayDetectionCameraName(
  detection: DetectionDto,
  cameraNameById: Map<string, string>,
  uploadedCctvBySegmentId: Map<string, string>,
): string {
  if (isUploadedDetection(detection.camera_id, cameraNameById)) {
    return uploadedCctvBySegmentId.get(detection.recording_segment_id) ?? "CCTV 1"
  }
  return cameraNameById.get(detection.camera_id) ?? detection.camera_id.slice(0, 8)
}

function localYmd(d: Date) {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" })
}

function localHm(d: Date) {
  const h = d.getHours()
  const m = d.getMinutes()
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

function combineLocalDateTimeToIso(dateStr: string, timeStr: string, edge: "start" | "end"): string | undefined {
  const d = dateStr?.trim()
  if (!d) return undefined
  const t = timeStr?.trim()
  let clock: string
  if (t && t.length >= 4) {
    clock = t.length === 5 ? `${t}:00` : t.length === 8 ? t : `${t.slice(0, 5)}:00`
  } else {
    clock = edge === "end" ? "23:59:59" : "00:00:00"
  }
  const ms = new Date(`${d}T${clock}`).getTime()
  if (Number.isNaN(ms)) return undefined
  return new Date(ms).toISOString()
}

export function EventsAlerts() {
  const router = useRouter()
  const { user, isCheckingAuth } = useAuth()
  const operator = (user?.username || "operator").trim() || "operator"

  const [filter, setFilter] = useState("all")
  const [severityFilter, setSeverityFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"timeline" | "clusters">("timeline")
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<{ eventId: string; action: string; message: string } | null>(
    null,
  )

  const [token, setToken] = useState<string | null>(null)
  const surveillanceTokenRef = useRef<string | null>(null)
  const [rawDetections, setRawDetections] = useState<DetectionDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cameraNameById, setCameraNameById] = useState<Map<string, string>>(new Map())
  const useInitialHighSeverityFeedRef = useRef(true)

  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null)
  const pendingSeekSecRef = useRef<number | null>(null)
  const [playbackDetections, setPlaybackDetections] = useState<DetectionDto[]>([])
  const [playbackDetectionsLoading, setPlaybackDetectionsLoading] = useState(false)
  const [playbackEntryContext, setPlaybackEntryContext] = useState<PlaybackEntryContext>({ mode: "normal" })
  const [activeSegmentStart, setActiveSegmentStart] = useState<string | null>(null)
  const [playbackLoadingId, setPlaybackLoadingId] = useState<string | null>(null)
  const [dismissedEventIds, setDismissedEventIds] = useState<Set<string>>(() => loadDismissedEventIds())

  const getSurveillanceAccessTokenOrNull = useCallback((): string | null => {
    if (surveillanceTokenRef.current) return surveillanceTokenRef.current
    if (loading) return null
    return token
  }, [loading, token])

  const events = useMemo(
    () => buildDisplayEvents(rawDetections, cameraNameById),
    [rawDetections, cameraNameById],
  )

  const visibleEvents = useMemo(
    () => events.filter((event) => !dismissedEventIds.has(event.id)),
    [events, dismissedEventIds],
  )

  const criticalCount = useMemo(() => visibleEvents.filter((e) => e.severity === "critical").length, [visibleEvents])
  const highCount = useMemo(() => visibleEvents.filter((e) => e.severity === "high").length, [visibleEvents])
  const mediumCount = useMemo(() => visibleEvents.filter((e) => e.severity === "medium").length, [visibleEvents])

  const loadDetections = useCallback(async () => {
    setError(null)
    setLoading(true)
    surveillanceTokenRef.current = null
    let acquiredTok: string | null = null
    try {
      const tok = await fetchSurveillanceAccessToken(operator)
      acquiredTok = tok
      surveillanceTokenRef.current = tok
      setToken(tok)

      const camList = await fetchCameras().catch(() => [])
      const nameMap = new Map<string, string>()
      for (const c of camList) nameMap.set(c.id, c.name)
      setCameraNameById(nameMap)

      const end = new Date()
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
      const eventAfter = combineLocalDateTimeToIso(localYmd(start), localHm(start), "start")
      const eventBefore = combineLocalDateTimeToIso(localYmd(end), localHm(end), "end")

      const all: DetectionDto[] = []
      let offset = 0
      const pageSize = 200
      let total = 0
      do {
        const page = await fetchDetections({
          token: tok,
          eventAfter,
          eventBefore,
          limit: pageSize,
          offset,
        })
        total = page.total
        all.push(...page.items)
        offset += page.items.length
        if (page.items.length === 0) break
      } while (all.length < total && offset < 2000)

      setRawDetections(all)
    } catch (e) {
      if (!acquiredTok) {
        surveillanceTokenRef.current = null
        setToken(null)
      }
      setError(e instanceof Error ? e.message : "Failed to load detections.")
      setRawDetections([])
    } finally {
      setLoading(false)
    }
  }, [operator])

  useEffect(() => {
    if (isCheckingAuth) return
    void loadDetections()
  }, [loadDetections, isCheckingAuth])

  const loadPlaybackDetections = useCallback(async (recordingId: string, tok: string) => {
    setPlaybackDetectionsLoading(true)
    try {
      const all: DetectionDto[] = []
      let offset = 0
      const pageSize = 200
      let total = 0
      do {
        const page = await fetchDetections({
          token: tok,
          recordingSegmentId: recordingId,
          limit: pageSize,
          offset,
        })
        total = page.total
        all.push(...page.items)
        offset += page.items.length
        if (page.items.length === 0) break
      } while (all.length < total && offset < 2000)
      setPlaybackDetections(all)
    } catch {
      setPlaybackDetections([])
    } finally {
      setPlaybackDetectionsLoading(false)
    }
  }, [])

  const openPlayback = useCallback(
    async (
      recordingId: string,
      opts?: {
        seekSec?: number | null
        entryContext?: PlaybackEntryContext
        segmentStartIso?: string | null
      },
    ) => {
      const t = getSurveillanceAccessTokenOrNull()
      if (!t) {
        setError(loading ? "Connecting to surveillance API…" : "Not authenticated with surveillance API yet.")
        return
      }
      setError(null)
      try {
        pendingSeekSecRef.current = opts?.seekSec ?? null
        setPlaybackEntryContext(opts?.entryContext ?? { mode: "normal" })
        setActiveSegmentStart(opts?.segmentStartIso ?? null)
        const pb = await fetchRecordingPlaybackUrl(t, recordingId, 2)
        setPlaybackUrl(pb.url)
        setActiveRecordingId(recordingId)
        void loadPlaybackDetections(recordingId, t)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Playback failed.")
        setPlaybackUrl(null)
        setActiveRecordingId(null)
        pendingSeekSecRef.current = null
        setPlaybackDetections([])
        setPlaybackEntryContext({ mode: "normal" })
      }
    },
    [getSurveillanceAccessTokenOrNull, loadPlaybackDetections, loading],
  )

  const playFromDetection = useCallback(
    async (detectionId: string, segmentStartIso?: string | null) => {
      const t = getSurveillanceAccessTokenOrNull()
      if (!t) {
        setError(loading ? "Connecting to surveillance API…" : "Not authenticated with surveillance API yet.")
        return
      }
      setPlaybackLoadingId(detectionId)
      setError(null)
      try {
        const pb = await fetchDetectionPlaybackUrl(t, detectionId, 2)
        await openPlayback(pb.recording_id, {
          seekSec: pb.timestamp_offset_ms / 1000.0,
          entryContext: {
            mode: "detection",
            detectionId: pb.detection_id,
            offsetMs: pb.timestamp_offset_ms,
          },
          segmentStartIso: segmentStartIso ?? pb.absolute_event_time,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Playback failed.")
        setPlaybackUrl(null)
        setActiveRecordingId(null)
        pendingSeekSecRef.current = null
        setPlaybackDetections([])
        setPlaybackEntryContext({ mode: "normal" })
      } finally {
        setPlaybackLoadingId(null)
      }
    },
    [getSurveillanceAccessTokenOrNull, loading, openPlayback],
  )

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const useInitialHighSeverityFeed =
      useInitialHighSeverityFeedRef.current && severityFilter === "all" && !query

    const filtered = visibleEvents.filter((event) => {
      const matchesFilter = filter === "all" || event.status === filter
      const matchesSeverity = useInitialHighSeverityFeed
        ? event.severity === "critical" || event.severity === "high"
        : severityFilter === "all" || event.severity === severityFilter
      const matchesSearch =
        !query ||
        event.title.toLowerCase().includes(query) ||
        event.description.toLowerCase().includes(query) ||
        event.location.toLowerCase().includes(query) ||
        event.camera.toLowerCase().includes(query)
      return matchesFilter && matchesSeverity && matchesSearch
    })

    const sorted = sortEventsBySeverityThenTime(filtered)

    return useInitialHighSeverityFeed
      ? sorted.slice(0, INITIAL_HIGH_SEVERITY_FEED_LIMIT)
      : sorted
  }, [visibleEvents, filter, severityFilter, searchQuery])

  const EVENT_LIST_VISIBLE_COUNT = 5
  const eventItemMeasureRef = useRef<HTMLDivElement>(null)
  const [eventListMaxHeight, setEventListMaxHeight] = useState<number | undefined>(undefined)

  const syncEventListHeight = useCallback(() => {
    const sample = eventItemMeasureRef.current
    if (!sample || filteredEvents.length === 0) {
      setEventListMaxHeight(undefined)
      return
    }
    const gapPx = 8
    setEventListMaxHeight(sample.offsetHeight * EVENT_LIST_VISIBLE_COUNT + gapPx * (EVENT_LIST_VISIBLE_COUNT - 1))
  }, [filteredEvents.length])

  useEffect(() => {
    if (viewMode !== "timeline") return
    syncEventListHeight()
    const sample = eventItemMeasureRef.current
    const ro = sample ? new ResizeObserver(() => syncEventListHeight()) : null
    if (sample && ro) ro.observe(sample)
    window.addEventListener("resize", syncEventListHeight)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", syncEventListHeight)
    }
  }, [viewMode, syncEventListHeight, filteredEvents])

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-700 border-red-300 font-semibold"
      case "high":
        return "bg-orange-100 text-orange-700 border-orange-300 font-semibold"
      case "medium":
        return "bg-amber-100 text-amber-800 border-amber-300 font-semibold"
      default:
        return "bg-muted text-muted-foreground border-border"
    }
  }

  const getEventIcon = (type: string) => {
    if (type.includes("Vehicle") || type.includes("Traffic") || type.includes("Car")) {
      return <Car className="w-4 h-4" />
    }
    if (type.includes("Security") || type.includes("Alert")) {
      return <Shield className="w-4 h-4" />
    }
    if (
      type.includes("Crowd") ||
      type.includes("Altercation") ||
      type.includes("Human") ||
      type.includes("Suspicious")
    ) {
      return <Users className="w-4 h-4" />
    }
    if (type.includes("Suspicious")) {
      return <Eye className="w-4 h-4" />
    }
    return <AlertTriangle className="w-4 h-4" />
  }

  const handleTakeAction = (eventId: string, action: string) => {
    console.log(`Taking action: ${action} for event: ${eventId}`)
    setShowActionMenu(null)

    const actionMessages = {
      acknowledge: "Event marked as acknowledged",
      escalate: "Event escalated to higher authority",
      dispatch: "Patrol unit has been notified",
      export: "Evidence clip exported successfully",
      pin: "Event pinned to dashboard",
    }

    setActionFeedback({
      eventId,
      action,
      message: actionMessages[action as keyof typeof actionMessages] || "Action completed",
    })

    setTimeout(() => setActionFeedback(null), 3000)
  }

  const handleViewCamera = () => {
    router.replace("/?section=feeds")
  }

  const handlePlayback = (detectionId: string) => {
    const ev = events.find((e) => e.detectionId === detectionId)
    void playFromDetection(detectionId, ev?.absoluteEventTime ?? null)
  }

  const handleDeleteEvent = (eventId: string) => {
    setDismissedEventIds((prev) => {
      const next = new Set(prev)
      next.add(eventId)
      persistDismissedEventIds(next)
      return next
    })
    setShowActionMenu((current) => (current === eventId ? null : current))
  }

  const summaryInsight =
    events.length === 0
      ? "No medium, high, or critical detection events in the last 7 days. Events appear after offline AI scans complete on stored recordings."
      : visibleEvents.length === 0
        ? "All visible events have been dismissed from the dashboard."
        : `Monitoring ${visibleEvents.length} detection-based event(s) from the last 7 days — ${criticalCount} critical, ${highCount} high, ${mediumCount} medium priority.`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Events & Alerts</h1>
          <p className="text-muted-foreground">AI-driven notifications from offline recording detections</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => void loadDetections()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="secondary">
            <Bell className="w-4 h-4 mr-2" />
            Notifications
          </Button>
          <Button variant="secondary">
            <BellRing className="w-4 h-4 mr-2" />
            Live Alerts
          </Button>
        </div>
      </div>

      {/* AI Summary Card */}
      <Card className="surface-panel border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-400" />
            AI Event Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
              <div className="text-sm text-muted-foreground">Critical Events</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{highCount}</div>
              <div className="text-sm text-muted-foreground">High Priority</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-600">{mediumCount}</div>
              <div className="text-sm text-muted-foreground">Medium Priority</div>
            </div>
          </div>
          <div className="mt-4 p-3 rounded-lg border border-purple-200/80 bg-purple-50/80">
            <p className="text-sm text-foreground">
              <strong>AI Insight:</strong> {summaryInsight}
            </p>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {(loading || isCheckingAuth) && events.length === 0 && (
        <p className="text-sm text-muted-foreground" role="status">
          Loading detections from surveillance API…
        </p>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={severityFilter}
            onValueChange={(value) => {
              useInitialHighSeverityFeedRef.current = false
              setSeverityFilter(value)
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severity</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "timeline" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("timeline")}
          >
            Timeline
          </Button>
          <Button
            variant={viewMode === "clusters" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("clusters")}
          >
            Clusters
          </Button>
        </div>
      </div>

      {/* Action Feedback */}
      {actionFeedback && (
        <div className="fixed top-4 right-4 z-50">
          <Card className="border-green-300 bg-green-50 shadow-[var(--shadow-panel)]">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-800">{actionFeedback.message}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Playback — same pattern as recordings-history.tsx */}
      {playbackUrl && activeRecordingId && (
        <Card className="surface-panel border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Event Playback</CardTitle>
            <CardDescription className="text-xs">
              Segment {activeRecordingId}.
              {playbackDetectionsLoading
                ? " Loading detection data…"
                : ` ${playbackDetections.length} detection(s) indexed.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecordingPlaybackPlayer
              playbackUrl={playbackUrl}
              recordingId={activeRecordingId}
              detections={playbackDetections}
              pendingSeekSec={pendingSeekSecRef.current}
              entryContext={playbackEntryContext}
              segmentStartIso={activeSegmentStart}
              onSeekApplied={() => {
                pendingSeekSecRef.current = null
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Event Clusters View */}
      {viewMode === "clusters" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">AI Event Clusters</h2>
          <Card className="surface-panel">
            <CardContent className="py-12 text-center">
              <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                AI event clustering is not available for detection-based events yet.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Timeline View */}
      {viewMode === "timeline" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Event Timeline</h2>
            <Badge variant="secondary">{filteredEvents.length} events</Badge>
          </div>

          {filteredEvents.length > 0 && (
            <div
              className="recordings-table-scroll grid grid-cols-1 md:grid-cols-2 gap-2 overflow-y-auto"
              style={eventListMaxHeight != null ? { maxHeight: eventListMaxHeight } : undefined}
            >
              {filteredEvents.map((event, index) => (
                <div
                  key={event.id}
                  ref={index === 0 ? eventItemMeasureRef : undefined}
                  className="h-full min-h-0"
                >
                  <Card className="surface-panel h-full flex flex-col transition-colors hover:shadow-[var(--shadow-elevated)]">
                    <CardContent className="flex flex-1 flex-col gap-2 p-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            event.severity === "critical"
                              ? "bg-red-100"
                              : event.severity === "high"
                                ? "bg-orange-100"
                                : "bg-amber-100"
                          }`}
                        >
                          {getEventIcon(event.type)}
                        </div>
                        <h3 className="min-w-0 flex-1 font-semibold leading-tight text-foreground">
                          {event.title}
                        </h3>
                        <Badge
                          variant="outline"
                          className={`shrink-0 capitalize ${getSeverityColor(event.severity)}`}
                        >
                          {event.severity}
                        </Badge>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Delete event"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteEvent(event.id)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="flex flex-1 gap-2.5">
                        <div className="flex min-w-0 flex-1 flex-col">
                          <p className="mb-1 line-clamp-2 text-sm text-muted-foreground">{event.description}</p>

                          <div className="mt-auto space-y-0.5 text-sm">
                            <div className="flex items-center gap-1 min-w-0">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate text-foreground">{event.camera}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="text-foreground">{event.timestamp}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Zap className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="text-foreground">
                                Ai Confidence: {Math.round(event.aiConfidence * 100)}%
                              </span>
                            </div>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleViewCamera()
                                }}
                              >
                                <Eye className="mr-1.5 h-3.5 w-3.5" />
                                View Live
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs"
                                disabled={playbackLoadingId === event.detectionId}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handlePlayback(event.detectionId)
                                }}
                              >
                                <Play className="mr-1.5 h-3.5 w-3.5" />
                                {playbackLoadingId === event.detectionId ? "Loading…" : "Playback"}
                              </Button>
                              <div className="relative">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-blue-500/30 bg-blue-500/20 px-2.5 text-xs text-blue-400 hover:bg-blue-500/30"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setShowActionMenu(showActionMenu === event.id ? null : event.id)
                                  }}
                                >
                                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                                  Take Action
                                </Button>

                                {showActionMenu === event.id && (
                                  <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-card shadow-[var(--shadow-elevated)]">
                                    <div className="p-1">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full justify-start text-left hover:bg-muted"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleTakeAction(event.id, "acknowledge")
                                        }}
                                      >
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        Acknowledge
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full justify-start text-left hover:bg-muted"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleTakeAction(event.id, "escalate")
                                        }}
                                      >
                                        <ArrowUp className="mr-2 h-4 w-4" />
                                        Escalate
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full justify-start text-left hover:bg-muted"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleTakeAction(event.id, "dispatch")
                                        }}
                                      >
                                        <Send className="mr-2 h-4 w-4" />
                                        Dispatch
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full justify-start text-left hover:bg-muted"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleTakeAction(event.id, "export")
                                        }}
                                      >
                                        <Download className="mr-2 h-4 w-4" />
                                        Export Clip
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="w-full justify-start text-left hover:bg-muted"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleTakeAction(event.id, "pin")
                                        }}
                                      >
                                        <Pin className="mr-2 h-4 w-4" />
                                        Pin to Dashboard
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                        </div>

                        <div className="w-[180px] shrink-0 self-stretch xl:w-[220px]">
                          <div className="relative h-full min-h-[101px] overflow-hidden rounded-md border border-border bg-muted/30 xl:min-h-[124px]">
                            {event.previewFrame ? (
                              <img
                                src={event.previewFrame}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-[10px] text-muted-foreground">No Preview</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}

          {filteredEvents.length === 0 && !loading && !isCheckingAuth && (
            <Card className="surface-panel">
              <CardContent className="py-12 text-center">
                <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No events found</h3>
                <p className="text-muted-foreground">
                  {events.length === 0
                    ? "No medium, high, or critical detection events in the last 7 days. Record footage and wait for the offline AI scan to complete."
                    : visibleEvents.length === 0
                      ? "All events have been dismissed from the dashboard."
                      : "Try adjusting your filters or search criteria."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

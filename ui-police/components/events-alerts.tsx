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
  Camera,
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
import { eventBannerLabel } from "@/lib/detection-overlay-utils"
import {
  RecordingPlaybackPlayer,
  type PlaybackEntryContext,
} from "@/components/recording-playback-player"

type EventSeverity = "medium" | "high" | "critical"

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

function groupDetectionsByFrame(detections: DetectionDto[]): DetectionDto[][] {
  const map = new Map<string, DetectionDto[]>()
  for (const d of detections) {
    const key = `${d.recording_segment_id}:${d.timestamp_offset_ms}`
    const group = map.get(key)
    if (group) group.push(d)
    else map.set(key, [d])
  }
  return Array.from(map.values())
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

function buildDescription(group: DetectionDto[]): string {
  const types = [...new Set(group.map((d) => d.object_type))]
  const typeList = types.join(", ")
  return `${group.length} detection(s) at this moment — objects: ${typeList}`
}

function buildDisplayEvents(
  detections: DetectionDto[],
  cameraNameById: Map<string, string>,
): DisplayEvent[] {
  const events: DisplayEvent[] = []
  for (const group of groupDetectionsByFrame(detections)) {
    const label = eventBannerLabel(group)
    if (!label) continue
    const severity = severityFromLabel(label)
    if (severity === "low") continue

    const anchor = [...group].sort((a, b) => b.confidence - a.confidence)[0]
    if (!anchor) continue

    const cameraLabel = cameraNameById.get(anchor.camera_id) ?? anchor.camera_id

    events.push({
      id: anchor.id,
      detectionId: anchor.id,
      recordingSegmentId: anchor.recording_segment_id,
      type: label,
      severity,
      title: label,
      description: buildDescription(group),
      camera: cameraLabel,
      location: cameraLabel,
      timestamp: formatEventTime(anchor.absolute_event_time),
      absoluteEventTime: anchor.absolute_event_time,
      aiConfidence: Math.max(...group.map((d) => d.confidence)),
      status: "new",
    })
  }

  return events.sort(
    (a, b) => new Date(b.absoluteEventTime).getTime() - new Date(a.absoluteEventTime).getTime(),
  )
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraNameById, setCameraNameById] = useState<Map<string, string>>(new Map())

  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null)
  const pendingSeekSecRef = useRef<number | null>(null)
  const [playbackDetections, setPlaybackDetections] = useState<DetectionDto[]>([])
  const [playbackDetectionsLoading, setPlaybackDetectionsLoading] = useState(false)
  const [playbackEntryContext, setPlaybackEntryContext] = useState<PlaybackEntryContext>({ mode: "normal" })
  const [activeSegmentStart, setActiveSegmentStart] = useState<string | null>(null)
  const [playbackLoadingId, setPlaybackLoadingId] = useState<string | null>(null)

  const getSurveillanceAccessTokenOrNull = useCallback((): string | null => {
    if (surveillanceTokenRef.current) return surveillanceTokenRef.current
    if (loading) return null
    return token
  }, [loading, token])

  const events = useMemo(
    () => buildDisplayEvents(rawDetections, cameraNameById),
    [rawDetections, cameraNameById],
  )

  const criticalCount = useMemo(() => events.filter((e) => e.severity === "critical").length, [events])
  const highCount = useMemo(() => events.filter((e) => e.severity === "high").length, [events])
  const mediumCount = useMemo(() => events.filter((e) => e.severity === "medium").length, [events])

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

  const filteredEvents = events.filter((event) => {
    const matchesFilter = filter === "all" || event.status === filter
    const matchesSeverity = severityFilter === "all" || event.severity === severityFilter
    const matchesSearch =
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.camera.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesFilter && matchesSeverity && matchesSearch
  })

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-red-100 text-red-700 border-red-300"
      case "acknowledged":
        return "bg-amber-100 text-amber-800 border-amber-300"
      case "resolved":
        return "bg-green-100 text-green-700 border-green-300"
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

  const summaryInsight =
    events.length === 0
      ? "No medium, high, or critical detection events in the last 7 days. Events appear after offline AI scans complete on stored recordings."
      : `Monitoring ${events.length} detection-based event(s) from the last 7 days — ${criticalCount} critical, ${highCount} high, ${mediumCount} medium priority.`

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

      {loading && events.length === 0 && (
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
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Event Timeline</h2>
            <Badge variant="secondary">{filteredEvents.length} events</Badge>
          </div>

          {filteredEvents.map((event) => (
            <Card
              key={event.id}
              className={`surface-panel transition-colors hover:shadow-[var(--shadow-elevated)] ${
                event.severity === "critical" ? "ring-2 ring-red-400/50" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      event.severity === "critical"
                        ? "bg-red-100"
                        : event.severity === "high"
                          ? "bg-orange-100"
                          : "bg-amber-100"
                    }`}
                  >
                    {getEventIcon(event.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-foreground">{event.title}</h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getSeverityColor(event.severity)}>
                          {event.severity}
                        </Badge>
                        <Badge variant="outline" className={getStatusColor(event.status)}>
                          {event.status}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-muted-foreground text-sm mb-3">{event.description}</p>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground">{event.camera}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground">{event.location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground">{event.timestamp}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground">AI: {Math.round(event.aiConfidence * 100)}%</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleViewCamera()
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Camera
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={playbackLoadingId === event.detectionId}
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePlayback(event.detectionId)
                        }}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        {playbackLoadingId === event.detectionId ? "Loading…" : "Playback"}
                      </Button>
                      <div className="relative">
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-blue-500/20 border-blue-500/30 text-blue-400 hover:bg-blue-500/30"
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowActionMenu(showActionMenu === event.id ? null : event.id)
                          }}
                        >
                          <AlertTriangle className="w-4 h-4 mr-2" />
                          Take Action
                        </Button>

                        {showActionMenu === event.id && (
                          <div className="absolute top-full left-0 mt-1 w-48 rounded-lg border border-border bg-card shadow-[var(--shadow-elevated)] z-50">
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
                                <CheckCircle className="w-4 h-4 mr-2" />
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
                                <ArrowUp className="w-4 h-4 mr-2" />
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
                                <Send className="w-4 h-4 mr-2" />
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
                                <Download className="w-4 h-4 mr-2" />
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
                                <Pin className="w-4 h-4 mr-2" />
                                Pin to Dashboard
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredEvents.length === 0 && !loading && (
            <Card className="surface-panel">
              <CardContent className="py-12 text-center">
                <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No events found</h3>
                <p className="text-muted-foreground">
                  {events.length === 0
                    ? "No medium, high, or critical detection events in the last 7 days. Record footage and wait for the offline AI scan to complete."
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

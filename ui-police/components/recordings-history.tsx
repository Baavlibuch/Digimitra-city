"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, RefreshCw, Search, Video, Trash2, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/components/auth-provider"
import {
  fetchCameras,
  fetchRecordings,
  fetchRecordingPlaybackUrl,
  fetchSurveillanceAccessToken,
  deleteRecording,
  fetchDetections,
  fetchDetectionPlaybackUrl,
  fetchSemanticSearch,
  fetchSemanticSearchStatus,
  isSemanticSearchOperational,
  shouldRetrySemanticStatusPoll,
  type CameraDto,
  type RecordingSegmentDto,
  type DetectionDto,
  type SemanticSearchHitDto,
  type SemanticSearchStatusDto,
} from "@/lib/surveillance-api"
import {
  RecordingPlaybackPlayer,
  type PlaybackEntryContext,
} from "@/components/recording-playback-player"
import { VideoFileUpload } from "@/components/video-file-upload"

function formatDt(iso: string | null | undefined) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "medium",
    })
  } catch {
    return iso
  }
}

function formatBytes(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function displayRecordingCameraName(
  row: RecordingSegmentDto,
  cameraNameById: Map<string, string>,
): string {
  const fromTable = cameraNameById.get(row.camera_id)
  const fromExtra =
    row.extra && typeof row.extra.camera_name === "string" ? row.extra.camera_name : null
  const resolved = fromTable ?? fromExtra ?? row.camera_id.slice(0, 8)
  if (resolved === "Uploaded video" || row.camera_id === "file-upload") return "Camera Rec"
  return resolved
}

function isUploadedSource(
  cameraId: string,
  cameraNameById: Map<string, string>,
  ingestSource?: string,
): boolean {
  return (
    cameraId === "file-upload" ||
    cameraNameById.get(cameraId) === "Uploaded video" ||
    ingestSource === "browser_file_upload"
  )
}

function isUploadedDetection(cameraId: string, cameraNameById: Map<string, string>): boolean {
  return isUploadedSource(cameraId, cameraNameById)
}

function buildUploadedCctvLabels(
  detections: DetectionDto[],
  cameraNameById: Map<string, string>,
  recordings: RecordingSegmentDto[] = [],
  semanticHits: SemanticSearchHitDto[] = [],
): Map<string, string> {
  const segmentFirstTime = new Map<string, string>()
  const consider = (segmentId: string, time: string) => {
    const existing = segmentFirstTime.get(segmentId)
    if (!existing || time < existing) {
      segmentFirstTime.set(segmentId, time)
    }
  }
  for (const d of detections) {
    if (!isUploadedDetection(d.camera_id, cameraNameById)) continue
    consider(d.recording_segment_id, d.absolute_event_time)
  }
  for (const r of recordings) {
    if (!isUploadedSource(r.camera_id, cameraNameById, r.ingest_source)) continue
    consider(r.id, r.start_time)
  }
  let semanticFallbackIdx = 0
  for (const h of semanticHits) {
    if (!isUploadedDetection(h.camera_id, cameraNameById)) continue
    if (!segmentFirstTime.has(h.recording_segment_id)) {
      consider(
        h.recording_segment_id,
        `9999-01-01T${String(semanticFallbackIdx).padStart(12, "0")}Z`,
      )
      semanticFallbackIdx++
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

function displaySemanticSearchCameraName(
  hit: SemanticSearchHitDto,
  cameraNameById: Map<string, string>,
  uploadedCctvBySegmentId: Map<string, string>,
): string {
  if (isUploadedDetection(hit.camera_id, cameraNameById)) {
    return uploadedCctvBySegmentId.get(hit.recording_segment_id) ?? "CCTV 1"
  }
  return cameraNameById.get(hit.camera_id) ?? hit.camera_id.slice(0, 8)
}

/** Local calendar day yyyy-mm-dd */
function localYmd(d: Date) {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" })
}

/** HH:mm for time input */
function localHm(d: Date) {
  const h = d.getHours()
  const m = d.getMinutes()
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/**
 * Build ISO UTC from separate date + time fields (browser-local).
 * Empty time → start of day for "start", end of day for "end".
 */
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

type RecordingsHistoryProps = {
  /** When incremented by the file-upload feature, reloads catalog without changing filters. */
  catalogRefreshTrigger?: number
  onUploaded?: () => void
}

export function RecordingsHistory({ catalogRefreshTrigger, onUploaded }: RecordingsHistoryProps = {}) {
  const { user, isCheckingAuth } = useAuth()
  const operator = (user?.username || "operator").trim() || "operator"

  const [token, setToken] = useState<string | null>(null)
  /** Same JWT as `token`, set synchronously when /api/v1/token returns so handlers work before React commits state. */
  const surveillanceTokenRef = useRef<string | null>(null)
  const [cameras, setCameras] = useState<CameraDto[]>([])
  const [cameraFilter, setCameraFilter] = useState<string>("all")
  const [startDate, setStartDate] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endDate, setEndDate] = useState("")
  const [endTime, setEndTime] = useState("")
  const [rows, setRows] = useState<RecordingSegmentDto[]>([])
  const [total, setTotal] = useState(0)
  const [detRows, setDetRows] = useState<DetectionDto[]>([])
  const [detTotal, setDetTotal] = useState(0)
  const [objectTypeFilter, setObjectTypeFilter] = useState<string>("all")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [semanticQuery, setSemanticQuery] = useState("")
  const [semanticLoading, setSemanticLoading] = useState(false)
  const [semanticError, setSemanticError] = useState<string | null>(null)
  const [semanticHits, setSemanticHits] = useState<SemanticSearchHitDto[]>([])
  /** From GET /semantic-search/status; null = unknown (probe failed or not loaded yet). */
  const [semanticStatus, setSemanticStatus] = useState<SemanticSearchStatusDto | null>(null)
  const [semanticStatusLoading, setSemanticStatusLoading] = useState(false)
  /** User-facing probe failure (auth/network/etc.); never substitute for Milvus "not configured". */
  const [semanticStatusFetchError, setSemanticStatusFetchError] = useState<string | null>(null)
  const semanticPollGenRef = useRef(0)
  const pendingSeekSecRef = useRef<number | null>(null)
  const [playbackDetections, setPlaybackDetections] = useState<DetectionDto[]>([])
  const [playbackDetectionsLoading, setPlaybackDetectionsLoading] = useState(false)
  const [playbackEntryContext, setPlaybackEntryContext] = useState<PlaybackEntryContext>({ mode: "normal" })
  const [activeSegmentStart, setActiveSegmentStart] = useState<string | null>(null)
  const recordingFiltersCardRef = useRef<HTMLDivElement>(null)
  const [pairedPanelHeight, setPairedPanelHeight] = useState<number | null>(null)

  const syncPairedPanelHeight = useCallback(() => {
    const el = recordingFiltersCardRef.current
    if (!el) return
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setPairedPanelHeight(el.offsetHeight)
    } else {
      setPairedPanelHeight(null)
    }
  }, [])

  useEffect(() => {
    const el = recordingFiltersCardRef.current
    if (!el) return
    syncPairedPanelHeight()
    const ro = new ResizeObserver(() => syncPairedPanelHeight())
    ro.observe(el)
    window.addEventListener("resize", syncPairedPanelHeight)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", syncPairedPanelHeight)
    }
  }, [error, loading, syncPairedPanelHeight])

  const filtersRef = useRef({
    cameraFilter,
    startDate,
    startTime,
    endDate,
    endTime,
    objectTypeFilter,
  })
  filtersRef.current = { cameraFilter, startDate, startTime, endDate, endTime, objectTypeFilter }

  const refreshSemanticStatus = useCallback(async (surveillanceAccessToken?: string | null) => {
    setSemanticStatusLoading(true)
    setSemanticStatusFetchError(null)
    try {
      const s = await fetchSemanticSearchStatus({
        token: surveillanceAccessToken ?? undefined,
      })
      console.log("[recordings-history] semantic search status:", s)
      setSemanticStatus(s)
      if (isSemanticSearchOperational(s)) {
        setSemanticError(null)
      }
      return s
    } catch (e) {
      setSemanticStatus(null)
      const httpStatus =
        typeof e === "object" && e !== null && "status" in e ? (e as { status: number }).status : undefined
      const isNetwork =
        typeof e === "object" && e !== null && "kind" in e && (e as { kind?: string }).kind === "network"
      let message: string
      if (httpStatus === 401 || httpStatus === 403) {
        message =
          "Could not load semantic search status: authentication was rejected (HTTP " +
          String(httpStatus) +
          "). Fix login or the API token — this is not the same as Milvus being unconfigured."
      } else if (isNetwork) {
        message =
          "Could not reach the surveillance API for semantic search status (network). Retry when the API is up; search may still work once connected."
      } else if (e instanceof Error) {
        message = e.message
      } else {
        message = "Semantic search status could not be loaded."
      }
      setSemanticStatusFetchError(message)
      console.warn("[recordings-history] semantic search status request failed:", e)
      return null
    } finally {
      setSemanticStatusLoading(false)
    }
  }, [])

  /**
   * Surveillance API JWT (same source as recordings list / playback).
   * While `loading` is true, ignore stale `token` so a refresh never reuses a prior session's JWT.
   */
  const getSurveillanceAccessTokenOrNull = useCallback((): string | null => {
    if (surveillanceTokenRef.current) return surveillanceTokenRef.current
    if (loading) return null
    return token
  }, [loading, token])

  /** Re-probe while Milvus/index may still be warming after API startup (avoids stale configured=false). */
  useEffect(() => {
    if (isCheckingAuth) return
    const tok = getSurveillanceAccessTokenOrNull()
    if (!tok) return
    if (semanticStatusFetchError) return
    if (!shouldRetrySemanticStatusPoll(semanticStatus)) return

    const gen = ++semanticPollGenRef.current
    let cancelled = false
    const delaysMs = [0, 2000, 4000, 6000, 8000, 10000, 15000, 20000, 30000]

    const poll = async () => {
      for (const delayMs of delaysMs) {
        if (cancelled || semanticPollGenRef.current !== gen) return
        if (delayMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
        }
        if (cancelled || semanticPollGenRef.current !== gen) return
        const s = await refreshSemanticStatus(tok)
        if (cancelled || semanticPollGenRef.current !== gen) return
        if (isSemanticSearchOperational(s)) return
        if (s?.configured === false) return
      }
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [
    isCheckingAuth,
    token,
    loading,
    semanticStatus?.configured,
    semanticStatus?.index_ready,
    semanticStatusFetchError,
    refreshSemanticStatus,
    getSurveillanceAccessTokenOrNull,
  ])

  const cameraNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of cameras) m.set(c.id, c.name)
    return m
  }, [cameras])

  const uploadedDetectionCctvBySegmentId = useMemo(
    () => buildUploadedCctvLabels(detRows, cameraNameById, rows, semanticHits),
    [detRows, cameraNameById, rows, semanticHits],
  )

  const applyPreset = useCallback((preset: "24h" | "7d" | "today" | "clear") => {
    if (preset === "clear") {
      setStartDate("")
      setStartTime("")
      setEndDate("")
      setEndTime("")
      return
    }
    const now = new Date()
    if (preset === "today") {
      setStartDate(localYmd(now))
      setStartTime("00:00")
      setEndDate(localYmd(now))
      setEndTime("23:59")
      return
    }
    const end = now
    const start = new Date(now.getTime() - (preset === "24h" ? 24 : 24 * 7) * 60 * 60 * 1000)
    setStartDate(localYmd(start))
    setStartTime(localHm(start))
    setEndDate(localYmd(end))
    setEndTime(localHm(end))
  }, [])

  const load = useCallback(async () => {
    setError(null)
    setSemanticError(null)
    setLoading(true)
    surveillanceTokenRef.current = null
    const f = filtersRef.current
    let acquiredTok: string | null = null
    try {
      const tok = await fetchSurveillanceAccessToken(operator)
      acquiredTok = tok
      surveillanceTokenRef.current = tok
      setToken(tok)
      await refreshSemanticStatus(tok)
      const camList = await fetchCameras().catch(() => [])
      setCameras(camList)

      const startIso = combineLocalDateTimeToIso(f.startDate, f.startTime, "start")
      const endIso = combineLocalDateTimeToIso(f.endDate, f.endTime, "end")

      const list = await fetchRecordings({
        token: tok,
        cameraId: f.cameraFilter === "all" ? undefined : f.cameraFilter,
        start: startIso,
        end: endIso,
        limit: 100,
        offset: 0,
      })
      setRows(list.items)
      setTotal(list.total)

      const dlist = await fetchDetections({
        token: tok,
        cameraId: f.cameraFilter === "all" ? undefined : f.cameraFilter,
        objectType: f.objectTypeFilter === "all" ? undefined : f.objectTypeFilter,
        eventAfter: startIso,
        eventBefore: endIso,
        limit: 100,
        offset: 0,
      })
      setDetRows(dlist.items)
      setDetTotal(dlist.total)
    } catch (e) {
      if (!acquiredTok) {
        surveillanceTokenRef.current = null
        setToken(null)
      }
      setError(e instanceof Error ? e.message : "Failed to load recordings.")
      setRows([])
      setTotal(0)
      setDetRows([])
      setDetTotal(0)
    } finally {
      setLoading(false)
      const t = surveillanceTokenRef.current
      if (t) {
        void refreshSemanticStatus(t)
      }
    }
  }, [operator, refreshSemanticStatus])

  useEffect(() => {
    if (isCheckingAuth) return
    void load()
  }, [load, isCheckingAuth])

  const catalogRefreshSeenRef = useRef(0)
  useEffect(() => {
    if (catalogRefreshTrigger == null || catalogRefreshTrigger <= 0) return
    if (catalogRefreshTrigger === catalogRefreshSeenRef.current) return
    catalogRefreshSeenRef.current = catalogRefreshTrigger
    void load()
  }, [catalogRefreshTrigger, load])

  const loadPlaybackDetections = useCallback(async (recordingId: string, token: string) => {
    setPlaybackDetectionsLoading(true)
    try {
      const all: DetectionDto[] = []
      let offset = 0
      const pageSize = 200
      let total = 0
      do {
        const page = await fetchDetections({
          token,
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

  const openPlayback = async (
    recordingId: string,
    opts?: {
      seekSec?: number | null
      entryContext?: PlaybackEntryContext
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
      const seg = rows.find((r) => r.id === recordingId)
      setActiveSegmentStart(seg?.start_time ?? null)
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
  }

  const play = async (id: string) => {
    await openPlayback(id, { seekSec: null, entryContext: { mode: "normal" } })
  }

  const runSemanticSearch = async () => {
    const t = getSurveillanceAccessTokenOrNull()
    if (!t) {
      setSemanticError(loading ? "Connecting to surveillance API…" : "Not authenticated with surveillance API yet.")
      return
    }
    if (semanticStatus !== null && semanticStatus.configured === false) {
      setSemanticError(semanticStatus.detail || "Semantic search is not available on this server.")
      return
    }
    const q = semanticQuery.trim()
    if (!q) {
      setSemanticError("Enter a short description to search.")
      return
    }
    setSemanticError(null)
    setSemanticLoading(true)
    try {
      const res = await fetchSemanticSearch({
        token: t,
        query: q,
        top_k: 20,
        cameraId: cameraFilter === "all" ? undefined : cameraFilter,
      })
      if (!res.enabled) {
        setSemanticHits([])
        setSemanticError(res.detail || "Semantic search is not available on this server.")
        return
      }
      setSemanticHits(res.results)
      if (res.results.length === 0) {
        setSemanticError(
          res.detail || "No matches. Ensure the AI worker has indexed segments (CLIP + Milvus) after recordings exist.",
        )
      } else {
        setSemanticError(null)
      }
    } catch (e) {
      setSemanticHits([])
      setSemanticError(e instanceof Error ? e.message : "Semantic search failed.")
    } finally {
      setSemanticLoading(false)
    }
  }

  const playFromSemantic = async (hit: SemanticSearchHitDto) => {
    await openPlayback(hit.recording_segment_id, {
      seekSec: hit.timestamp_offset_ms / 1000.0,
      entryContext: {
        mode: "semantic",
        evidence: {
          query: semanticQuery.trim(),
          similarity: hit.similarity,
          offsetMs: hit.timestamp_offset_ms,
        },
      },
    })
  }

  const playFromDetection = async (detectionId: string) => {
    const t = getSurveillanceAccessTokenOrNull()
    if (!t) {
      setError(loading ? "Connecting to surveillance API…" : "Not authenticated with surveillance API yet.")
      return
    }
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
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed.")
      setPlaybackUrl(null)
      setActiveRecordingId(null)
      pendingSeekSecRef.current = null
      setPlaybackDetections([])
      setPlaybackEntryContext({ mode: "normal" })
    }
  }

  const remove = async (id: string) => {
    const t = getSurveillanceAccessTokenOrNull()
    if (!t) {
      setError(loading ? "Connecting to surveillance API…" : "Not authenticated with surveillance API yet.")
      return
    }
    if (!window.confirm("Delete this recording from storage and the catalog? This cannot be undone.")) {
      return
    }
    setError(null)
    setDeletingId(id)
    try {
      await deleteRecording(t, id)
      if (activeRecordingId === id) {
        setPlaybackUrl(null)
        setActiveRecordingId(null)
        pendingSeekSecRef.current = null
        setPlaybackDetections([])
        setPlaybackEntryContext({ mode: "normal" })
      }
      setRows((prev) => prev.filter((r) => r.id !== id))
      setTotal((n) => Math.max(0, n - 1))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.")
    } finally {
      setDeletingId(null)
    }
  }

  const showSemanticNotConfigured =
    !semanticStatusLoading &&
    semanticStatus !== null &&
    semanticStatus.configured === false
  const showSemanticIndexWarning =
    !semanticStatusLoading &&
    semanticStatus !== null &&
    semanticStatus.configured === true &&
    semanticStatus.index_ready === false &&
    Boolean((semanticStatus.detail ?? "").trim())
  const showSemanticWarming =
    !semanticStatusLoading &&
    semanticStatus !== null &&
    semanticStatus.configured === true &&
    semanticStatus.index_ready === false &&
    !showSemanticIndexWarning

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-12 lg:gap-5">
      <Card
        className="surface-panel flex flex-col gap-0 overflow-hidden py-0 lg:col-span-4"
        style={
          pairedPanelHeight != null
            ? { height: pairedPanelHeight, maxHeight: pairedPanelHeight }
            : undefined
        }
      >
        <CardHeader className="shrink-0 space-y-1 px-4 pb-1 pt-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-amber-400" />
            Semantic visual search
          </CardTitle>
          <CardDescription className="text-xs leading-snug">
            CLIP scene search — opens playback and seeks to the match.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3 pt-0">
          <div className="flex shrink-0 flex-col gap-2">
            <Input
              type="search"
              placeholder="hand, crowd, bicycle…"
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSemanticSearch()
              }}
              className="h-9 w-full text-sm"
              aria-label="Semantic search query"
              disabled={
                semanticLoading ||
                semanticStatusLoading ||
                !getSurveillanceAccessTokenOrNull() ||
                (semanticStatus !== null && semanticStatus.configured === false)
              }
            />
            <Button
              type="button"
              size="sm"
              className="h-9 w-full shrink-0"
              disabled={
                semanticLoading ||
                semanticStatusLoading ||
                !getSurveillanceAccessTokenOrNull() ||
                (semanticStatus !== null && semanticStatus.configured === false)
              }
              onClick={() => void runSemanticSearch()}
            >
              {semanticLoading ? "Searching…" : "Search"}
            </Button>
          </div>
          <div className="recordings-table-scroll surface-inset min-h-0 flex-1 overflow-y-auto text-sm">
            {semanticStatusLoading && (
              <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
                Checking semantic search capability on the server…
              </p>
            )}
            {semanticStatusFetchError && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs text-amber-800" role="alert">
                <span>{semanticStatusFetchError}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-amber-100 hover:bg-amber-500/10"
                  disabled={semanticStatusLoading}
                  onClick={() => {
                    void refreshSemanticStatus(getSurveillanceAccessTokenOrNull())
                  }}
                >
                  Retry status
                </Button>
              </p>
            )}
            {showSemanticNotConfigured && (
              <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
                {semanticStatus!.detail?.trim() || "Semantic search is not configured for this server."}
              </p>
            )}
            {showSemanticIndexWarning && (
              <p className="px-3 py-2 text-xs text-amber-800" role="status">
                {semanticStatus!.detail}
              </p>
            )}
            {showSemanticWarming && (
              <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
                Semantic search index is still starting on the server…
              </p>
            )}
            {semanticError && (
              <p className="px-3 py-2 text-xs text-amber-800" role="status">
                {semanticError}
              </p>
            )}
            {semanticHits.length > 0 ? (
              <ul className="divide-y divide-border/70">
                {semanticHits.map((h) => (
                  <li key={`${h.recording_segment_id}-${h.timestamp_offset_ms}-${h.vector_id ?? ""}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {displaySemanticSearchCameraName(
                          h,
                          cameraNameById,
                          uploadedDetectionCctvBySegmentId,
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate" title={h.recording_segment_id}>
                        {(h.timestamp_offset_ms / 1000).toFixed(1)}s · score {(h.similarity * 100).toFixed(0)}%
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => void playFromSemantic(h)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Play
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              !semanticStatusLoading &&
              !semanticError &&
              !semanticStatusFetchError &&
              !showSemanticNotConfigured &&
              !showSemanticIndexWarning &&
              !showSemanticWarming && (
                <p className="px-3 py-2 text-xs text-muted-foreground">Results appear here after you search.</p>
              )
            )}
          </div>
        </CardContent>
      </Card>

      <div ref={recordingFiltersCardRef} className="lg:col-span-8">
      <Card className="surface-panel h-full gap-0 py-0">
        <CardHeader className="space-y-1 px-4 pb-1 pt-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Video className="h-4 w-4 text-primary" />
            Recording history
          </CardTitle>
          <CardDescription className="text-xs leading-snug">
            Quick range or date filter · signed playback URLs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-3 pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="secondary" size="sm" className="filter-pill h-7 px-3 text-xs" onClick={() => applyPreset("24h")}>
                Last 24h
              </Button>
              <Button type="button" variant="secondary" size="sm" className="filter-pill h-7 px-3 text-xs" onClick={() => applyPreset("today")}>
                Today
              </Button>
              <Button type="button" variant="ghost" size="sm" className="filter-pill h-7 px-3 text-xs" onClick={() => applyPreset("clear")}>
                Clear
              </Button>
            </div>
            <VideoFileUpload variant="compact" onUploaded={onUploaded} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Camera</Label>
              <Select value={cameraFilter} onValueChange={setCameraFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All cameras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cameras</SelectItem>
                  {cameras.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Object (AI)</Label>
              <Select value={objectTypeFilter} onValueChange={setObjectTypeFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="person">person</SelectItem>
                  <SelectItem value="bicycle">bicycle</SelectItem>
                  <SelectItem value="car">car</SelectItem>
                  <SelectItem value="motorcycle">motorcycle</SelectItem>
                  <SelectItem value="bus">bus</SelectItem>
                  <SelectItem value="truck">truck</SelectItem>
                  <SelectItem value="backpack">backpack</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="rec-from-date" className="text-[11px] text-muted-foreground">
                From date
              </Label>
              <Input
                id="rec-from-date"
                type="date"
                aria-label="From date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 min-h-8 cursor-pointer text-xs px-2"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rec-to-date" className="text-[11px] text-muted-foreground">
                To date
              </Label>
              <Input
                id="rec-to-date"
                type="date"
                aria-label="To date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 min-h-8 cursor-pointer text-xs px-2"
              />
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            className="h-8 w-full text-xs"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Apply
              </span>
            )}
          </Button>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Showing {rows.length} of {total} segments
          </p>
        </CardContent>
      </Card>
      </div>
      </div>

      {playbackUrl && activeRecordingId && (
        <Card className="surface-panel border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Playback</CardTitle>
            <CardDescription className="text-xs">
              Segment {activeRecordingId}.
              {playbackDetectionsLoading
                ? " Loading detection data…"
                : ` ${playbackDetections.length} detection(s) indexed (not shown on video).`}
              URL expires quickly; press Play on another row to refresh.
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

      <Card className="surface-panel overflow-hidden">
        <CardContent className="p-0">
          <div className="recordings-table-scroll max-h-[15rem] overflow-auto">
            <table className="enterprise-table w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="min-w-28">Camera</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Duration</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th className="whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      No recordings in this range. Live webcam segments appear here after upload completes.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const cameraName = displayRecordingCameraName(r, cameraNameById)
                    return (
                      <tr key={r.id}>
                        <td className="p-2 align-top min-w-28">
                          <div
                            className="font-medium text-foreground whitespace-nowrap overflow-hidden text-ellipsis"
                            title={cameraName}
                          >
                            {cameraName}
                          </div>
                        </td>
                        <td className="p-2 align-top whitespace-nowrap">{formatDt(r.start_time)}</td>
                        <td className="p-2 align-top whitespace-nowrap">{formatDt(r.end_time)}</td>
                        <td className="p-2 align-top">
                          {r.duration_seconds != null ? `${r.duration_seconds.toFixed(0)}s` : "—"}
                        </td>
                        <td className="p-2 align-top">
                          <Badge variant="outline" className="text-xs font-normal">
                            {r.file_type.includes("webm") ? "WebM" : r.file_type.includes("mp4") ? "MP4" : r.file_type}
                          </Badge>
                        </td>
                        <td className="p-2 align-top">{formatBytes(r.size_bytes)}</td>
                        <td className="p-2 align-top">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-primary/30 text-primary hover:bg-primary/5"
                              onClick={() => void play(r.id)}
                            >
                              <Play className="h-3.5 w-3.5 mr-1" />
                              Play
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-destructive/35 text-destructive hover:bg-destructive/5"
                              disabled={deletingId === r.id}
                              onClick={() => void remove(r.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              {deletingId === r.id ? "…" : "Delete"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="surface-panel overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Object detections (AI processing)</CardTitle>
          <CardDescription className="text-xs">
            YOLOv8n on stored segments. Showing {detRows.length} of {detTotal} in range — run the ai-processor service to
            populate results.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="recordings-table-scroll max-h-[15rem] overflow-auto">
            <table className="enterprise-table w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>Camera</th>
                  <th>Type</th>
                  <th>Confidence</th>
                  <th>Event time</th>
                  <th>Offset</th>
                  <th className="whitespace-nowrap">Playback</th>
                </tr>
              </thead>
              <tbody>
                {detRows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No detections in this range. After the AI worker scans recordings, rows appear here; use the same
                      date and camera filters as above.
                    </td>
                  </tr>
                ) : (
                  detRows.map((d) => (
                    <tr key={d.id}>
                      <td className="p-3 align-top">
                        {displayDetectionCameraName(d, cameraNameById, uploadedDetectionCctvBySegmentId)}
                      </td>
                      <td className="p-3 align-top">
                        <Badge variant="outline" className="text-xs font-normal">
                          {d.object_type}
                        </Badge>
                      </td>
                      <td className="p-3 align-top">{d.confidence.toFixed(2)}</td>
                      <td className="p-3 align-top whitespace-nowrap">{formatDt(d.absolute_event_time)}</td>
                      <td className="p-3 align-top text-muted-foreground">{(d.timestamp_offset_ms / 1000).toFixed(1)}s</td>
                      <td className="p-3 align-top">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-primary/30 text-primary hover:bg-primary/5"
                          onClick={() => void playFromDetection(d.id)}
                        >
                          <Play className="h-3.5 w-3.5 mr-1" />
                          Play clip
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

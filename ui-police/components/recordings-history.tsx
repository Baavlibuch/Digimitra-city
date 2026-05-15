"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, RefreshCw, Search, Video, HardDrive, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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

export function RecordingsHistory() {
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
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const pendingSeekSecRef = useRef<number | null>(null)

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

  const play = async (id: string) => {
    const t = getSurveillanceAccessTokenOrNull()
    if (!t) {
      setError(loading ? "Connecting to surveillance API…" : "Not authenticated with surveillance API yet.")
      return
    }
    setError(null)
    try {
      pendingSeekSecRef.current = null
      const pb = await fetchRecordingPlaybackUrl(t, id, 2)
      setPlaybackUrl(pb.url)
      setActiveRecordingId(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed.")
      setPlaybackUrl(null)
      setActiveRecordingId(null)
      pendingSeekSecRef.current = null
    }
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

  const playFromSemantic = async (recordingId: string, offsetMs: number) => {
    const t = getSurveillanceAccessTokenOrNull()
    if (!t) {
      setError(loading ? "Connecting to surveillance API…" : "Not authenticated with surveillance API yet.")
      return
    }
    setError(null)
    try {
      const pb = await fetchRecordingPlaybackUrl(t, recordingId, 2)
      pendingSeekSecRef.current = offsetMs / 1000.0
      setPlaybackUrl(pb.url)
      setActiveRecordingId(recordingId)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed.")
      setPlaybackUrl(null)
      setActiveRecordingId(null)
      pendingSeekSecRef.current = null
    }
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
      pendingSeekSecRef.current = pb.timestamp_offset_ms / 1000.0
      setPlaybackUrl(pb.url)
      setActiveRecordingId(pb.recording_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed.")
      setPlaybackUrl(null)
      setActiveRecordingId(null)
      pendingSeekSecRef.current = null
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
    <div className="space-y-6">
      <Card className="bg-card/50 backdrop-blur-sm border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-amber-400" />
            Semantic visual search
          </CardTitle>
          <CardDescription className="text-xs">
            Natural-language scene search (CLIP embeddings on sampled frames). Uses the same sparse sampling as offline
            AI; results open signed playback and seek to the moment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {semanticStatusLoading && (
            <p className="text-xs text-muted-foreground" role="status">
              Checking semantic search capability on the server…
            </p>
          )}
          {semanticStatusFetchError && (
            <p className="text-xs text-amber-200/90 flex flex-wrap items-center gap-x-2 gap-y-1" role="alert">
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
            <p className="text-xs text-muted-foreground" role="status">
              {semanticStatus!.detail?.trim() || "Semantic search is not configured for this server."}
            </p>
          )}
          {showSemanticIndexWarning && (
            <p className="text-xs text-amber-200/85" role="status">
              {semanticStatus!.detail}
            </p>
          )}
          {showSemanticWarming && (
            <p className="text-xs text-muted-foreground" role="status">
              Semantic search index is still starting on the server…
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="search"
              placeholder='Try: hand, crowd, bicycle near road, person sitting…'
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSemanticSearch()
              }}
              className="h-10 flex-1 bg-background/80 border-slate-600 text-sm"
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
              variant="secondary"
              size="sm"
              className="h-10 shrink-0 border-amber-500/30 text-amber-200"
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
          {semanticError && (
            <p className="text-xs text-amber-200/90" role="status">
              {semanticError}
            </p>
          )}
          {semanticHits.length > 0 && (
            <div className="rounded-md border border-slate-700/60 bg-muted/10 max-h-48 overflow-y-auto text-sm">
              <ul className="divide-y divide-slate-800/80">
                {semanticHits.map((h) => (
                  <li key={`${h.recording_segment_id}-${h.timestamp_offset_ms}-${h.vector_id ?? ""}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {cameraNameById.get(h.camera_id) ?? h.camera_id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-muted-foreground truncate" title={h.recording_segment_id}>
                        {(h.timestamp_offset_ms / 1000).toFixed(1)}s · score {(h.similarity * 100).toFixed(0)}%
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                      onClick={() => void playFromSemantic(h.recording_segment_id, h.timestamp_offset_ms)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Play
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/50 backdrop-blur-sm border-slate-700/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Video className="h-5 w-5 text-cyan-400" />
            Recording history
          </CardTitle>
          <CardDescription>
            Pick a quick range or choose date and time separately (larger native pickers). Playback uses short-lived
            signed URLs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" className="border-slate-600" onClick={() => applyPreset("24h")}>
              Last 24 hours
            </Button>
            <Button type="button" variant="secondary" size="sm" className="border-slate-600" onClick={() => applyPreset("7d")}>
              Last 7 days
            </Button>
            <Button type="button" variant="secondary" size="sm" className="border-slate-600" onClick={() => applyPreset("today")}>
              Today
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => applyPreset("clear")}>
              Clear range
            </Button>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Camera</Label>
              <Select value={cameraFilter} onValueChange={setCameraFilter}>
                <SelectTrigger className="h-11 bg-background/60 border-slate-600 text-base">
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

            <div className="space-y-2">
              <Label>Object (AI)</Label>
              <Select value={objectTypeFilter} onValueChange={setObjectTypeFilter}>
                <SelectTrigger className="h-11 bg-background/60 border-slate-600 text-base">
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

            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                className="h-11 w-full border-slate-600 text-base"
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Apply filters
                  </span>
                )}
              </Button>
            </div>
          </div>

          <div className="grid gap-6 rounded-lg border border-slate-700/50 bg-muted/10 p-4 sm:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">From</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-from-date" className="text-xs text-muted-foreground">
                    Date
                  </Label>
                  <Input
                    id="rec-from-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-11 min-h-11 cursor-pointer bg-background/80 text-base border-slate-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-from-time" className="text-xs text-muted-foreground">
                    Time (optional)
                  </Label>
                  <Input
                    id="rec-from-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-11 min-h-11 cursor-pointer bg-background/80 text-base border-slate-600"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Leave time empty to use start of that day (00:00).</p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">To</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-to-date" className="text-xs text-muted-foreground">
                    Date
                  </Label>
                  <Input
                    id="rec-to-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-11 min-h-11 cursor-pointer bg-background/80 text-base border-slate-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-to-time" className="text-xs text-muted-foreground">
                    Time (optional)
                  </Label>
                  <Input
                    id="rec-to-time"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-11 min-h-11 cursor-pointer bg-background/80 text-base border-slate-600"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Leave time empty to use end of that day (23:59:59).</p>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {rows.length} of {total} segments
            </span>
            <span className="inline-flex items-center gap-1">
              <HardDrive className="h-3.5 w-3.5" />
              MinIO-backed
            </span>
          </div>
        </CardContent>
      </Card>

      {playbackUrl && (
        <Card className="bg-slate-900/40 border-cyan-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Playback</CardTitle>
            <CardDescription className="text-xs">
              Segment {activeRecordingId}. URL expires quickly; press Play on another row to refresh.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <video
              ref={videoRef}
              key={playbackUrl}
              className="w-full max-h-[420px] rounded-md border border-slate-700 bg-black"
              controls
              src={playbackUrl}
              onLoadedMetadata={(e) => {
                const t = pendingSeekSecRef.current
                if (t != null && Number.isFinite(t)) {
                  e.currentTarget.currentTime = Math.max(0, t)
                  pendingSeekSecRef.current = null
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/50 backdrop-blur-sm border-slate-700/50 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Camera</th>
                  <th className="p-3 font-medium">Start</th>
                  <th className="p-3 font-medium">End</th>
                  <th className="p-3 font-medium">Duration</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Size</th>
                  <th className="p-3 font-medium">Source</th>
                  <th className="p-3 font-medium whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      No recordings in this range. Live webcam segments appear here after upload completes.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-800/80 hover:bg-muted/10">
                      <td className="p-3 align-top">
                        <div className="font-medium text-foreground">
                          {cameraNameById.get(r.camera_id) ?? r.camera_id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={r.object_key}>
                          {r.object_key}
                        </div>
                      </td>
                      <td className="p-3 align-top whitespace-nowrap">{formatDt(r.start_time)}</td>
                      <td className="p-3 align-top whitespace-nowrap">{formatDt(r.end_time)}</td>
                      <td className="p-3 align-top">
                        {r.duration_seconds != null ? `${r.duration_seconds.toFixed(0)}s` : "—"}
                      </td>
                      <td className="p-3 align-top">
                        <Badge variant="outline" className="text-xs font-normal">
                          {r.file_type.includes("webm") ? "WebM" : r.file_type.includes("mp4") ? "MP4" : r.file_type}
                        </Badge>
                      </td>
                      <td className="p-3 align-top">{formatBytes(r.size_bytes)}</td>
                      <td className="p-3 align-top text-muted-foreground text-xs">{r.ingest_source}</td>
                      <td className="p-3 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                            onClick={() => void play(r.id)}
                          >
                            <Play className="h-3.5 w-3.5 mr-1" />
                            Play
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                            disabled={deletingId === r.id}
                            onClick={() => void remove(r.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            {deletingId === r.id ? "…" : "Delete"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/50 backdrop-blur-sm border-slate-700/50 overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Object detections (AI processing)</CardTitle>
          <CardDescription className="text-xs">
            YOLOv8n on stored segments. Showing {detRows.length} of {detTotal} in range — run the ai-processor service to
            populate results.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Camera</th>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Confidence</th>
                  <th className="p-3 font-medium">Event time</th>
                  <th className="p-3 font-medium">Offset</th>
                  <th className="p-3 font-medium whitespace-nowrap">Playback</th>
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
                    <tr key={d.id} className="border-t border-slate-800/80 hover:bg-muted/10">
                      <td className="p-3 align-top">
                        {cameraNameById.get(d.camera_id) ?? d.camera_id.slice(0, 8)}
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
                          className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
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

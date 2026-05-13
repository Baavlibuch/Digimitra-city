"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Play, RefreshCw, Video, HardDrive, Trash2 } from "lucide-react"
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
  type CameraDto,
  type RecordingSegmentDto,
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
  const { user } = useAuth()
  const operator = (user?.username || "operator").trim() || "operator"

  const [token, setToken] = useState<string | null>(null)
  const [cameras, setCameras] = useState<CameraDto[]>([])
  const [cameraFilter, setCameraFilter] = useState<string>("all")
  const [startDate, setStartDate] = useState("")
  const [startTime, setStartTime] = useState("")
  const [endDate, setEndDate] = useState("")
  const [endTime, setEndTime] = useState("")
  const [rows, setRows] = useState<RecordingSegmentDto[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filtersRef = useRef({
    cameraFilter,
    startDate,
    startTime,
    endDate,
    endTime,
  })
  filtersRef.current = { cameraFilter, startDate, startTime, endDate, endTime }

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
    setLoading(true)
    const f = filtersRef.current
    try {
      const tok = await fetchSurveillanceAccessToken(operator)
      setToken(tok)
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recordings.")
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [operator])

  useEffect(() => {
    void load()
  }, [load])

  const play = async (id: string) => {
    if (!token) {
      setError("Not authenticated with surveillance API yet.")
      return
    }
    setError(null)
    try {
      const pb = await fetchRecordingPlaybackUrl(token, id, 2)
      setPlaybackUrl(pb.url)
      setActiveRecordingId(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback failed.")
      setPlaybackUrl(null)
      setActiveRecordingId(null)
    }
  }

  const remove = async (id: string) => {
    if (!token) {
      setError("Not authenticated with surveillance API yet.")
      return
    }
    if (!window.confirm("Delete this recording from storage and the catalog? This cannot be undone.")) {
      return
    }
    setError(null)
    setDeletingId(id)
    try {
      await deleteRecording(token, id)
      if (activeRecordingId === id) {
        setPlaybackUrl(null)
        setActiveRecordingId(null)
      }
      setRows((prev) => prev.filter((r) => r.id !== id))
      setTotal((n) => Math.max(0, n - 1))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
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

          <div className="grid gap-5 lg:grid-cols-2">
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
              key={playbackUrl}
              className="w-full max-h-[420px] rounded-md border border-slate-700 bg-black"
              controls
              src={playbackUrl}
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
    </div>
  )
}

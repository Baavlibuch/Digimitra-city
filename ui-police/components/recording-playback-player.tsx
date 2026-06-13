"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Maximize2, Minimize2, Search } from "lucide-react"
import type { DetectionDto } from "@/lib/surveillance-api"
import {
  bboxToPercentRect,
  buildTimelineMarkers,
  computeVideoContentLayout,
  detectionsAtTime,
  eventBannerLabel,
  formatObjectLabel,
  isIdleSceneMessage,
  nearestDetection,
  parseBoundingBox,
  type SearchEvidenceContext,
} from "@/lib/detection-overlay-utils"
import { cn } from "@/lib/utils"
import { EventInferenceBanner } from "@/components/event-inference-banner"

/** When false, video plays without on-screen bounding boxes or object/confidence labels. */
const SHOW_DETECTION_OVERLAYS = false
/** When false, no CSS scale/transform zoom toward detection bounding boxes. Seek still works. */
const AUTO_ZOOM_TO_DETECTIONS = false

const TIMEUPDATE_THROTTLE_MS = 120
const BANNER_AUTO_HIDE_MS = 4500
const SEARCH_BANNER_MS = 5000
const ZOOM_DELAY_MS = 900
const ZOOM_DURATION_MS = 2200

export type PlaybackEntryContext =
  | { mode: "normal" }
  | {
      mode: "semantic"
      evidence: SearchEvidenceContext
    }
  | {
      mode: "detection"
      detectionId: string
      offsetMs: number
    }

type RecordingPlaybackPlayerProps = {
  playbackUrl: string
  recordingId: string
  detections: DetectionDto[]
  pendingSeekSec: number | null
  entryContext: PlaybackEntryContext
  segmentStartIso?: string | null
  onSeekApplied?: () => void
}

function formatClockFromOffset(offsetMs: number, segmentStartIso?: string | null): string {
  if (segmentStartIso) {
    try {
      const t = new Date(new Date(segmentStartIso).getTime() + offsetMs)
      return t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    } catch {
      /* fall through */
    }
  }
  const sec = Math.max(0, Math.floor(offsetMs / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":")
}

export function RecordingPlaybackPlayer({
  playbackUrl,
  recordingId,
  detections,
  pendingSeekSec,
  entryContext,
  segmentStartIso,
  onSeekApplied,
}: RecordingPlaybackPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTimeUpdateRef = useRef(0)

  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [layout, setLayout] = useState({ w: 0, h: 0, vw: 0, vh: 0 })
  const [visibleDetections, setVisibleDetections] = useState<DetectionDto[]>([])
  const [eventBanner, setEventBanner] = useState<{ label: string; clock: string; key: string } | null>(null)
  const [searchBannerVisible, setSearchBannerVisible] = useState(false)
  const [zoomActive, setZoomActive] = useState(false)
  const [zoomStyle, setZoomStyle] = useState<React.CSSProperties>({})
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenSupported, setFullscreenSupported] = useState(false)
  const lastEventSignatureRef = useRef<string | null>(null)

  useEffect(() => {
    setFullscreenSupported(typeof document.documentElement.requestFullscreen === "function")
  }, [])

  const searchEvidence = entryContext.mode === "semantic" ? entryContext.evidence : null
  const searchOffsetMs = searchEvidence?.offsetMs ?? null

  const sortedDetections = useMemo(
    () => [...detections].sort((a, b) => a.timestamp_offset_ms - b.timestamp_offset_ms),
    [detections],
  )

  const timelineMarkers = useMemo(
    () => buildTimelineMarkers(sortedDetections, searchOffsetMs),
    [sortedDetections, searchOffsetMs],
  )

  const contentLayout = useMemo(
    () => computeVideoContentLayout(layout.w, layout.h, layout.vw, layout.vh),
    [layout],
  )

  const measureLayout = useCallback(() => {
    const el = containerRef.current
    const video = videoRef.current
    if (!el || !video) return
    setLayout({
      w: el.clientWidth,
      h: el.clientHeight,
      vw: video.videoWidth || 0,
      vh: video.videoHeight || 0,
    })
  }, [])

  useEffect(() => {
    measureLayout()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measureLayout) : null
    if (ro && containerRef.current) ro.observe(containerRef.current)
    return () => ro?.disconnect()
  }, [measureLayout, playbackUrl])

  useEffect(() => {
    const onFullscreenChange = () => {
      const el = containerRef.current
      setIsFullscreen(Boolean(el && document.fullscreenElement === el))
      measureLayout()
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [measureLayout])

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current
    if (!el || !fullscreenSupported) return
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen()
        return
      }
      await el.requestFullscreen()
    } catch {
      /* Fullscreen denied or unavailable — playback continues */
    }
  }, [fullscreenSupported])

  const applyZoomToDetection = useCallback(
    (det: DetectionDto | null) => {
      if (!det || !layout.w || !layout.h) return
      const bbox = parseBoundingBox(det.bounding_box)
      if (!bbox) return
      const rect = bboxToPercentRect(bbox, contentLayout)
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const scale = 1.65
      const originX = (cx / layout.w) * 100
      const originY = (cy / layout.h) * 100
      setZoomStyle({
        transform: `scale(${scale})`,
        transformOrigin: `${originX}% ${originY}%`,
        transition: `transform ${ZOOM_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      })
      setZoomActive(true)
      window.setTimeout(() => {
        setZoomStyle({
          transform: "scale(1)",
          transformOrigin: `${originX}% ${originY}%`,
          transition: `transform ${ZOOM_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        })
        window.setTimeout(() => setZoomActive(false), ZOOM_DURATION_MS)
      }, ZOOM_DURATION_MS)
    },
    [contentLayout, layout.h, layout.w],
  )

  const triggerEvidenceSequence = useCallback(
    (targetMs: number, det: DetectionDto | null, isSemantic: boolean) => {
      if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current)
      if (SHOW_DETECTION_OVERLAYS && det) setHighlightId(det.id)
      if (isSemantic) setSearchBannerVisible(true)
      if (!AUTO_ZOOM_TO_DETECTIONS) return
      zoomTimerRef.current = setTimeout(() => {
        applyZoomToDetection(det)
      }, ZOOM_DELAY_MS)
    },
    [applyZoomToDetection],
  )

  useEffect(() => {
    lastEventSignatureRef.current = null
    setEventBanner(null)
    setSearchBannerVisible(false)
    setHighlightId(null)
    setZoomActive(false)
    setZoomStyle({})
    if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current)
  }, [recordingId, playbackUrl])

  useEffect(() => {
    if (entryContext.mode !== "semantic" || !searchEvidence) return
    const det = nearestDetection(sortedDetections, searchEvidence.offsetMs)
    const t = window.setTimeout(() => {
      triggerEvidenceSequence(searchEvidence.offsetMs, det, true)
    }, 400)
    return () => clearTimeout(t)
  }, [entryContext.mode, searchEvidence, sortedDetections, triggerEvidenceSequence])

  useEffect(() => {
    if (entryContext.mode !== "detection") return
    const det =
      sortedDetections.find((d) => d.id === entryContext.detectionId) ??
      nearestDetection(sortedDetections, entryContext.offsetMs)
    const t = window.setTimeout(() => {
      triggerEvidenceSequence(entryContext.offsetMs, det, false)
    }, 400)
    return () => clearTimeout(t)
  }, [entryContext, sortedDetections, triggerEvidenceSequence])

  useEffect(() => {
    if (!searchBannerVisible) return
    const t = window.setTimeout(() => setSearchBannerVisible(false), SEARCH_BANNER_MS)
    return () => clearTimeout(t)
  }, [searchBannerVisible])

  useEffect(() => {
    if (!eventBanner) return
    const t = window.setTimeout(() => setEventBanner(null), BANNER_AUTO_HIDE_MS)
    return () => clearTimeout(t)
  }, [eventBanner])

  const updateVisibleFromTime = useCallback(
    (ms: number) => {
      const active = detectionsAtTime(sortedDetections, ms)
      setVisibleDetections(active)
      const label = eventBannerLabel(active)
      if (label && !isIdleSceneMessage(label) && active.length > 0) {
        const signature = `${label}:${active.map((d) => d.id).sort().join(",")}`
        if (lastEventSignatureRef.current !== signature) {
          lastEventSignatureRef.current = signature
          setEventBanner({
            label,
            clock: formatClockFromOffset(ms, segmentStartIso),
            key: signature,
          })
        }
      } else {
        lastEventSignatureRef.current = null
      }
    },
    [sortedDetections, segmentStartIso],
  )

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return
    const now = performance.now()
    if (now - lastTimeUpdateRef.current < TIMEUPDATE_THROTTLE_MS) return
    lastTimeUpdateRef.current = now
    const ms = video.currentTime * 1000
    setCurrentMs(ms)
    updateVisibleFromTime(ms)
  }

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget
    if (pendingSeekSec != null && Number.isFinite(pendingSeekSec)) {
      video.currentTime = Math.max(0, pendingSeekSec)
      onSeekApplied?.()
    }
    setDurationMs((video.duration || 0) * 1000)
    measureLayout()
    const ms = video.currentTime * 1000
    setCurrentMs(ms)
    updateVisibleFromTime(ms)
  }

  const seekToMs = (ms: number) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(ms)) return
    video.currentTime = ms / 1000
    setCurrentMs(ms)
    updateVisibleFromTime(ms)
    const det = nearestDetection(sortedDetections, ms)
    if (det) setHighlightId(det.id)
  }

  const durationSec = durationMs / 1000
  const progressPct = durationMs > 0 ? (currentMs / durationMs) * 100 : 0

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className={cn(
          "relative w-full max-h-[420px] aspect-video rounded-md border border-slate-700 bg-black overflow-hidden",
          isFullscreen && "max-h-none aspect-auto size-full rounded-none border-0",
        )}
      >
        <div className="absolute inset-0 overflow-hidden">
          <video
            ref={videoRef}
            key={playbackUrl}
            className={cn(
              "h-full w-full object-contain",
              zoomActive && "will-change-transform",
            )}
            style={zoomStyle}
            controls={false}
            src={playbackUrl}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPlay={measureLayout}
            onClick={() => {
              const v = videoRef.current
              if (!v) return
              if (v.paused) void v.play()
              else v.pause()
            }}
          />
        </div>

        {SHOW_DETECTION_OVERLAYS && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {visibleDetections.map((d) => {
              const bbox = parseBoundingBox(d.bounding_box)
              if (!bbox || !layout.w) return null
              const rect = bboxToPercentRect(bbox, contentLayout)
              const isHighlight = highlightId === d.id
              return (
                <div key={d.id}>
                  <div
                    className={cn(
                      "absolute rounded-sm border-2",
                      isHighlight
                        ? "border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.75)] animate-pulse"
                        : "border-cyan-400/90",
                    )}
                    style={{
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                    }}
                  />
                  <div
                    className={cn(
                      "absolute whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium shadow-md",
                      isHighlight ? "bg-amber-500/95 text-black" : "bg-black/80 text-cyan-100",
                    )}
                    style={{
                      left: rect.left,
                      top: Math.max(0, rect.top - 20),
                    }}
                  >
                    {formatObjectLabel(d.object_type, d.confidence)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Semantic search match banner */}
        {searchBannerVisible && searchEvidence && (
          <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[min(100%,20rem)] animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="rounded-lg border border-amber-500/40 bg-slate-950/90 px-3 py-2 shadow-lg backdrop-blur-sm">
              <div className="flex items-center gap-2 text-amber-200">
                <Search className="h-4 w-4 shrink-0" />
                <span className="text-sm font-semibold">Search Match Found</span>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Matched via Semantic Search · Similarity: {searchEvidence.similarity.toFixed(2)}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={searchEvidence.query}>
                Query: &ldquo;{searchEvidence.query}&rdquo;
              </p>
            </div>
          </div>
        )}

        {/* Event banner */}
        {eventBanner && (
          <EventInferenceBanner
            label={eventBanner.label}
            clock={eventBanner.clock}
            bannerKey={eventBanner.key}
          />
        )}

        {/* Native-style controls strip */}
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8">
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={progressPct}
            onChange={(e) => {
              const pct = Number(e.target.value)
              if (durationMs > 0) seekToMs((pct / 100) * durationMs)
            }}
            className="mb-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-600 accent-cyan-500"
            aria-label="Playback position"
          />
          <div className="flex items-center justify-between text-xs text-slate-300">
            <button
              type="button"
              className="rounded px-2 py-1 hover:bg-white/10"
              onClick={() => {
                const v = videoRef.current
                if (!v) return
                if (v.paused) void v.play()
                else v.pause()
              }}
            >
              Play / Pause
            </button>
            <div className="flex items-center gap-2">
              <span>
                {(currentMs / 1000).toFixed(1)}s / {durationSec > 0 ? durationSec.toFixed(1) : "—"}s
              </span>
              {fullscreenSupported && (
                <button
                  type="button"
                  className="rounded p-1.5 hover:bg-white/10"
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                  onClick={() => void toggleFullscreen()}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI timeline markers */}
      {timelineMarkers.length > 0 && durationMs > 0 && (
        <div className="relative h-8 rounded-md border border-slate-700/60 bg-muted/20">
          <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 rounded bg-slate-700" />
          {timelineMarkers.map((m) => {
            const left = (m.offsetMs / durationMs) * 100
            const color =
              m.kind === "search"
                ? "bg-amber-400"
                : m.kind === "event"
                  ? "bg-orange-400"
                  : "bg-cyan-400"
            return (
              <button
                key={m.id}
                type="button"
                title={`${m.label} @ ${(m.offsetMs / 1000).toFixed(1)}s`}
                className={cn(
                  "absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-900 transition-transform hover:scale-125",
                  color,
                )}
                style={{ left: `${Math.min(100, Math.max(0, left))}%` }}
                onClick={() => seekToMs(m.offsetMs)}
                aria-label={`Seek to ${m.label}`}
              />
            )
          })}
          <div
            className="pointer-events-none absolute top-1/2 z-20 h-3 w-0.5 -translate-y-1/2 bg-white shadow"
            style={{ left: `${Math.min(100, Math.max(0, progressPct))}%` }}
          />
        </div>
      )}
    </div>
  )
}

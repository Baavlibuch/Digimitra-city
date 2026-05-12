"use client"

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react"
import { useAuth } from "@/components/auth-provider"
import { useWebcamRecording } from "@/lib/use-webcam-recording"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Camera,
  CameraOff,
  Grid3X3,
  Maximize2,
  Play,
  Volume2,
  VolumeX,
  Zap,
  Search,
  Pin,
  X,
  Clock,
  Pause,
  SkipBack,
  SkipForward,
  RefreshCw,
  Plus,
  Trash2,
} from "lucide-react"
import {
  CUSTOM_FEEDS_STORAGE_KEY,
  DEFAULT_CAMERA_FEEDS,
  DELETED_FEEDS_STORAGE_KEY,
  FEED_DEVICE_MAP_STORAGE_KEY,
  emitCameraFeedsSync,
  type CameraFeed,
} from "@/lib/camera-feeds"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AINotification {
  id: string
  cameraId: string
  message: string
  timestamp: string
  type: "motion" | "alert" | "suggestion"
  action?: string
}

type StreamStatus = "idle" | "loading" | "live" | "error"
type CameraAddMode = "webcam" | "cctv"
type CctvConnectionStatus = "idle" | "testing" | "success" | "error"

// ─── Webcam hook (logic from text 2) ─────────────────────────────────────────

function useWebcamStream(deviceId?: string) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<StreamStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCurrentStream = useCallback(() => {
    if (!streamRef.current) return
    streamRef.current.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (!deviceId) {
      stopCurrentStream()
      setStream(null)
      setStatus("idle")
      setError(null)
      return
    }

    let active = true
    setStatus("loading")
    setError(null)

    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false })
      .then((s) => {
        if (!active) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stopCurrentStream()
        streamRef.current = s
        setStream(s)
        setStatus("live")
      })
      .catch((err: Error) => {
        if (!active) return
        setStatus("error")
        setError(err.message ?? "Camera access denied")
      })

    return () => {
      active = false
      stopCurrentStream()
      setStream(null)
    }
  }, [deviceId, stopCurrentStream])

  return { stream, status, error }
}

function useDeviceList() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])

  const refresh = useCallback(async () => {
    try {
      // Request permission first so labels are populated
      await navigator.mediaDevices.getUserMedia({ video: true }).then((s) => s.getTracks().forEach((t) => t.stop()))
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(all.filter((d) => d.kind === "videoinput"))
    } catch {
      setDevices([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { devices, refresh }
}

// ─── Live video element ───────────────────────────────────────────────────────

function WebcamPreview({ stream, muted }: { stream: MediaStream | null; muted: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (stream) {
      el.srcObject = stream
      void el.play()
    } else {
      el.srcObject = null
    }
    return () => {
      if (el.srcObject) {
        el.pause()
        el.srcObject = null
      }
    }
  }, [stream])

  if (!stream) return null

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className="absolute inset-0 w-full h-full object-cover"
    />
  )
}

function CctvPreview({ streamUrl, muted = true }: { streamUrl?: string; muted?: boolean }) {
  if (!streamUrl) return null
  return (
    <video
      src={streamUrl}
      autoPlay
      playsInline
      muted={muted}
      controls={false}
      className="absolute inset-0 w-full h-full object-cover"
      onError={(event) => {
        // Keep UI resilient if the stream cannot be rendered in-browser.
        const target = event.currentTarget
        target.pause()
      }}
    />
  )
}

type WebcamHoverRecordingApi = {
  isRecording: boolean
  startRecording: () => void
  stopRecording: () => void
  canRecord: boolean
}

/**
 * Owns one getUserMedia stream, live preview, MediaRecorder upload session, and optional hover UI.
 */
function WebcamTileBody({
  feed,
  deviceId,
  operatorUsername,
  onRecordingChange,
  renderHover,
}: {
  feed: CameraFeed
  deviceId?: string
  operatorUsername: string
  onRecordingChange: (feedId: string, active: boolean) => void
  renderHover: (rec: WebcamHoverRecordingApi) => ReactNode
}) {
  const { stream } = useWebcamStream(deviceId)
  const { isRecording, startRecording, stopRecording, uploadError, clearUploadError } = useWebcamRecording(
    stream,
    operatorUsername,
  )

  useEffect(() => {
    onRecordingChange(feed.id, isRecording)
  }, [feed.id, isRecording, onRecordingChange])

  const canRecord = Boolean(deviceId && stream)
  const start = () => void startRecording({ cameraId: feed.id, cameraName: feed.name })

  return (
    <>
      <WebcamPreview stream={stream} muted />
      {uploadError && (
        <div className="absolute bottom-11 left-2 right-2 z-30 rounded-md bg-red-950/95 px-2 py-1.5 text-[10px] leading-snug text-red-50 shadow-lg">
          <span>{uploadError}</span>
          <button
            type="button"
            className="ml-2 underline font-medium"
            onClick={() => clearUploadError()}
          >
            Dismiss
          </button>
        </div>
      )}
      {renderHover({
        isRecording,
        startRecording: start,
        stopRecording,
        canRecord,
      })}
    </>
  )
}

function TileHoverChrome({
  feed,
  recording,
  onFullscreen,
  onPlayPause,
  isPlaying,
  onDelete,
}: {
  feed: CameraFeed
  recording?: WebcamHoverRecordingApi | null
  onFullscreen: () => void
  onPlayPause: () => void
  isPlaying: boolean
  onDelete: () => void
}) {
  return (
    <div className="absolute inset-0 z-20 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2 flex-wrap">
      <Button size="icon" variant="secondary" className="w-8 h-8" onClick={onFullscreen}>
        <Maximize2 className="w-4 h-4" />
      </Button>
      <Button size="icon" variant="secondary" className="w-8 h-8" onClick={onPlayPause}>
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </Button>
      <Button size="icon" variant="secondary" className="w-8 h-8">
        {feed.hasAudio ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </Button>
      {recording && (
        <Button
          size="sm"
          variant={recording.isRecording ? "destructive" : "secondary"}
          className="h-8 px-2 text-xs shrink-0"
          disabled={!recording.isRecording && !recording.canRecord}
          onClick={() => (recording.isRecording ? recording.stopRecording() : recording.startRecording())}
          title={
            recording.canRecord || recording.isRecording
              ? "Upload time-sliced segments to surveillance storage (MediaRecorder)"
              : "Assign a webcam device first"
          }
        >
          {recording.isRecording ? "Stop" : "Record"}
        </Button>
      )}
      <Button size="icon" variant="destructive" className="w-8 h-8" onClick={onDelete}>
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  )
}

function CameraClosedView({ name, location }: { name: string; location: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      <div className="text-center">
        <CameraOff className="w-12 h-12 mx-auto mb-2 text-gray-400" />
        <p className="text-white text-sm font-medium">{name}</p>
        <p className="text-gray-400 text-xs">{location}</p>
        <p className="text-gray-500 text-xs mt-1">Camera is currently off</p>
      </div>
    </div>
  )
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const AI_NOTIFICATIONS: AINotification[] = [
  {
    id: "1",
    cameraId: "2",
    message: "Suspicious motion detected at Camera 02. Want to zoom in?",
    timestamp: "30s ago",
    type: "alert",
    action: "zoom",
  },
  {
    id: "2",
    cameraId: "5",
    message: "Person loitering near Reception Area for 8+ minutes",
    timestamp: "2m ago",
    type: "suggestion",
    action: "focus",
  },
  {
    id: "3",
    cameraId: "6",
    message: "Auto-switched Camera 06 to priority view due to unusual activity",
    timestamp: "3m ago",
    type: "motion",
  },
]

// ─── Main component ───────────────────────────────────────────────────────────

export function LiveFeedWall() {
  const { user } = useAuth()
  const recordingOperatorId = (user?.email ?? user?.username ?? "").trim()

  const [activeRecordingByFeed, setActiveRecordingByFeed] = useState<Record<string, boolean>>({})
  const handleRecordingChange = useCallback((feedId: string, active: boolean) => {
    setActiveRecordingByFeed((prev) => {
      if (Boolean(prev[feedId]) === active) return prev
      return { ...prev, [feedId]: active }
    })
  }, [])

  // ── Device / stream state ──
  const { devices, refresh: refreshDevices } = useDeviceList()

  /**
   * Map of feedId → deviceId.
   * Camera 01 (id="1") is auto-assigned to the first real webcam if available.
   */
  const [feedDeviceMap, setFeedDeviceMap] = useState<Record<string, string>>({})
  const [customFeeds, setCustomFeeds] = useState<CameraFeed[]>([])
  const [deletedFeedIds, setDeletedFeedIds] = useState<string[]>([])
  const [isAddCameraOpen, setIsAddCameraOpen] = useState(false)
  const [addMode, setAddMode] = useState<CameraAddMode>("webcam")
  const [cameraNameInput, setCameraNameInput] = useState("")
  const [cameraLocationInput, setCameraLocationInput] = useState("")
  const [cameraResolutionInput, setCameraResolutionInput] = useState("1080p")
  const [selectedWebcamDeviceId, setSelectedWebcamDeviceId] = useState<string>("")
  const [cctvStreamType, setCctvStreamType] = useState<"rtsp" | "hls" | "http">("rtsp")
  const [cctvStreamUrl, setCctvStreamUrl] = useState("")
  const [cctvUsername, setCctvUsername] = useState("")
  const [cctvPassword, setCctvPassword] = useState("")
  const [cctvPort, setCctvPort] = useState("")
  const [cctvConnectionStatus, setCctvConnectionStatus] = useState<CctvConnectionStatus>("idle")
  const [cctvConnectionMessage, setCctvConnectionMessage] = useState("")
  const [hasLoadedPersistedState, setHasLoadedPersistedState] = useState(false)

  // Auto-assign first device to feed "1" once devices load
  useEffect(() => {
    if (devices.length > 0) {
      setFeedDeviceMap((prev) =>
        prev["1"] ? prev : { ...prev, "1": devices[0].deviceId }
      )
    }
  }, [devices])

  useEffect(() => {
    try {
      const persistedFeedsRaw = window.localStorage.getItem(CUSTOM_FEEDS_STORAGE_KEY)
      if (persistedFeedsRaw) {
        const parsedFeeds = JSON.parse(persistedFeedsRaw) as CameraFeed[]
        if (Array.isArray(parsedFeeds)) {
          setCustomFeeds(
            parsedFeeds.filter(
              (feed) =>
                typeof feed.id === "string" &&
                typeof feed.name === "string" &&
                typeof feed.location === "string"
            )
          )
        }
      }

      const persistedMapRaw = window.localStorage.getItem(FEED_DEVICE_MAP_STORAGE_KEY)
      if (persistedMapRaw) {
        const parsedMap = JSON.parse(persistedMapRaw) as Record<string, string>
        if (parsedMap && typeof parsedMap === "object") {
          setFeedDeviceMap(parsedMap)
        }
      }

      const persistedDeletedFeedsRaw = window.localStorage.getItem(DELETED_FEEDS_STORAGE_KEY)
      if (persistedDeletedFeedsRaw) {
        const parsedDeletedFeedIds = JSON.parse(persistedDeletedFeedsRaw) as string[]
        if (Array.isArray(parsedDeletedFeedIds)) {
          setDeletedFeedIds(parsedDeletedFeedIds.filter((id) => typeof id === "string"))
        }
      }
    } catch {
      // Ignore malformed persisted state and continue with defaults.
    } finally {
      setHasLoadedPersistedState(true)
    }
  }, [])

  useEffect(() => {
    if (!hasLoadedPersistedState) return
    window.localStorage.setItem(CUSTOM_FEEDS_STORAGE_KEY, JSON.stringify(customFeeds))
    emitCameraFeedsSync()
  }, [customFeeds, hasLoadedPersistedState])

  useEffect(() => {
    if (!hasLoadedPersistedState) return
    window.localStorage.setItem(FEED_DEVICE_MAP_STORAGE_KEY, JSON.stringify(feedDeviceMap))
    emitCameraFeedsSync()
  }, [feedDeviceMap, hasLoadedPersistedState])

  useEffect(() => {
    if (!hasLoadedPersistedState) return
    window.localStorage.setItem(DELETED_FEEDS_STORAGE_KEY, JSON.stringify(deletedFeedIds))
    emitCameraFeedsSync()
  }, [deletedFeedIds, hasLoadedPersistedState])

  // ── Grid / UI state ──
  const [gridSize, setGridSize] = useState<"2x2" | "3x3" | "4x4">("3x3")
  const [selectedFeeds, setSelectedFeeds] = useState<string[]>([])
  const [fullscreenFeed, setFullscreenFeed] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [autoArrange, setAutoArrange] = useState(true)
  const [showAISuggestions, setShowAISuggestions] = useState(true)
  const allFeeds = [...DEFAULT_CAMERA_FEEDS, ...customFeeds]
  const visibleFeeds = allFeeds.filter((feed) => !deletedFeedIds.includes(feed.id))

  // ── Playback state (fullscreen modal) ──
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState("14:32:15")
  const [isLive, setIsLive] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(45)
  const duration = "01:23:45"

  // Webcam stream for the currently fullscreened feed
  const fullscreenDeviceId = fullscreenFeed ? feedDeviceMap[fullscreenFeed] : undefined
  const { stream: fullscreenStream, status: fullscreenStreamStatus } = useWebcamStream(fullscreenDeviceId)
  const fullscreenFeedData = fullscreenFeed ? allFeeds.find((f) => f.id === fullscreenFeed) : undefined
  const isFullscreenCctv = fullscreenFeedData?.sourceType === "cctv"

  // ── Grid helpers ──
  const getGridDimensions = () => {
    switch (gridSize) {
      case "2x2": return { cols: 2, maxFeeds: 4 }
      case "3x3": return { cols: 3, maxFeeds: 9 }
      case "4x4": return { cols: 4, maxFeeds: 16 }
      default: return { cols: 3, maxFeeds: 9 }
    }
  }
  const { cols, maxFeeds } = getGridDimensions()

  const getDisplayFeeds = (): CameraFeed[] => {
    let feeds = visibleFeeds.filter(
      (f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.location.toLowerCase().includes(searchQuery.toLowerCase())
    )
    if (selectedFeeds.length > 0) feeds = feeds.filter((f) => selectedFeeds.includes(f.id))
    if (autoArrange) feeds = [...feeds].sort((a, b) => b.priority - a.priority)
    return feeds.slice(0, maxFeeds)
  }
  const displayFeeds = getDisplayFeeds()

  // ── Playback controls ──
  const handlePlayPause = () => {
    setIsPlaying((p) => !p)
    if (isLive) setIsLive(false)
  }

  const handleGoLive = () => {
    setIsLive(true)
    setIsPlaying(true)
    setCurrentTime("14:32:15")
    setProgress(100)
  }

  const shiftTime = (deltaSecs: number) => {
    if (isLive) return
    const [h, m, s] = currentTime.split(":").map(Number)
    const total = Math.max(0, Math.min(5025, h * 3600 + m * 60 + s + deltaSecs))
    const nh = Math.floor(total / 3600)
    const nm = Math.floor((total % 3600) / 60)
    const ns = total % 60
    setCurrentTime(
      `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}:${String(ns).padStart(2, "0")}`
    )
    setProgress(Math.round((total / 5025) * 100))
  }

  const handleProgressChange = (value: number[]) => {
    if (isLive) return
    const pct = value[0]
    setProgress(pct)
    const total = Math.floor((pct / 100) * 5025)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    setCurrentTime(
      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    )
  }

  // ── Camera actions ──
  const handleViewCamera = (cameraId: string) => {
    setFullscreenFeed(cameraId)
    setIsLive(true)
    setIsPlaying(true)
  }

  const toggleFeedSelection = (feedId: string) =>
    setSelectedFeeds((prev) =>
      prev.includes(feedId) ? prev.filter((id) => id !== feedId) : [...prev, feedId]
    )

  const handleAIAction = (n: AINotification) => {
    if (n.action === "zoom" || n.action === "focus") setFullscreenFeed(n.cameraId)
  }

  // ── Feed device assignment ──
  const assignDevice = (feedId: string, deviceId: string) =>
    setFeedDeviceMap((prev) => ({ ...prev, [feedId]: deviceId }))

  const handleDeleteCamera = (feedId: string) => {
    const feedToDelete = allFeeds.find((feed) => feed.id === feedId)
    const confirmed = window.confirm(
      `Are you sure you want to delete ${feedToDelete?.name ?? "this camera"}?`
    )
    if (!confirmed) return

    const isDefaultFeed = DEFAULT_CAMERA_FEEDS.some((feed) => feed.id === feedId)
    if (isDefaultFeed) {
      setDeletedFeedIds((prev) => (prev.includes(feedId) ? prev : [...prev, feedId]))
    } else {
      setCustomFeeds((prev) => prev.filter((feed) => feed.id !== feedId))
    }

    setFeedDeviceMap((prev) => {
      if (!prev[feedId]) return prev
      const next = { ...prev }
      delete next[feedId]
      return next
    })
    setSelectedFeeds((prev) => prev.filter((id) => id !== feedId))
    setFullscreenFeed((prev) => (prev === feedId ? null : prev))
  }

  const resetAddCameraForm = () => {
    setCameraNameInput("")
    setCameraLocationInput("")
    setCameraResolutionInput("1080p")
    setSelectedWebcamDeviceId(devices[0]?.deviceId ?? "")
    setCctvStreamType("rtsp")
    setCctvStreamUrl("")
    setCctvUsername("")
    setCctvPassword("")
    setCctvPort("")
    setCctvConnectionStatus("idle")
    setCctvConnectionMessage("")
  }

  useEffect(() => {
    if (!selectedWebcamDeviceId && devices[0]?.deviceId) {
      setSelectedWebcamDeviceId(devices[0].deviceId)
    }
  }, [devices, selectedWebcamDeviceId])

  const nextCustomFeedId = () => {
    const maxId = allFeeds.reduce((max, feed) => {
      const asNumber = Number(feed.id)
      return Number.isFinite(asNumber) ? Math.max(max, asNumber) : max
    }, 0)
    return String(maxId + 1)
  }

  const testCctvConnection = async () => {
    if (!cctvStreamUrl.trim()) {
      setCctvConnectionStatus("error")
      setCctvConnectionMessage("Enter a stream URL before testing.")
      return
    }
    if (cctvStreamType === "rtsp") {
      setCctvConnectionStatus("error")
      setCctvConnectionMessage("RTSP cannot be previewed directly in-browser. Use HLS/HTTP URL for preview.")
      return
    }

    setCctvConnectionStatus("testing")
    setCctvConnectionMessage("Testing stream connection...")

    await new Promise<void>((resolve) => {
      const video = document.createElement("video")
      video.muted = true
      video.playsInline = true
      video.src = cctvStreamUrl.trim()

      const done = (ok: boolean, message: string) => {
        setCctvConnectionStatus(ok ? "success" : "error")
        setCctvConnectionMessage(message)
        video.pause()
        video.removeAttribute("src")
        video.load()
        resolve()
      }

      const timeoutId = window.setTimeout(() => {
        done(false, "Connection test timed out. Verify stream URL and network access.")
      }, 6000)

      video.onloadeddata = () => {
        window.clearTimeout(timeoutId)
        done(true, "Connection successful. Stream preview is available.")
      }
      video.onerror = () => {
        window.clearTimeout(timeoutId)
        done(false, "Unable to load stream. Check URL, credentials, and CORS settings.")
      }
    })
  }

  const handleAddCamera = () => {
    const trimmedName = cameraNameInput.trim()
    const trimmedLocation = cameraLocationInput.trim() || "Custom Location"
    if (!trimmedName) return

    const id = nextCustomFeedId()

    if (addMode === "webcam") {
      if (!selectedWebcamDeviceId) return
      const newFeed: CameraFeed = {
        id,
        name: trimmedName,
        location: trimmedLocation,
        status: "online",
        lastActivity: "Live",
        priority: 6,
        isRecording: true,
        hasAudio: false,
        resolution: cameraResolutionInput,
        sourceType: "webcam",
        deviceId: selectedWebcamDeviceId,
        coverageArea: { unit: "zone", label: trimmedLocation },
      }
      setCustomFeeds((prev) => [...prev, newFeed])
      assignDevice(id, selectedWebcamDeviceId)
    } else {
      if (!cctvStreamUrl.trim()) {
        setCctvConnectionStatus("error")
        setCctvConnectionMessage("Stream URL is required for CCTV camera.")
        return
      }
      const newFeed: CameraFeed = {
        id,
        name: trimmedName,
        location: trimmedLocation,
        status: "online",
        lastActivity: "Live",
        priority: 6,
        isRecording: true,
        hasAudio: false,
        resolution: cameraResolutionInput,
        sourceType: "cctv",
        cctvStreamType,
        cctvStreamUrl: cctvStreamUrl.trim(),
        coverageArea: { unit: "zone", label: trimmedLocation },
      }
      setCustomFeeds((prev) => [...prev, newFeed])
    }

    setIsAddCameraOpen(false)
    resetAddCameraForm()
  }

  // ── Status helpers ──
  const getStatusColor = (status: string) => {
    switch (status) {
      case "online": return "bg-green-500"
      case "alert": return "bg-red-500 animate-pulse"
      default: return "bg-gray-500"
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Live Feed Wall</h1>
          <p className="text-muted-foreground">Smart grid layout with AI-powered suggestions</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="bg-transparent"
            onClick={() => {
              resetAddCameraForm()
              setAddMode("webcam")
              setIsAddCameraOpen(true)
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Camera
          </Button>
          <Button
            variant={autoArrange ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoArrange((v) => !v)}
            className={!autoArrange ? "bg-transparent" : ""}
          >
            <Zap className="w-4 h-4 mr-2" />
            AI Auto-Arrange
          </Button>
          <Button variant="outline" size="sm" className="bg-transparent" onClick={() => void refreshDevices()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Cameras
          </Button>
        </div>
      </div>

      {/* ── AI Notifications ── */}
      {showAISuggestions && AI_NOTIFICATIONS.length > 0 && (
        <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-purple-400" />
                AI Suggestions
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowAISuggestions(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {AI_NOTIFICATIONS.slice(0, 2).map((n) => (
                <div key={n.id} className="flex items-center justify-between p-3 bg-purple-500/10 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                    <div>
                      <p className="text-sm text-foreground">{n.message}</p>
                      <p className="text-xs text-muted-foreground">{n.timestamp}</p>
                    </div>
                  </div>
                  {n.action && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAIAction(n)}
                      className="bg-transparent border-purple-500/30 hover:bg-purple-500/10"
                    >
                      {n.action === "zoom" ? "Zoom In" : "Focus"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Controls ── */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search cameras..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64"
            />
          </div>
          <Select value={gridSize} onValueChange={(v: "2x2" | "3x3" | "4x4") => setGridSize(v)}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2x2">2×2</SelectItem>
              <SelectItem value="3x3">3×3</SelectItem>
              <SelectItem value="4x4">4×4</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{displayFeeds.length} feeds</Badge>
          <Button variant="outline" size="sm" className="bg-transparent">
            <Grid3X3 className="w-4 h-4 mr-2" />
            Layout
          </Button>
        </div>
      </div>

      {/* ── Feed Grid ── */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {displayFeeds.map((feed) => (
          <Card
            key={feed.id}
            className={`bg-card/50 backdrop-blur-sm border-slate-700/50 hover:bg-card/70 transition-colors relative ${
              feed.status === "alert" ? "ring-2 ring-red-500/50" : ""
            }`}
          >
            <CardContent className="p-0">
              {/* Video area */}
              <div className="relative aspect-video bg-black rounded-t-lg overflow-hidden">
                {feed.sourceType === "cctv" ? (
                  <>
                    <CctvPreview streamUrl={feed.cctvStreamUrl} />
                    <TileHoverChrome
                      feed={feed}
                      recording={null}
                      onFullscreen={() => handleViewCamera(feed.id)}
                      onPlayPause={handlePlayPause}
                      isPlaying={isPlaying}
                      onDelete={() => handleDeleteCamera(feed.id)}
                    />
                  </>
                ) : (
                  <WebcamTileBody
                    feed={feed}
                    deviceId={feedDeviceMap[feed.id]}
                    operatorUsername={recordingOperatorId}
                    onRecordingChange={handleRecordingChange}
                    renderHover={(rec) => (
                      <TileHoverChrome
                        feed={feed}
                        recording={rec}
                        onFullscreen={() => handleViewCamera(feed.id)}
                        onPlayPause={handlePlayPause}
                        isPlaying={isPlaying}
                        onDelete={() => handleDeleteCamera(feed.id)}
                      />
                    )}
                  />
                )}

                {/* Camera-off view */}
                {feed.status === "offline" && (
                  <CameraClosedView name={feed.name} location={feed.location} />
                )}

                {/* Placeholder when no real stream */}
                {feed.status !== "offline" && !feedDeviceMap[feed.id] && feed.sourceType !== "cctv" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Camera
                        className={`w-12 h-12 mx-auto mb-2 ${
                          feed.status === "online" ? "text-green-500" : "text-gray-500"
                        }`}
                      />
                      <p className="text-white text-sm font-medium">{feed.name}</p>
                      <p className="text-gray-300 text-xs">{feed.location}</p>
                    </div>
                  </div>
                )}

                {/* Status dot */}
                <div className="absolute top-2 left-2 z-10">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(feed.status)}`} />
                </div>

                {/* REC badge: browser upload session for webcams; mock flag for CCTV tiles */}
                {((feed.sourceType === "cctv" && feed.isRecording) ||
                  (feed.sourceType !== "cctv" && activeRecordingByFeed[feed.id])) && (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-white text-xs">REC</span>
                  </div>
                )}

                {/* AI suggestion overlay */}
                {feed.aiSuggestion && (
                  <div className="absolute bottom-2 left-2 right-2 z-10">
                    <div className="bg-blue-500/90 backdrop-blur-sm rounded px-2 py-1">
                      <p className="text-white text-xs">{feed.aiSuggestion}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Feed metadata */}
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-foreground text-sm">{feed.name}</h3>
                  <Badge variant={feed.status === "online" ? "default" : "destructive"} className="text-xs">
                    {feed.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{feed.location}</span>
                  <span>{feed.resolution}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {feed.sourceType === "cctv"
                        ? `Live (${feed.cctvStreamType ?? "cctv"})`
                        : feedDeviceMap[feed.id]
                          ? "Live (webcam)"
                          : feed.lastActivity}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleFeedSelection(feed.id)}
                    className={`h-6 px-2 ${selectedFeeds.includes(feed.id) ? "bg-blue-500/20 text-blue-400" : ""}`}
                  >
                    <Pin className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Empty slots */}
        {Array.from({ length: maxFeeds - displayFeeds.length }).map((_, i) => (
          <Card
            key={`empty-${i}`}
            className="bg-card/20 backdrop-blur-sm border-slate-600/30 border-dashed"
          >
            <CardContent className="p-0">
              <div className="aspect-video flex items-center justify-center">
                <div className="text-center">
                  <Camera className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">Empty Slot</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Fullscreen Modal ── */}
      {fullscreenFeed && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
          <div className="relative w-full h-full max-w-6xl p-4">
            <Button
              className="absolute top-4 right-4 z-10"
              variant="secondary"
              size="icon"
              onClick={() => setFullscreenFeed(null)}
            >
              <X className="w-4 h-4" />
            </Button>

            <Card className="w-full h-full bg-card/95 backdrop-blur-sm">
              <CardContent className="p-0 h-full">
                <div className="relative h-full bg-black rounded-lg overflow-hidden">

                  {/* Real stream in fullscreen */}
                  {isFullscreenCctv && fullscreenFeedData?.cctvStreamUrl && (
                    <CctvPreview streamUrl={fullscreenFeedData.cctvStreamUrl} muted={isMuted} />
                  )}

                  {fullscreenStream && !isFullscreenCctv && (
                    <WebcamPreview stream={fullscreenStream} muted={isMuted} />
                  )}

                  {/* Status / loading overlay */}
                  {fullscreenStreamStatus === "loading" && !isFullscreenCctv && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
                      <p className="text-white text-sm">Connecting to camera…</p>
                    </div>
                  )}

                  {/* Placeholder when no real device assigned */}
                  {fullscreenFeedData?.status === "offline" && (
                    <CameraClosedView
                      name={fullscreenFeedData.name}
                      location={fullscreenFeedData.location}
                    />
                  )}

                  {!isFullscreenCctv && fullscreenFeedData?.status !== "offline" && !feedDeviceMap[fullscreenFeed] && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Camera className="w-24 h-24 text-green-500 mx-auto mb-4" />
                        <p className="text-white text-xl font-medium">
                          {allFeeds.find((f) => f.id === fullscreenFeed)?.name}
                        </p>
                        <p className="text-gray-300">
                          {allFeeds.find((f) => f.id === fullscreenFeed)?.location}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Controls bar */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 z-20">
                    {!isLive && (
                      <div className="mb-4">
                        <Slider
                          value={[progress]}
                          onValueChange={handleProgressChange}
                          max={100}
                          step={1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                          <span>{currentTime}</span>
                          <span>{duration}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Button variant="secondary" onClick={handlePlayPause}>
                          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        </Button>

                        {!isLive && (
                          <>
                            <Button variant="secondary" onClick={() => shiftTime(-10)}>
                              <SkipBack className="w-4 h-4" />
                            </Button>
                            <Button variant="secondary" onClick={() => shiftTime(10)}>
                              <SkipForward className="w-4 h-4" />
                            </Button>
                          </>
                        )}

                        <Button variant="secondary" onClick={() => setIsMuted((m) => !m)}>
                          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </Button>

                        <div className="text-white text-sm">
                          {isLive ? (
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                              <span>LIVE</span>
                            </div>
                          ) : (
                            <span>{currentTime}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isLive && (
                          <Button variant="secondary" onClick={handleGoLive} className="text-red-400">
                            <div className="w-2 h-2 bg-red-500 rounded-full mr-2" />
                            Go Live
                          </Button>
                        )}
                        <div className="text-white text-sm">
                          {allFeeds.find((f) => f.id === fullscreenFeed)?.resolution}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={isAddCameraOpen} onOpenChange={setIsAddCameraOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Camera</DialogTitle>
            <DialogDescription>Select source type and configure connection details.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Source type</p>
              <Select value={addMode} onValueChange={(v: CameraAddMode) => setAddMode(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webcam">Webcam</SelectItem>
                  <SelectItem value="cctv">CCTV / IP Camera</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Input
              placeholder="Camera Name"
              value={cameraNameInput}
              onChange={(e) => setCameraNameInput(e.target.value)}
            />
            <Input
              placeholder="Location"
              value={cameraLocationInput}
              onChange={(e) => setCameraLocationInput(e.target.value)}
            />
            <Select value={cameraResolutionInput} onValueChange={setCameraResolutionInput}>
              <SelectTrigger>
                <SelectValue placeholder="Resolution" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="720p">720p</SelectItem>
                <SelectItem value="1080p">1080p</SelectItem>
                <SelectItem value="4K">4K</SelectItem>
              </SelectContent>
            </Select>

            {addMode === "webcam" && (
              <Select value={selectedWebcamDeviceId} onValueChange={setSelectedWebcamDeviceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select webcam device" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {addMode === "cctv" && (
              <>
                <Select value={cctvStreamType} onValueChange={(v: "rtsp" | "hls" | "http") => setCctvStreamType(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Stream type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rtsp">RTSP</SelectItem>
                    <SelectItem value="hls">HLS</SelectItem>
                    <SelectItem value="http">HTTP</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder={cctvStreamType === "rtsp" ? "rtsp://..." : "https://..."}
                  value={cctvStreamUrl}
                  onChange={(e) => setCctvStreamUrl(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Username (optional)"
                    value={cctvUsername}
                    onChange={(e) => setCctvUsername(e.target.value)}
                  />
                  <Input
                    placeholder="Password (optional)"
                    type="password"
                    value={cctvPassword}
                    onChange={(e) => setCctvPassword(e.target.value)}
                  />
                </div>
                <Input placeholder="Port (optional)" value={cctvPort} onChange={(e) => setCctvPort(e.target.value)} />
                <Button variant="outline" className="bg-transparent" onClick={() => void testCctvConnection()}>
                  Test Connection
                </Button>
                {cctvConnectionMessage && (
                  <p
                    className={`text-xs ${
                      cctvConnectionStatus === "success"
                        ? "text-green-500"
                        : cctvConnectionStatus === "error"
                          ? "text-red-500"
                          : "text-muted-foreground"
                    }`}
                  >
                    {cctvConnectionMessage}
                  </p>
                )}
                {cctvConnectionStatus === "success" && cctvStreamType !== "rtsp" && cctvStreamUrl && (
                  <div className="relative aspect-video bg-black rounded-md overflow-hidden">
                    <CctvPreview streamUrl={cctvStreamUrl} />
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={() => {
                setIsAddCameraOpen(false)
                resetAddCameraForm()
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddCamera}
              disabled={
                !cameraNameInput.trim() ||
                (addMode === "webcam" ? !selectedWebcamDeviceId : !cctvStreamUrl.trim())
              }
            >
              Save Camera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default LiveFeedWall
export type { CameraFeed }

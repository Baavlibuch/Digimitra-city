"use client"

export type CoverageAreaUnit = "sqm" | "sqft" | "zone"

export interface CameraCoverageArea {
  value?: number
  unit?: CoverageAreaUnit
  label?: string
}

export interface CameraFeed {
  id: string
  name: string
  location: string
  status: "online" | "offline" | "alert"
  lastActivity: string
  aiSuggestion?: string
  priority: number
  isRecording: boolean
  hasAudio: boolean
  resolution: string
  deviceId?: string
  sourceType?: "webcam" | "cctv" | "local_video"
  cctvStreamUrl?: string
  cctvStreamType?: "rtsp" | "hls" | "http"
  coverageArea?: CameraCoverageArea | null
}

export const CUSTOM_FEEDS_STORAGE_KEY = "digimitra.liveFeedWall.customFeeds.v1"
export const FEED_DEVICE_MAP_STORAGE_KEY = "digimitra.liveFeedWall.feedDeviceMap.v1"
export const DELETED_FEEDS_STORAGE_KEY = "digimitra.liveFeedWall.deletedFeedIds.v1"
export const CAMERA_FEEDS_SYNC_EVENT = "digimitra:camera-feeds-sync"

export const DEFAULT_CAMERA_FEEDS: CameraFeed[] = [
  {
    id: "1",
    name: "Camera 01",
    location: "Main Entrance",
    status: "online",
    lastActivity: "Live",
    aiSuggestion: "High traffic area – recommended for monitoring",
    priority: 9,
    isRecording: true,
    hasAudio: true,
    resolution: "1080p",
    coverageArea: { value: 420, unit: "sqm", label: "Entrance Plaza" },
  },
  {
    id: "2",
    name: "Camera 02",
    location: "Parking Lot A",
    status: "alert",
    lastActivity: "Motion detected 30s ago",
    aiSuggestion: "⚠️ Suspicious motion detected at 02:14",
    priority: 10,
    isRecording: true,
    hasAudio: false,
    resolution: "720p",
    coverageArea: { value: 9900, unit: "sqft", label: "Parking Zone A" },
  },
  {
    id: "3",
    name: "Camera 03",
    location: "Emergency Exit",
    status: "online",
    lastActivity: "Live",
    aiSuggestion: "Person loitering detected – want to zoom in?",
    priority: 7,
    isRecording: true,
    hasAudio: true,
    resolution: "1080p",
    coverageArea: { value: 180, unit: "sqm", label: "Exit Corridor" },
  },
  {
    id: "4",
    name: "Camera 04",
    location: "Loading Dock",
    status: "offline",
    lastActivity: "1 hour ago",
    priority: 3,
    isRecording: false,
    hasAudio: false,
    resolution: "720p",
    coverageArea: { value: 130, unit: "sqm", label: "Dock Zone" },
  },
  {
    id: "5",
    name: "Camera 05",
    location: "Reception Area",
    status: "online",
    lastActivity: "Live",
    aiSuggestion: "Person loitering detected – want to zoom in?",
    priority: 8,
    isRecording: true,
    hasAudio: true,
    resolution: "4K",
    coverageArea: { value: 2700, unit: "sqft", label: "Reception Lobby" },
  },
  {
    id: "6",
    name: "Camera 06",
    location: "Corridor B",
    status: "alert",
    lastActivity: "Alert 2m ago",
    aiSuggestion: "⚠️ Unusual activity – auto-switched to priority view",
    priority: 9,
    isRecording: true,
    hasAudio: false,
    resolution: "1080p",
    coverageArea: { value: 150, unit: "sqm", label: "Corridor B" },
  },
  {
    id: "7",
    name: "Camera 07",
    location: "Cafeteria",
    status: "online",
    lastActivity: "Live",
    priority: 5,
    isRecording: true,
    hasAudio: true,
    resolution: "720p",
    coverageArea: { label: "Cafeteria Zone", unit: "zone" },
  },
  {
    id: "8",
    name: "Camera 08",
    location: "Server Room",
    status: "online",
    lastActivity: "Live",
    priority: 6,
    isRecording: true,
    hasAudio: false,
    resolution: "1080p",
    coverageArea: { value: 85, unit: "sqm", label: "Server Room" },
  },
  {
    id: "9",
    name: "Camera 09",
    location: "Rooftop",
    status: "online",
    lastActivity: "Live",
    aiSuggestion: "High traffic area – recommended for monitoring",
    priority: 4,
    isRecording: true,
    hasAudio: false,
    resolution: "4K",
    coverageArea: { value: 4200, unit: "sqft", label: "Rooftop Deck" },
  },
]

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const sanitizeCoverageArea = (raw: unknown): CameraCoverageArea | null => {
  if (!isPlainObject(raw)) return null
  const value = typeof raw.value === "number" && Number.isFinite(raw.value) ? raw.value : undefined
  const unit =
    raw.unit === "sqm" || raw.unit === "sqft" || raw.unit === "zone"
      ? raw.unit
      : undefined
  const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : undefined
  if (value === undefined && !label) return null
  return { value, unit, label }
}

const sanitizeFeed = (raw: unknown): CameraFeed | null => {
  if (!isPlainObject(raw)) return null
  if (
    typeof raw.id !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.location !== "string" ||
    (raw.status !== "online" && raw.status !== "offline" && raw.status !== "alert")
  ) {
    return null
  }

  return {
    id: raw.id,
    name: raw.name,
    location: raw.location,
    status: raw.status,
    lastActivity: typeof raw.lastActivity === "string" ? raw.lastActivity : "Live",
    aiSuggestion: typeof raw.aiSuggestion === "string" ? raw.aiSuggestion : undefined,
    priority: typeof raw.priority === "number" && Number.isFinite(raw.priority) ? raw.priority : 0,
    isRecording: Boolean(raw.isRecording),
    hasAudio: Boolean(raw.hasAudio),
    resolution: typeof raw.resolution === "string" ? raw.resolution : "1080p",
    deviceId: typeof raw.deviceId === "string" ? raw.deviceId : undefined,
    sourceType: raw.sourceType === "webcam" || raw.sourceType === "cctv" ? raw.sourceType : undefined,
    cctvStreamUrl: typeof raw.cctvStreamUrl === "string" ? raw.cctvStreamUrl : undefined,
    cctvStreamType:
      raw.cctvStreamType === "rtsp" || raw.cctvStreamType === "hls" || raw.cctvStreamType === "http"
        ? raw.cctvStreamType
        : undefined,
    coverageArea: sanitizeCoverageArea(raw.coverageArea),
  }
}

export const emitCameraFeedsSync = () => {
  window.dispatchEvent(new Event(CAMERA_FEEDS_SYNC_EVENT))
}

export const readPersistedCameraState = () => {
  let customFeeds: CameraFeed[] = []
  let feedDeviceMap: Record<string, string> = {}
  let deletedFeedIds: string[] = []

  try {
    const persistedFeedsRaw = window.localStorage.getItem(CUSTOM_FEEDS_STORAGE_KEY)
    if (persistedFeedsRaw) {
      const parsed = JSON.parse(persistedFeedsRaw) as unknown[]
      if (Array.isArray(parsed)) {
        customFeeds = parsed
          .map((feed) => sanitizeFeed(feed))
          .filter((feed): feed is CameraFeed => feed !== null)
      }
    }

    const persistedMapRaw = window.localStorage.getItem(FEED_DEVICE_MAP_STORAGE_KEY)
    if (persistedMapRaw) {
      const parsed = JSON.parse(persistedMapRaw) as Record<string, unknown>
      if (isPlainObject(parsed)) {
        feedDeviceMap = Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
          if (typeof value === "string") acc[key] = value
          return acc
        }, {})
      }
    }

    const persistedDeletedRaw = window.localStorage.getItem(DELETED_FEEDS_STORAGE_KEY)
    if (persistedDeletedRaw) {
      const parsed = JSON.parse(persistedDeletedRaw) as unknown[]
      if (Array.isArray(parsed)) {
        deletedFeedIds = parsed.filter((id): id is string => typeof id === "string")
      }
    }
  } catch {
    // Fall back to defaults on malformed persisted state.
  }

  return { customFeeds, feedDeviceMap, deletedFeedIds }
}

export const buildVisibleFeeds = (state: {
  customFeeds: CameraFeed[]
  deletedFeedIds: string[]
}) => {
  const allFeeds = [...DEFAULT_CAMERA_FEEDS, ...state.customFeeds]
  return allFeeds.filter((feed) => !state.deletedFeedIds.includes(feed.id))
}

export const isFeedActive = (feed: CameraFeed, feedDeviceMap: Record<string, string>) => {
  if (feed.status === "offline") return false
  if (feed.sourceType === "cctv") return Boolean(feed.cctvStreamUrl?.trim())
  return Boolean(feedDeviceMap[feed.id] || feed.deviceId)
}

export const calculateCoverageSummary = (
  activeFeeds: CameraFeed[]
): { totalSquareMeters: number; zoneCount: number } => {
  let totalSquareMeters = 0
  let zoneCount = 0

  for (const feed of activeFeeds) {
    const coverage = feed.coverageArea
    if (!coverage) continue
    const rawValue = coverage.value
    if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue > 0) {
      if (coverage.unit === "sqft") {
        totalSquareMeters += rawValue * 0.092903
      } else {
        totalSquareMeters += rawValue
      }
      continue
    }

    if (coverage.label || coverage.unit === "zone") {
      zoneCount += 1
    }
  }

  return { totalSquareMeters, zoneCount }
}

export const formatCoverageSummaryValue = (summary: { totalSquareMeters: number; zoneCount: number }) => {
  if (summary.totalSquareMeters > 0) {
    return `${Math.round(summary.totalSquareMeters)} m²`
  }
  if (summary.zoneCount > 0) {
    return `${summary.zoneCount} zones`
  }
  return "0"
}

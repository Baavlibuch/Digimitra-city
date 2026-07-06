"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AIAgentPanel } from "@/components/ai-agent-panel"
import { Navigation } from "@/components/navigation"
import { MapView } from "@/components/map-view"
import { TextSearch } from "@/components/text-search"
import { EventsAlerts } from "@/components/events-alerts"
import { LiveFeedWall } from "@/components/live-feed-wall"
import { RecordingsHistory } from "@/components/recordings-history"
import { LoadingScreen } from "@/components/loading-screen"
import { Settings } from "@/components/settings"
import { Camera, AlertTriangle, Activity, MapPin, Search, Calendar, Clapperboard, Monitor } from "lucide-react"
import { useAuth } from "@/components/auth-provider"
import {
  fetchCameras,
  fetchDetections,
  fetchSurveillanceAccessToken,
} from "@/lib/surveillance-api"
import { buildIncidentCandidatesFromDetections } from "@/lib/event-deduplication"
import {
  readPersistedCameraState,
  DEFAULT_CAMERA_FEEDS,
  isFeedActive,
  CAMERA_FEEDS_SYNC_EVENT,
} from "@/lib/camera-feeds"

const DISMISSED_EVENTS_STORAGE_KEY = "digimitra.eventsAlerts.dismissedEventIds.v1"
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

const NAV_SECTION_IDS = new Set([
  "dashboard",
  "map",
  "search",
  "events",
  "recordings",
  "feeds",
  "settings",
])

interface DashboardProps {
  onSignOut: () => void
}

export function Dashboard({ onSignOut }: DashboardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeSection, setActiveSection] = useState("dashboard")
  const [isLoading, setIsLoading] = useState(true)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const { user } = useAuth()
  const [activeCameras, setActiveCameras] = useState(0)
  const [liveAlerts, setLiveAlerts] = useState(0)
  const [coverageAreas, setCoverageAreas] = useState("0 zones")
  const [systemStatus, setSystemStatus] = useState<"Operational" | "Degraded" | "Offline">("Operational")
  const [systemStatusColor, setSystemStatusColor] = useState<"online" | "warning" | "error">("online")

  useEffect(() => {
    const section = searchParams.get("section")
    if (section === "recordings") {
      router.replace("/recordings")
      return
    }
    if (section && NAV_SECTION_IDS.has(section)) {
      setActiveSection(section)
    }
  }, [searchParams, router])

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 3500) // Show loading for 3.5 seconds

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    let active = true

    const updateStats = async () => {
      try {
        const username = (user?.email || user?.username || "operator").trim()
        let tok: string | null = null
        try {
          tok = await fetchSurveillanceAccessToken(username)
        } catch (e) {
          console.error("Failed to fetch token", e)
        }

        // Fetch backend cameras
        const backendCams = await fetchCameras().catch(() => [])
        const activeBackendCount = backendCams.filter(c => c.stream_status === "online").length

        // Fetch local/custom cameras
        const { customFeeds, feedDeviceMap, deletedFeedIds } = readPersistedCameraState()
        const allFeeds = [...DEFAULT_CAMERA_FEEDS, ...customFeeds]
        const visibleFeeds = allFeeds.filter(feed => !deletedFeedIds.includes(feed.id))
        const activeFrontendCount = visibleFeeds.filter(feed => isFeedActive(feed, feedDeviceMap)).length

        if (!active) return

        const totalActive = activeBackendCount + activeFrontendCount
        setActiveCameras(totalActive)

        // Compute coverage zones
        const zones = new Set<string>()
        for (const cam of backendCams) {
          if (cam.stream_status === "online") {
            if (cam.location) zones.add(cam.location)
            if (cam.room_name) zones.add(cam.room_name)
          }
        }
        for (const feed of visibleFeeds) {
          if (isFeedActive(feed, feedDeviceMap)) {
            if (feed.coverageArea?.label) {
              zones.add(feed.coverageArea.label)
            } else if (feed.location) {
              zones.add(feed.location)
            }
          }
        }
        setCoverageAreas(`${zones.size} zone${zones.size !== 1 ? "s" : ""}`)

        // Fetch detections for live alerts
        if (tok) {
          const end = new Date()
          const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days lookback
          const page = await fetchDetections({
            token: tok,
            eventAfter: start.toISOString(),
            eventBefore: end.toISOString(),
            limit: 200,
            offset: 0,
          }).catch(() => ({ items: [] }))

          const incidents = buildIncidentCandidatesFromDetections(page.items || [], {
            severityFromLabel: (label) => {
              switch (label) {
                case "Accident Alert": return "critical"
                case "Possible Altercation":
                case "Suspicious Activity":
                case "Security Alert": return "high"
                case "Crowd Formation":
                case "Traffic Congestion":
                case "High Human Activity":
                case "Vehicle Cluster Detected": return "medium"
                default: return "low"
              }
            },
            isUploadedSource: (cameraId) => cameraId === "file-upload",
          })

          const dismissed = loadDismissedEventIds()
          const activeAlerts = incidents.filter((inc) => !dismissed.has(inc.id))
          setLiveAlerts(activeAlerts.length)
        } else {
          setLiveAlerts(0)
        }

        setSystemStatus("Operational")
        setSystemStatusColor("online")
      } catch (err) {
        console.error("Error updating dashboard stats:", err)
        if (active) {
          setSystemStatus("Degraded")
          setSystemStatusColor("warning")
        }
      }
    }

    void updateStats()

    const handleSync = () => {
      void updateStats()
    }
    window.addEventListener(CAMERA_FEEDS_SYNC_EVENT, handleSync)
    window.addEventListener("storage", handleSync)

    return () => {
      active = false
      window.removeEventListener(CAMERA_FEEDS_SYNC_EVENT, handleSync)
      window.removeEventListener("storage", handleSync)
    }
  }, [user])

  const stats = [
    { label: "Active Cameras", value: String(activeCameras), icon: Camera, status: activeCameras > 0 ? "online" : "offline" },
    { label: "Live Alerts", value: String(liveAlerts), icon: AlertTriangle, status: liveAlerts > 0 ? "warning" : "online" },
    { label: "System Status", value: systemStatus, icon: Activity, status: systemStatusColor },
    { label: "Coverage Areas", value: coverageAreas, icon: MapPin, status: activeCameras > 0 ? "online" : "offline" },
  ]

  const handleSignOut = async () => {
    if (isSigningOut) return
    setSignOutError(null)
    setIsSigningOut(true)
    try {
      onSignOut()
    } catch (e) {
      setSignOutError(e instanceof Error ? e.message : "Unable to sign out right now.")
    } finally {
      setIsSigningOut(false)
    }
  }

  const handleNavSection = useCallback(
    (id: string) => {
      if (id === "recordings") {
        router.push("/recordings")
        return
      }
      setActiveSection(id)
      if (id === "dashboard") {
        router.replace("/")
        return
      }
      router.replace(`/?section=${encodeURIComponent(id)}`)
    },
    [router],
  )

  const renderSection = () => {
    switch (activeSection) {
      case "map":
        return <MapView />
      case "search":
        return <TextSearch />
      case "events":
        return <EventsAlerts />
      case "recordings":
        return <RecordingsHistory />
      case "feeds":
        return <LiveFeedWall />
      case "settings":
        return <Settings />
      case "dashboard":
      default:
        return (
          <>
            {/* AI Welcome Section */}
            <div className="mb-8">
              <Card className="surface-panel border-primary/15 bg-gradient-to-r from-primary/5 to-blue-500/5">
                <CardHeader>
                  <CardTitle className="text-2xl font-bold text-foreground">
                    Hi Officer, Digimitra is ready to assist.
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Your advanced AI surveillance companion with voice-first interface is online and monitoring.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="secondary" onClick={() => handleNavSection("feeds")}>
                      <Monitor className="w-4 h-4 mr-2" />
                      Live Feed
                    </Button>
                    <Button variant="secondary" onClick={() => handleNavSection("recordings")}>
                      <Clapperboard className="w-4 h-4 mr-2" />
                      Recording History
                    </Button>
                    <Button variant="secondary" onClick={() => handleNavSection("events")}>
                      <Calendar className="w-4 h-4 mr-2" />
                      Events & Alerts
                    </Button>
                    <Button variant="secondary" onClick={() => handleNavSection("map")}>
                      <MapPin className="w-4 h-4 mr-2" />
                      Show Map
                    </Button>
                    <Button onClick={() => handleNavSection("search")}>
                      <Search className="w-4 h-4 mr-2" />
                      AI Operator
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {stats.map((stat, index) => (
                <Card key={index} className="surface-panel">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                    <stat.icon
                      className={`h-4 w-4 ${stat.status === "online"
                          ? "text-green-500"
                          : stat.status === "warning"
                            ? "text-yellow-500"
                            : "text-red-500"
                        }`}
                    />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                    <Badge variant={stat.status === "online" ? "default" : "destructive"} className="mt-2">
                      {stat.status === "online" ? "Online" : stat.status === "warning" ? "Alert" : "Offline"}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )
    }
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation
        activeSection={activeSection}
        onSectionChange={handleNavSection}
        onSignOut={() => void handleSignOut()}
        isSigningOut={isSigningOut}
      />

      {signOutError && (
        <div className="container mx-auto px-6 pt-4">
          <p className="text-sm text-destructive" role="alert">
            {signOutError}
          </p>
        </div>
      )}

      <main className="container mx-auto px-6 py-8">{renderSection()}</main>

      <AIAgentPanel />
    </div>
  )
}

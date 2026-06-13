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
import { Camera, AlertTriangle, Activity, MapPin, Search, Calendar, Mic, Clapperboard } from "lucide-react"
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

  const stats = [
    { label: "Active Cameras", value: "10", icon: Camera, status: "online" },
    { label: "Live Alerts", value: "14", icon: AlertTriangle, status: "warning" },
    { label: "System Status", value: "Operational", icon: Activity, status: "online" },
    { label: "Coverage Areas", value: "10 zones", icon: MapPin, status: "online" },
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
                    <Button variant="secondary" onClick={() => handleNavSection("recordings")}>
                      <Clapperboard className="w-4 h-4 mr-2" />
                      Recording history
                    </Button>
                    <Button variant="secondary" onClick={() => handleNavSection("search")}>
                      <Mic className="w-4 h-4 mr-2" />
                      Voice Command
                    </Button>
                    <Button variant="secondary" onClick={() => handleNavSection("map")}>
                      <MapPin className="w-4 h-4 mr-2" />
                      Show Map
                    </Button>
                    <Button variant="secondary" onClick={() => handleNavSection("events")}>
                      <Calendar className="w-4 h-4 mr-2" />
                      Open Events
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
                      className={`h-4 w-4 ${
                        stat.status === "online"
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

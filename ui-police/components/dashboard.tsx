"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AIAgentPanel } from "@/components/ai-agent-panel"
import { Navigation } from "@/components/navigation"
import { MapView } from "@/components/map-view"
import { TextSearch } from "@/components/text-search"
import { EventsAlerts } from "@/components/events-alerts"
import { LiveFeedWall } from "@/components/live-feed-wall"
import { LoadingScreen } from "@/components/loading-screen"
import { Settings } from "@/components/settings"
import { Camera, AlertTriangle, Activity, MapPin, Search, Calendar, Mic } from "lucide-react"

export function Dashboard() {
  const [activeSection, setActiveSection] = useState("dashboard")
  const [isLoading, setIsLoading] = useState(true)
  const [cameraCount, setCameraCount] = useState(0)
  const [onlineCount, setOnlineCount] = useState(0)
  const [eventCount, setEventCount] = useState(0)
  const [recentEvents, setRecentEvents] = useState<Array<{ id: string; type: string; camera: string; time: string }>>([])

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 3500) // Show loading for 3.5 seconds

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    const syncCameraStats = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setCameraCount(0)
        setOnlineCount(0)
        return
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        const cameraDevices = devices.filter((device) => device.kind === "videoinput")
        setCameraCount(cameraDevices.length)
        setOnlineCount(cameraDevices.length)
      } catch {
        if (cancelled) return
        setCameraCount(0)
        setOnlineCount(0)
      }
    }

    void syncCameraStats()
    setEventCount(0)
    setRecentEvents([])

    const onDeviceChange = () => {
      void syncCameraStats()
    }
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange)

    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange)
    }
  }, [])

  const stats = [
    { label: "Active Cameras", value: String(onlineCount), icon: Camera, status: "online" },
    { label: "Live Alerts", value: String(eventCount), icon: AlertTriangle, status: eventCount > 0 ? "warning" : "online" },
    { label: "System Status", value: "Operational", icon: Activity, status: "online" },
    { label: "Coverage Areas", value: String(cameraCount), icon: MapPin, status: "online" },
  ]

  const renderSection = () => {
    switch (activeSection) {
      case "map":
        return <MapView />
      case "search":
        return <TextSearch />
      case "events":
        return <EventsAlerts />
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
              <Card className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-500/20">
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
                    <Button
                      variant="outline"
                      className="border-green-500/30 hover:bg-green-500/10 bg-transparent"
                      onClick={() => setActiveSection("search")}
                    >
                      <Mic className="w-4 h-4 mr-2" />
                      Voice Command
                    </Button>
                    <Button
                      variant="outline"
                      className="border-blue-500/30 hover:bg-blue-500/10 bg-transparent"
                      onClick={() => setActiveSection("map")}
                    >
                      <MapPin className="w-4 h-4 mr-2" />
                      Show Map
                    </Button>
                    <Button
                      variant="outline"
                      className="border-blue-500/30 hover:bg-blue-500/10 bg-transparent"
                      onClick={() => setActiveSection("events")}
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      Open Events
                    </Button>
                    <Button
                      variant="outline"
                      className="border-blue-500/30 hover:bg-blue-500/10 bg-transparent"
                      onClick={() => setActiveSection("search")}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      AI Operator
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ... existing stats and events code ... */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {stats.map((stat, index) => (
                <Card key={index} className="bg-card/50 backdrop-blur-sm border-slate-700/50">
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

            {/* Recent Events */}
            <Card className="bg-card/50 backdrop-blur-sm border-slate-700/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  Recent Events
                </CardTitle>
                <CardDescription>Latest AI-detected activities and alerts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentEvents.map((event) => (
                    <div key={event.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary">event</Badge>
                        <div>
                          <p className="font-medium text-foreground">{event.type}</p>
                          <p className="text-sm text-muted-foreground">{event.camera}</p>
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground">{event.time}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )
    }
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation activeSection={activeSection} onSectionChange={setActiveSection} />

      <main className="container mx-auto px-6 py-8">{renderSection()}</main>

      <AIAgentPanel />
    </div>
  )
}

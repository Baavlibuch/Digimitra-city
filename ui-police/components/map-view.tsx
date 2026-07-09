"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Camera, MapPin, Play, Pause, RotateCcw, ZoomIn, ZoomOut, Search, X } from "lucide-react"

export interface CameraPin {
  id: string
  name: string
  lat: number
  lng: number
  status: "online" | "offline" | "alert"
  location: string
  locationName: string
  lastActivity: string
  thumbnail?: string
}

const LeafletMap = dynamic(
  () => import("./leaflet-map").then((mod) => mod.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-96 bg-slate-950 rounded-lg border border-border">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground text-sm">Loading map canvas...</p>
        </div>
      </div>
    ),
  }
)

export function MapView() {
  const [selectedCamera, setSelectedCamera] = useState<CameraPin | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [isPlaying, setIsPlaying] = useState(false)

  // Address Geocoding Search States
  const [addressQuery, setAddressQuery] = useState("")
  const [searchedLocation, setSearchedLocation] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [isSearchingAddress, setIsSearchingAddress] = useState(false)

  const handleAddressSearch = async () => {
    const query = addressQuery.trim()
    if (!query) return

    setIsSearchingAddress(true)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        {
          headers: {
            "User-Agent": "DigimitraCitySurveillance/1.0"
          }
        }
      )
      const data = await response.json()
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0]
        setSearchedLocation({
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          label: item.display_name
        })
      } else {
        alert("Location not found. Please try a different search.")
      }
    } catch (error) {
      console.error("Error geocoding address:", error)
      alert("Error finding address. Please try again.")
    } finally {
      setIsSearchingAddress(false)
    }
  }

  // Mock camera data
  const cameras: CameraPin[] = [
    {
      id: "1",
      name: "Camera 01",
      lat: 40.7128,
      lng: -74.006,
      status: "online",
      location: "Main Entrance",
      locationName: "Main Entrance",
      lastActivity: "2 min ago",
    },
    {
      id: "2",
      name: "Camera 02",
      lat: 40.7589,
      lng: -73.9851,
      status: "alert",
      location: "Parking Lot A",
      locationName: "Parking Lot A",
      lastActivity: "1 min ago",
    },
    {
      id: "3",
      name: "Camera 03",
      lat: 40.7505,
      lng: -73.9934,
      status: "online",
      location: "Emergency Exit",
      locationName: "Emergency Exit",
      lastActivity: "5 min ago",
    },
    {
      id: "4",
      name: "Camera 04",
      lat: 40.7282,
      lng: -73.7949,
      status: "offline",
      location: "Loading Dock",
      locationName: "Loading Dock",
      lastActivity: "1 hour ago",
    },
    {
      id: "5",
      name: "Camera 05",
      lat: 40.6892,
      lng: -74.0445,
      status: "online",
      location: "Reception Area",
      locationName: "Reception Area",
      lastActivity: "30 sec ago",
    },
    {
      id: "6",
      name: "Camera 06",
      lat: 40.7831,
      lng: -73.9712,
      status: "alert",
      location: "Corridor B",
      locationName: "Corridor B",
      lastActivity: "3 min ago",
    },
    {
      id: "7",
      name: "Camera 07",
      lat: 40.7306,
      lng: -73.9352,
      status: "online",
      location: "Sector 62",
      locationName: "Sector 62",
      lastActivity: "4 min ago",
    },
    {
      id: "8",
      name: "Camera 08",
      lat: 40.7206,
      lng: -73.9252,
      status: "online",
      location: "Sector 62",
      locationName: "Sector 62",
      lastActivity: "Just now",
    },
    {
      id: "9",
      name: "Camera 09",
      lat: 40.7150,
      lng: -73.9850,
      status: "online",
      location: "Delhi Gate",
      locationName: "Delhi Gate",
      lastActivity: "10 min ago",
    },
    {
      id: "10",
      name: "Camera 10",
      lat: 40.7450,
      lng: -73.9750,
      status: "online",
      location: "North Wing",
      locationName: "North Wing",
      lastActivity: "8 min ago",
    },
    {
      id: "11",
      name: "Camera 11",
      lat: 40.7600,
      lng: -73.9800,
      status: "online",
      location: "Parking Lot A",
      locationName: "Parking Lot A",
      lastActivity: "12 min ago",
    },
  ]

  // Automatically select camera if there is exactly 1 match for search query
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return
    }

    const matches = cameras.filter((camera) => {
      const matchesStatus = filterStatus === "all" || camera.status === filterStatus
      const matchesSearch =
        camera.name.toLowerCase().includes(query) ||
        camera.location.toLowerCase().includes(query) ||
        camera.locationName.toLowerCase().includes(query)
      return matchesStatus && matchesSearch
    })

    if (matches.length === 1) {
      setSelectedCamera(matches[0])
    } else {
      setSelectedCamera(null)
    }
  }, [searchQuery, filterStatus])

  const filteredCameras = cameras.filter((camera) => {
    const matchesStatus = filterStatus === "all" || camera.status === filterStatus
    const matchesSearch =
      camera.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      camera.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      camera.locationName.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "bg-green-500"
      case "alert":
        return "bg-red-500 animate-pulse"
      case "offline":
        return "bg-gray-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Camera Map View</h1>
          <p className="text-muted-foreground">Monitor all surveillance cameras in real-time</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Camera Search */}
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search cameras..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48"
            />
          </div>

          {/* Address Search */}
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-500 animate-bounce" />
            <div className="relative flex items-center">
              <Input
                placeholder="Search address..."
                value={addressQuery}
                onChange={(e) => setAddressQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleAddressSearch()
                  }
                }}
                className="w-48 pr-6"
              />
              {addressQuery && (
                <button
                  type="button"
                  className="absolute right-2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setAddressQuery("")
                    setSearchedLocation(null)
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleAddressSearch()}
              disabled={isSearchingAddress}
            >
              {isSearchingAddress ? "..." : "Go"}
            </Button>
          </div>

          {/* Status Filter */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="alert">Alert</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Area */}
        <div className="lg:col-span-2">
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-500" />
                Interactive Map
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full h-96">
                <LeafletMap
                  cameras={filteredCameras}
                  selectedCamera={selectedCamera}
                  onSelectCamera={setSelectedCamera}
                  searchQuery={searchQuery}
                  searchedLocation={searchedLocation}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Camera List & Live Feed */}
        <div className="space-y-6">
          {/* Camera List */}
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Camera List</span>
                <Badge variant="secondary">{filteredCameras.length} cameras</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {filteredCameras.map((camera) => (
                  <div
                    key={camera.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedCamera?.id === camera.id
                        ? "bg-blue-500/20 border-blue-500/50"
                        : "bg-muted/50 border-border hover:bg-muted"
                    }`}
                    onClick={() => setSelectedCamera(camera)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(camera.status)}`} />
                        <div>
                          <p className="font-medium text-sm text-foreground">{camera.name}</p>
                          <p className="text-xs text-muted-foreground">{camera.location}</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{camera.lastActivity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Live Feed */}
          {selectedCamera && (
            <Card className="surface-panel">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="w-5 h-5 text-blue-500" />
                    {selectedCamera.name}
                  </CardTitle>
                  <Button size="icon" variant="ghost" onClick={() => setSelectedCamera(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Mock Video Feed */}
                <div className="relative w-full h-48 bg-black rounded-lg overflow-hidden mb-4">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Camera className="w-12 h-12 text-gray-500 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">Live Feed</p>
                      <p className="text-gray-400 text-xs">{selectedCamera.location}</p>
                    </div>
                  </div>

                  {/* Video Controls Overlay */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="secondary"
                        className="w-8 h-8"
                        onClick={() => setIsPlaying(!isPlaying)}
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                      <Button size="icon" variant="secondary" className="w-8 h-8">
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    </div>
                    <Badge variant={selectedCamera.status === "online" ? "default" : "destructive"} className="text-xs">
                      {selectedCamera.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>

                {/* Camera Info */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Location:</span>
                    <span className="text-foreground">{selectedCamera.location}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last Activity:</span>
                    <span className="text-foreground">{selectedCamera.lastActivity}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant={selectedCamera.status === "online" ? "default" : "destructive"}>
                      {selectedCamera.status}
                    </Badge>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 mt-4">
                  <Button size="sm" className="flex-1">
                    Pin to Dashboard
                  </Button>
                  <Button size="sm" variant="secondary" className="flex-1">
                    View History
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

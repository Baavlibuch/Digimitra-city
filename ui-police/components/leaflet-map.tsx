"use client"

import { useEffect } from "react"
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css"
import "leaflet-defaulticon-compatibility"
import { ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface CameraPin {
  id: string
  name: string
  lat: number
  lng: number
  status: "online" | "offline" | "alert"
  location: string
  lastActivity: string
  thumbnail?: string
}

interface LeafletMapProps {
  cameras: CameraPin[]
  selectedCamera: CameraPin | null
  onSelectCamera: (camera: CameraPin) => void
}

// Subcomponent inside MapContainer to access the map instance via useMap() hook
function MapController({
  selectedCamera,
}: {
  selectedCamera: CameraPin | null
}) {
  const map = useMap()

  // Smoothly fly to selected camera when it changes
  useEffect(() => {
    if (selectedCamera) {
      map.flyTo([selectedCamera.lat, selectedCamera.lng], 13, {
        animate: true,
        duration: 1.5,
      })
    }
  }, [selectedCamera, map])

  // Custom Zoom controls that trigger Map Container methods directly
  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000] pointer-events-auto">
      <Button
        size="icon"
        variant="secondary"
        className="w-8 h-8 shadow-md"
        onClick={(e) => {
          e.stopPropagation()
          map.zoomIn()
        }}
      >
        <ZoomIn className="w-4 h-4" />
      </Button>
      <Button
        size="icon"
        variant="secondary"
        className="w-8 h-8 shadow-md"
        onClick={(e) => {
          e.stopPropagation()
          map.zoomOut()
        }}
      >
        <ZoomOut className="w-4 h-4" />
      </Button>
    </div>
  )
}

// Custom DivIcon generator to render beautifully styled and color-coded status pins
const getMarkerIcon = (status: "online" | "offline" | "alert", isSelected: boolean) => {
  const statusColor =
    status === "online"
      ? "bg-emerald-500"
      : status === "alert"
        ? "bg-rose-500"
        : "bg-zinc-500"

  const pulseClass = status === "alert" ? "animate-pulse" : ""
  
  const selectedBorder = isSelected
    ? "border-amber-400 scale-125 ring-4 ring-amber-400/30"
    : "border-white hover:scale-110"

  return L.divIcon({
    html: `
      <style>
        .custom-camera-marker-container {
          background: transparent !important;
          border: none !important;
        }
      </style>
      <div class="relative w-8 h-8 rounded-full border-2 ${selectedBorder} flex items-center justify-center cursor-pointer shadow-md transition-all duration-300 ${statusColor} ${pulseClass}">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-white">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </div>
    `,
    className: "custom-camera-marker-container",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

export function LeafletMap({ cameras, selectedCamera, onSelectCamera }: LeafletMapProps) {
  // Centroid of all mock cameras in NYC
  const defaultCenter: [number, number] = [40.7371, -73.9658]
  const defaultZoom = 11

  return (
    <div className="relative w-full h-full min-h-[384px] bg-slate-950 rounded-lg overflow-hidden border border-border">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        zoomControl={false} // Disabled default controls to use custom styled buttons
        style={{ height: "100%", width: "100%", background: "transparent" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        {cameras.map((camera) => (
          <Marker
            key={camera.id}
            position={[camera.lat, camera.lng]}
            icon={getMarkerIcon(camera.status, selectedCamera?.id === camera.id)}
            eventHandlers={{
              click: () => onSelectCamera(camera),
            }}
          />
        ))}
        <MapController selectedCamera={selectedCamera} />
      </MapContainer>
    </div>
  )
}

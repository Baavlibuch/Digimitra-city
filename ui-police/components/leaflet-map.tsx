"use client"

import { useEffect, useRef, useState } from "react"
import { MapContainer, TileLayer, Marker, useMap, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css"
import "leaflet-defaulticon-compatibility"
import { ZoomIn, ZoomOut, Locate } from "lucide-react"
import { Button } from "@/components/ui/button"

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

interface LeafletMapProps {
  cameras: CameraPin[]
  selectedCamera: CameraPin | null
  onSelectCamera: (camera: CameraPin) => void
  searchQuery: string
  searchedLocation: { lat: number; lng: number; label: string } | null
}

// Subcomponent inside MapContainer to access the map instance via useMap() hook
function MapController({
  selectedCamera,
  cameras,
  searchQuery,
  markerRefs,
  searchedLocation,
  searchedMarkerRef,
  userLocation,
  setUserLocation,
}: {
  selectedCamera: CameraPin | null
  cameras: CameraPin[]
  searchQuery: string
  markerRefs: React.MutableRefObject<Record<string, L.Marker | null>>
  searchedLocation: { lat: number; lng: number; label: string } | null
  searchedMarkerRef: React.RefObject<L.Marker | null>
  userLocation: [number, number] | null
  setUserLocation: (loc: [number, number] | null) => void
}) {
  const map = useMap()
  const hasFetchedRef = useRef(false)
  const selectedCameraRef = useRef(selectedCamera)
  const searchedLocationRef = useRef(searchedLocation)

  // Keep refs up-to-date
  useEffect(() => {
    selectedCameraRef.current = selectedCamera
    searchedLocationRef.current = searchedLocation
  }, [selectedCamera, searchedLocation])

  // Automatically fetch live location on mount
  useEffect(() => {
    if (hasFetchedRef.current) return

    if (navigator.geolocation) {
      hasFetchedRef.current = true
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          setUserLocation([latitude, longitude])
          // Only fly to user location if they haven't selected a camera or searched for a location
          if (!selectedCameraRef.current && !searchedLocationRef.current) {
            map.flyTo([latitude, longitude], 13, { animate: true, duration: 1.5 })
          }
        },
        (error) => {
          console.error("Error getting live location on mount:", error)
        }
      )
    }
  }, [map, setUserLocation])

  // Click handler to request current GPS coordinates
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setUserLocation([latitude, longitude])
        map.flyTo([latitude, longitude], 16, { animate: true, duration: 1.5 })
      },
      (error) => {
        console.error("Error getting location:", error)
        alert("Unable to retrieve your location. Please check browser permissions.")
      }
    )
  }

  // Smoothly fly to selected camera when it changes or fit bounds for multiple cameras
  useEffect(() => {
    if (selectedCamera) {
      map.flyTo([selectedCamera.lat, selectedCamera.lng], 16, {
        animate: true,
        duration: 1.5,
      })

      // Programmatically open marker popup
      const marker = markerRefs.current[selectedCamera.id]
      if (marker) {
        const timer = setTimeout(() => {
          marker.openPopup()
        }, 1200)
        return () => clearTimeout(timer)
      }
    } else if (searchedLocation) {
      // Fly to geocoded searched location
      map.flyTo([searchedLocation.lat, searchedLocation.lng], 15, {
        animate: true,
        duration: 1.5,
      })

      // Programmatically open searched location popup
      const timer = setTimeout(() => {
        if (searchedMarkerRef.current) {
          searchedMarkerRef.current.openPopup()
        }
      }, 1200)
      return () => clearTimeout(timer)
    } else if (searchQuery.trim() !== "" && cameras.length > 1) {
      // Fit bounds to show all matching cameras
      const bounds = L.latLngBounds(cameras.map((c) => [c.lat, c.lng]))
      map.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 16,
        animate: true,
        duration: 1.5,
      })
    }
  }, [selectedCamera, cameras, searchQuery, map, markerRefs, searchedLocation, searchedMarkerRef])

  // Custom Controls that trigger Map Container methods directly
  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000] pointer-events-auto">
      <Button
        size="icon"
        variant="secondary"
        className="w-8 h-8 shadow-md"
        title="Zoom In"
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
        title="Zoom Out"
        onClick={(e) => {
          e.stopPropagation()
          map.zoomOut()
        }}
      >
        <ZoomOut className="w-4 h-4" />
      </Button>
      <Button
        size="icon"
        variant="secondary"
        className="w-8 h-8 shadow-md text-blue-500 hover:text-blue-600"
        title="Locate Me"
        onClick={(e) => {
          e.stopPropagation()
          handleLocateMe()
        }}
      >
        <Locate className="w-4 h-4" />
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

// Custom icon for geocoded searched locations (Green Pin)
const getSearchedLocationIcon = () => {
  return L.divIcon({
    html: `
      <div class="relative w-8 h-8 rounded-full border-2 border-emerald-400 scale-125 flex items-center justify-center cursor-pointer shadow-md bg-emerald-500 ring-4 ring-emerald-400/30">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-white">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    `,
    className: "custom-camera-marker-container",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

// Custom icon for user live location (Blue dot with ping animation)
const getUserLocationIcon = () => {
  return L.divIcon({
    html: `
      <div class="relative w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shadow-md bg-blue-500">
        <div class="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-75"></div>
        <div class="w-3.5 h-3.5 rounded-full bg-white"></div>
      </div>
    `,
    className: "custom-camera-marker-container",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

export function LeafletMap({ cameras, selectedCamera, onSelectCamera, searchQuery, searchedLocation }: LeafletMapProps) {
  // Centroid of all mock cameras in NYC
  const defaultCenter: [number, number] = [40.7371, -73.9658]
  const defaultZoom = 11

  // Ref container to hold all camera marker instances for programmatic control (e.g. openPopup)
  const markerRefs = useRef<Record<string, L.Marker | null>>({})
  
  // Ref container to hold searched location marker
  const searchedMarkerRef = useRef<L.Marker | null>(null)

  // State to store user live GPS position
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)

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
        
        {/* Render Camera Markers */}
        {cameras.map((camera) => (
          <Marker
            key={camera.id}
            ref={(ref) => {
              if (ref) {
                markerRefs.current[camera.id] = ref
              } else {
                delete markerRefs.current[camera.id]
              }
            }}
            position={[camera.lat, camera.lng]}
            icon={getMarkerIcon(
              camera.status,
              selectedCamera?.id === camera.id || (searchQuery.trim() !== "" && cameras.length > 0)
            )}
            eventHandlers={{
              click: () => onSelectCamera(camera),
            }}
          >
            <Popup>
              <div className="p-1 min-w-[120px] text-slate-900 font-sans">
                <p className="font-bold text-sm leading-tight">{camera.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{camera.location}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className={`w-2 h-2 rounded-full ${
                    camera.status === 'online' ? 'bg-emerald-500' : camera.status === 'alert' ? 'bg-rose-500' : 'bg-zinc-500'
                  }`} />
                  <span className="text-[10px] font-semibold uppercase text-slate-700">
                    {camera.status}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Render User Live Location Marker */}
        {userLocation && (
          <Marker
            position={userLocation}
            icon={getUserLocationIcon()}
          >
            <Popup>
              <div className="p-1 text-slate-900 font-sans">
                <p className="font-bold text-sm">Your Location</p>
                <p className="text-xs text-slate-500">Live GPS Coordinates</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Render Searched Address Marker */}
        {searchedLocation && (
          <Marker
            position={[searchedLocation.lat, searchedLocation.lng]}
            icon={getSearchedLocationIcon()}
            ref={searchedMarkerRef}
          >
            <Popup>
              <div className="p-1 max-w-[200px] text-slate-900 font-sans">
                <p className="font-bold text-sm">Searched Location</p>
                <p className="text-xs text-slate-600 mt-1 leading-tight">{searchedLocation.label}</p>
              </div>
            </Popup>
          </Marker>
        )}

        <MapController
          selectedCamera={selectedCamera}
          cameras={cameras}
          searchQuery={searchQuery}
          markerRefs={markerRefs}
          searchedLocation={searchedLocation}
          searchedMarkerRef={searchedMarkerRef}
          userLocation={userLocation}
          setUserLocation={setUserLocation}
        />
      </MapContainer>
    </div>
  )
}

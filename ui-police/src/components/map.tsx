'use client';

import { useState } from 'react';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import "leaflet-defaulticon-compatibility";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LatLngTuple } from 'leaflet';
import { LiveVideoPlayer } from '@/src/streaming/components/live-video-player';
import { useWebcamStream } from '@/src/streaming/hooks/use-webcam-stream';

// Define a type that matches the mock data structure and includes optional properties
interface Camera {
  id: string;
  name: string;
  stream_status: string;
  position: LatLngTuple; // Use the specific LatLngTuple type from Leaflet
}

const Map = () => {
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([])
  const { stream, status, error } = useWebcamStream()

  useEffect(() => {
    let cancelled = false

    const loadLocalCameras = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setCameras([])
        return
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        const localCameras = devices
          .filter((device) => device.kind === "videoinput")
          .map((device, index) => ({
            id: device.deviceId || `camera-${index + 1}`,
            name: device.label || `Camera ${index + 1}`,
            stream_status: "online",
            position: [34.0522 + index * 0.001, -118.2437 + index * 0.001] as LatLngTuple,
          }))
        setCameras(localCameras)
      } catch {
        if (cancelled) return
        setCameras([])
      }
    }

    void loadLocalCameras()
    return () => {
      cancelled = true
    }
  }, [])

  const MapEvents = () => {
    useMapEvents({
      click() {
        // You can add logic here if needed when the map is clicked
      },
    });
    return null;
  };

  const handleMarkerClick = (camera: Camera) => {
    setSelectedCamera(camera);
  };

  return (
    <>
      <MapContainer center={[34.0522, -118.2437]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        {(cameras as Camera[]).map((camera) => (
          <Marker key={camera.id} position={camera.position}>
            <Popup>
              <b>{camera.name}</b><br />
              Status: {camera.stream_status}<br />
              <Button size="sm" className="mt-2" onClick={() => handleMarkerClick(camera)}>Live Feed</Button>
            </Popup>
          </Marker>
        ))}
        <MapEvents />
      </MapContainer>

      <Dialog open={selectedCamera !== null} onOpenChange={() => setSelectedCamera(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedCamera?.name} - Live Feed</DialogTitle>
          </DialogHeader>
          <div className="h-[280px] rounded-md overflow-hidden bg-black">
            {selectedCamera && <LiveVideoPlayer stream={stream} loading={status === "loading"} error={error} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Map;

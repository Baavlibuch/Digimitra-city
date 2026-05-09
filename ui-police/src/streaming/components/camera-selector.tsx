"use client"

import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { WebcamDevice } from "@/src/streaming/hooks/use-webcam-stream"

type CameraSelectorProps = {
  devices: WebcamDevice[]
  value: string | null
  onChange: (deviceId: string) => void
  disabled?: boolean
}

export function CameraSelector({ devices, value, onChange, disabled = false }: CameraSelectorProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="camera-select">Camera</Label>
      <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled || devices.length === 0}>
        <SelectTrigger id="camera-select" className="w-full">
          <SelectValue placeholder={devices.length > 0 ? "Select camera" : "No camera detected"} />
        </SelectTrigger>
        <SelectContent>
          {devices.map((device) => (
            <SelectItem key={device.deviceId} value={device.deviceId}>
              {device.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

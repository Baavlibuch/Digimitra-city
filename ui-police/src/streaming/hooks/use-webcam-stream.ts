"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export type WebcamDevice = {
  deviceId: string
  label: string
}

type WebcamStatus = "idle" | "loading" | "live" | "error"

type UseWebcamStreamResult = {
  devices: WebcamDevice[]
  selectedDeviceId: string | null
  stream: MediaStream | null
  status: WebcamStatus
  error: string | null
  setSelectedDeviceId: (deviceId: string) => void
  refreshDevices: () => Promise<void>
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

function toWebcamDevices(devices: MediaDeviceInfo[]): WebcamDevice[] {
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }))
}

export function useWebcamStream(): UseWebcamStreamResult {
  const [devices, setDevices] = useState<WebcamDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<WebcamStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError("This browser does not support camera detection.")
      setDevices([])
      setSelectedDeviceIdState(null)
      return
    }

    const allDevices = await navigator.mediaDevices.enumerateDevices()
    const webcams = toWebcamDevices(allDevices)
    setDevices(webcams)
    setSelectedDeviceIdState((current) => {
      if (current && webcams.some((camera) => camera.deviceId === current)) return current
      return webcams[0]?.deviceId ?? null
    })
  }, [])

  const setSelectedDeviceId = useCallback((deviceId: string) => {
    setSelectedDeviceIdState(deviceId)
  }, [])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      setStatus("loading")
      setError(null)
      try {
        const initialStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        if (cancelled) {
          stopStream(initialStream)
          return
        }
        streamRef.current = initialStream
        setStream(initialStream)
        await refreshDevices()
        setStatus("live")
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera permission denied. Please allow camera access and refresh."
            : err instanceof Error
              ? err.message
              : "Unable to access the camera."
        setError(message)
        setStatus("error")
        setStream(null)
      }
    }

    void init()

    return () => {
      cancelled = true
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [refreshDevices])

  useEffect(() => {
    if (!selectedDeviceId) return

    let cancelled = false

    const startSelectedCamera = async () => {
      setStatus("loading")
      setError(null)
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: selectedDeviceId } },
          audio: false,
        })
        if (cancelled) {
          stopStream(nextStream)
          return
        }

        stopStream(streamRef.current)
        streamRef.current = nextStream
        setStream(nextStream)
        setStatus("live")
      } catch (err) {
        if (cancelled) return
        const message =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Camera permission denied. Please allow camera access."
            : err instanceof Error
              ? err.message
              : "Unable to initialize selected camera."
        setError(message)
        setStatus("error")
      }
    }

    void startSelectedCamera()

    return () => {
      cancelled = true
    }
  }, [selectedDeviceId])

  return useMemo(
    () => ({
      devices,
      selectedDeviceId,
      stream,
      status,
      error,
      setSelectedDeviceId,
      refreshDevices,
    }),
    [devices, selectedDeviceId, stream, status, error, setSelectedDeviceId, refreshDevices],
  )
}

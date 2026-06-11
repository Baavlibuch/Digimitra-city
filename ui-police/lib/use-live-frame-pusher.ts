"use client"

/**
 * Pushes JPEG frames at ~1 FPS to live-detection-agent (via API proxy).
 * Completely separate from MediaRecorder / recording upload pipeline.
 */

import { useEffect, useRef } from "react"
import { fetchSurveillanceAccessToken } from "@/lib/surveillance-api"
import { isLiveWebSocketEnabled, surveillanceApiBase } from "@/lib/live-ws-config"

const FRAME_INTERVAL_MS = 1000

type Options = {
  cameraId: string
  operatorUsername: string
  enabled: boolean
}

export function useLiveFramePusher(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  { cameraId, operatorUsername, enabled }: Options,
) {
  const tokenRef = useRef<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!enabled || !isLiveWebSocketEnabled() || !cameraId || !operatorUsername.trim()) return

    let active = true
    const canvas = document.createElement("canvas")
    canvasRef.current = canvas

    const pushFrame = async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2 || !video.videoWidth) return

      try {
        let tok = tokenRef.current
        if (!tok) {
          tok = await fetchSurveillanceAccessToken(operatorUsername)
          tokenRef.current = tok
        }

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.drawImage(video, 0, 0)
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.75),
        )
        if (!blob || !active) return

        const base = surveillanceApiBase()
        await fetch(`${base}/api/v1/live/frames/${encodeURIComponent(cameraId)}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tok}`,
            "Content-Type": "image/jpeg",
          },
          body: blob,
        })
      } catch {
        tokenRef.current = null
      }
    }

    const id = window.setInterval(() => {
      void pushFrame()
    }, FRAME_INTERVAL_MS)

    return () => {
      active = false
      window.clearInterval(id)
      canvasRef.current = null
    }
  }, [videoRef, cameraId, operatorUsername, enabled])
}

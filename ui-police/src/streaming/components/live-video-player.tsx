"use client"

import { useEffect, useRef } from "react"

type LiveVideoPlayerProps = {
  stream: MediaStream | null
  loading: boolean
  error: string | null
}

export function LiveVideoPlayer({ stream, loading, error }: LiveVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl) return
    videoEl.srcObject = stream
    if (stream) {
      void videoEl.play().catch(() => {
        // Browser autoplay restrictions can reject play; muted autoplay still works in most cases.
      })
    }
  }, [stream])

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-black">
      {(loading || error) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 px-4 text-center">
          <p className="text-sm text-white">{loading ? "Initializing camera..." : error}</p>
        </div>
      )}
      <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />
    </div>
  )
}

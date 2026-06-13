"use client"

import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

type EventInferenceBannerProps = {
  label: string
  /** Optional wall-clock / offset caption (playback only). */
  clock?: string | null
  /** Stable key for enter animation when label changes. */
  bannerKey?: string
  /** Compact overlay for semantic search thumbnails. */
  compact?: boolean
  className?: string
}

export function EventInferenceBanner({
  label,
  clock,
  bannerKey,
  compact = false,
  className,
}: EventInferenceBannerProps) {
  if (!label.trim()) return null

  if (compact) {
    return (
      <div
        key={bannerKey}
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 px-1 pb-1",
          className,
        )}
      >
        <div className="rounded border border-orange-500/35 bg-slate-950/92 px-1.5 py-0.5 text-center shadow backdrop-blur-sm">
          <div className="flex items-center justify-center gap-1 text-orange-200">
            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate text-[9px] font-semibold leading-tight">{label}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      key={bannerKey}
      className={cn(
        "pointer-events-none absolute bottom-14 left-1/2 z-20 w-[min(100%,22rem)] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-300",
        className,
      )}
    >
      <div className="rounded-lg border border-orange-500/35 bg-slate-950/92 px-4 py-2.5 text-center shadow-lg backdrop-blur-sm">
        <div className="flex items-center justify-center gap-2 text-orange-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold">{label}</span>
        </div>
        {clock ? <p className="mt-1 font-mono text-xs text-slate-400">{clock}</p> : null}
      </div>
    </div>
  )
}

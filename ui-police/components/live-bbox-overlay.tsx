"use client"

import { useMemo } from "react"

type Props = {
  bboxes: number[][]
  frameWidth?: number
  frameHeight?: number
  color?: string
}

/** Renders live alert bounding boxes as percentage overlays on a video tile. */
export function LiveBboxOverlay({ bboxes, frameWidth = 1920, frameHeight = 1080, color = "#ef4444" }: Props) {
  const rects = useMemo(() => {
    return bboxes.map((bb) => {
      const [x1, y1, x2, y2] = bb
      return {
        left: (x1 / frameWidth) * 100,
        top: (y1 / frameHeight) * 100,
        width: ((x2 - x1) / frameWidth) * 100,
        height: ((y2 - y1) / frameHeight) * 100,
      }
    })
  }, [bboxes, frameWidth, frameHeight])

  if (rects.length === 0) return null

  return (
    <div className="absolute inset-0 z-[15] pointer-events-none">
      {rects.map((r, i) => (
        <div
          key={i}
          className="absolute border-2 rounded-sm"
          style={{
            left: `${r.left}%`,
            top: `${r.top}%`,
            width: `${Math.max(r.width, 1)}%`,
            height: `${Math.max(r.height, 1)}%`,
            borderColor: color,
            boxShadow: `0 0 6px ${color}88`,
          }}
        />
      ))}
    </div>
  )
}

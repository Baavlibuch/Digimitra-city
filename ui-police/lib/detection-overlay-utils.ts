import type { DetectionDto } from "@/lib/surveillance-api"

/** How long a sparse YOLO sample stays visible during playback (ms). */
export const DETECTION_VISIBLE_WINDOW_MS = 1800

export type ParsedBBox = {
  x1: number
  y1: number
  x2: number
  y2: number
  frameW: number
  frameH: number
}

export type DisplayRect = {
  left: number
  top: number
  width: number
  height: number
}

export type TimelineMarker = {
  id: string
  offsetMs: number
  label: string
  kind: "detection" | "search" | "event"
}

export type SearchEvidenceContext = {
  query: string
  similarity: number
  offsetMs: number
}

export function parseBoundingBox(raw: Record<string, unknown>): ParsedBBox | null {
  const xyxy = raw.xyxy
  if (!Array.isArray(xyxy) || xyxy.length < 4) return null
  const [x1, y1, x2, y2] = xyxy.map(Number)
  if ([x1, y1, x2, y2].some((n) => !Number.isFinite(n))) return null

  let frameW = 0
  let frameH = 0
  const shape = raw.frame_shape
  if (Array.isArray(shape) && shape.length >= 2) {
    frameH = Number(shape[0])
    frameW = Number(shape[1])
  }
  if (!frameW || !frameH) {
    frameW = Math.max(x2, 1)
    frameH = Math.max(y2, 1)
  }
  return { x1, y1, x2, y2, frameW, frameH }
}

/** Map frame-space bbox to CSS % within the letterboxed video content area. */
export function bboxToPercentRect(
  bbox: ParsedBBox,
  layout: { offsetX: number; offsetY: number; renderW: number; renderH: number },
): DisplayRect {
  const scaleX = layout.renderW / bbox.frameW
  const scaleY = layout.renderH / bbox.frameH
  const left = layout.offsetX + bbox.x1 * scaleX
  const top = layout.offsetY + bbox.y1 * scaleY
  const width = Math.max(2, (bbox.x2 - bbox.x1) * scaleX)
  const height = Math.max(2, (bbox.y2 - bbox.y1) * scaleY)
  return { left, top, width, height }
}

export function computeVideoContentLayout(
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number,
): { offsetX: number; offsetY: number; renderW: number; renderH: number } {
  if (!containerW || !containerH || !videoW || !videoH) {
    return { offsetX: 0, offsetY: 0, renderW: containerW, renderH: containerH }
  }
  const containerAspect = containerW / containerH
  const videoAspect = videoW / videoH
  let renderW: number
  let renderH: number
  if (videoAspect > containerAspect) {
    renderW = containerW
    renderH = containerW / videoAspect
  } else {
    renderH = containerH
    renderW = containerH * videoAspect
  }
  return {
    offsetX: (containerW - renderW) / 2,
    offsetY: (containerH - renderH) / 2,
    renderW,
    renderH,
  }
}

export function formatObjectLabel(objectType: string, confidence: number): string {
  const name = objectType.charAt(0).toUpperCase() + objectType.slice(1)
  return `${name} (${Math.round(confidence * 100)}%)`
}

export function detectionsAtTime(
  detections: DetectionDto[],
  currentMs: number,
  windowMs = DETECTION_VISIBLE_WINDOW_MS,
): DetectionDto[] {
  return detections.filter((d) => Math.abs(d.timestamp_offset_ms - currentMs) <= windowMs)
}

export function nearestDetection(
  detections: DetectionDto[],
  targetMs: number,
): DetectionDto | null {
  if (detections.length === 0) return null
  let best = detections[0]
  let bestDist = Math.abs(best.timestamp_offset_ms - targetMs)
  for (let i = 1; i < detections.length; i++) {
    const d = detections[i]
    const dist = Math.abs(d.timestamp_offset_ms - targetMs)
    if (dist < bestDist) {
      best = d
      bestDist = dist
    }
  }
  return best
}

const VEHICLE_OBJECT_TYPES = ["car", "truck", "bus", "motorcycle"]
const COLLISION_MIN_OVERLAP_RATIO = 0.04

function bboxArea(box: ParsedBBox): number {
  return Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1)
}

function bboxOverlapRatio(a: ParsedBBox, b: ParsedBBox): number {
  const overlapW = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)
  const overlapH = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
  if (overlapW <= 0 || overlapH <= 0) return 0
  const intersection = overlapW * overlapH
  const minArea = Math.min(bboxArea(a), bboxArea(b))
  if (minArea <= 0) return 0
  return intersection / minArea
}

function boxesColliding(a: ParsedBBox, b: ParsedBBox): boolean {
  if (bboxOverlapRatio(a, b) >= COLLISION_MIN_OVERLAP_RATIO) return true
  const dx = Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2))
  const dy = Math.max(0, Math.max(a.y1, b.y1) - Math.min(a.y2, b.y2))
  const gap = Math.hypot(dx, dy)
  if (gap === 0) return true
  const ref =
    Math.min(
      Math.hypot(a.x2 - a.x1, a.y2 - a.y1),
      Math.hypot(b.x2 - b.x1, b.y2 - b.y1),
    ) * 0.04
  return gap <= ref
}

function detectionsByTimestamp<T extends DetectionDto>(items: T[]): Map<number, T[]> {
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const ts = item.timestamp_offset_ms
    const group = groups.get(ts)
    if (group) group.push(item)
    else groups.set(ts, [item])
  }
  return groups
}

function hasSameFrameVehicleCollision(vehicles: DetectionDto[]): boolean {
  for (const group of detectionsByTimestamp(vehicles).values()) {
    if (group.length < 2) continue
    const boxes: ParsedBBox[] = []
    for (const vehicle of group) {
      const bbox = parseBoundingBox(vehicle.bounding_box)
      if (bbox) boxes.push(bbox)
    }
    if (boxes.length < 2) continue
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxesColliding(boxes[i], boxes[j])) return true
      }
    }
  }
  return false
}

function hasSameFramePersonVehicleCollision(
  persons: DetectionDto[],
  vehicles: DetectionDto[],
): boolean {
  const vehiclesByTs = detectionsByTimestamp(vehicles)
  for (const [ts, personGroup] of detectionsByTimestamp(persons)) {
    const vehicleGroup = vehiclesByTs.get(ts)
    if (!vehicleGroup?.length) continue
    const personBoxes = personGroup
      .map((person) => parseBoundingBox(person.bounding_box))
      .filter((bbox): bbox is ParsedBBox => bbox != null)
    const vehicleBoxes = vehicleGroup
      .map((vehicle) => parseBoundingBox(vehicle.bounding_box))
      .filter((bbox): bbox is ParsedBBox => bbox != null)
    if (personBoxes.length === 0 || vehicleBoxes.length === 0) continue
    for (const personBox of personBoxes) {
      for (const vehicleBox of vehicleBoxes) {
        if (boxesColliding(personBox, vehicleBox)) return true
      }
    }
  }
  return false
}

export function eventBannerLabel(detections: DetectionDto[]): string | null {
  if (detections.length === 0) return null
  const persons = detections.filter((d) => d.object_type === "person")
  const vehicles = detections.filter((d) => VEHICLE_OBJECT_TYPES.includes(d.object_type))
  const backpacks = detections.filter((d) => d.object_type === "backpack")

  if (persons.length >= 10) return "Crowd Formation"

  if (persons.length >= 2 && vehicles.length >= 2) return "Everything's Idle"
  if (vehicles.length >= 100) return "Traffic Congestion"
  const possibleCollision =
    hasSameFrameVehicleCollision(vehicles) ||
    hasSameFramePersonVehicleCollision(persons, vehicles)
  if (possibleCollision) return "Accident Alert"

  if (vehicles.length >= 2) return "Vehicle Cluster Detected"
  if (vehicles.length === 1 && persons.length === 0) return "High Vehicle Activity"

  if (persons.length >= 1 && backpacks.length >= 1) return "Security Alert"
  if (persons.length >= 2) {
    const minPersonConf = Math.min(...persons.map((p) => p.confidence))
    if (minPersonConf >= 0.75) return "Possible Altercation"
    return "High Human Activity"
  }

  const top = [...detections].sort((a, b) => b.confidence - a.confidence)[0]
  if (!top) return null
  const type = top.object_type
  if (type === "person" && top.confidence >= 0.85) return "Suspicious Activity"
  if (["car", "truck", "bus"].includes(type)) return `${type.charAt(0).toUpperCase() + type.slice(1)} Detected`
  return `${type.charAt(0).toUpperCase() + type.slice(1)} Detected`
}

export function buildTimelineMarkers(
  detections: DetectionDto[],
  searchOffsetMs?: number | null,
): TimelineMarker[] {
  const markers: TimelineMarker[] = []
  const seen = new Set<string>()
  for (const d of detections) {
    const key = `${d.timestamp_offset_ms}-${d.object_type}`
    if (seen.has(key)) continue
    seen.add(key)
    markers.push({
      id: d.id,
      offsetMs: d.timestamp_offset_ms,
      label: d.object_type,
      kind: "detection",
    })
  }
  if (searchOffsetMs != null && Number.isFinite(searchOffsetMs)) {
    markers.push({
      id: `search-${searchOffsetMs}`,
      offsetMs: searchOffsetMs,
      label: "Search match",
      kind: "search",
    })
  }
  return markers.sort((a, b) => a.offsetMs - b.offsetMs)
}

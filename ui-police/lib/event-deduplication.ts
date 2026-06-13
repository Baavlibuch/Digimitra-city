import type { DetectionDto } from "@/lib/surveillance-api"
import { eventBannerLabel, isIdleSceneMessage } from "@/lib/detection-overlay-utils"

/** Cooldown for live camera feeds: merge repeated alerts for the same incident type. */
export const LIVE_FEED_EVENT_COOLDOWN_MS = 45_000

export type IncidentSeverity = "medium" | "high" | "critical"

export type IncidentCandidate = {
  /** Stable event id — first detection in the incident cluster. */
  id: string
  sourceId: string
  cameraId: string
  recordingSegmentId: string
  incidentType: string
  severity: IncidentSeverity
  /** When the incident was first observed. */
  firstDetectedAt: string
  /** When the incident was last reinforced by a new frame. */
  lastUpdatedAt: string
  /** Best detection for playback seek (highest confidence seen). */
  detectionId: string
  anchorDetection: DetectionDto
  mergedGroups: DetectionDto[][]
  aiConfidence: number
  previewFrame?: string
  isUploaded: boolean
}

export function groupDetectionsByFrame(detections: DetectionDto[]): DetectionDto[][] {
  const map = new Map<string, DetectionDto[]>()
  for (const d of detections) {
    const key = `${d.recording_segment_id}:${d.timestamp_offset_ms}`
    const group = map.get(key)
    if (group) group.push(d)
    else map.set(key, [d])
  }
  return Array.from(map.values())
}

function dedupWindowMs(isUploaded: boolean): number {
  return isUploaded ? Number.POSITIVE_INFINITY : LIVE_FEED_EVENT_COOLDOWN_MS
}

function incidentSourceId(anchor: DetectionDto, isUploaded: boolean): string {
  return isUploaded ? anchor.recording_segment_id : anchor.camera_id
}

function parseEventTimeMs(iso: string): number {
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function findMergeTarget(
  clusters: IncidentCandidate[],
  sourceId: string,
  incidentType: string,
  eventTimeMs: number,
  windowMs: number,
): IncidentCandidate | undefined {
  for (let i = clusters.length - 1; i >= 0; i--) {
    const cluster = clusters[i]
    if (cluster.sourceId !== sourceId || cluster.incidentType !== incidentType) continue
    if (eventTimeMs - parseEventTimeMs(cluster.lastUpdatedAt) <= windowMs) {
      return cluster
    }
  }
  return undefined
}

function mergeIntoCluster(cluster: IncidentCandidate, candidate: FrameIncident): void {
  cluster.lastUpdatedAt = candidate.absoluteEventTime
  cluster.mergedGroups.push(candidate.group)
  if (candidate.aiConfidence > cluster.aiConfidence) {
    cluster.aiConfidence = candidate.aiConfidence
    cluster.detectionId = candidate.detectionId
    cluster.anchorDetection = candidate.anchorDetection
  }
  if (candidate.previewFrame) {
    cluster.previewFrame = candidate.previewFrame
  }
}

type FrameIncident = {
  sourceId: string
  cameraId: string
  recordingSegmentId: string
  incidentType: string
  severity: IncidentSeverity
  absoluteEventTime: string
  detectionId: string
  anchorDetection: DetectionDto
  group: DetectionDto[]
  aiConfidence: number
  previewFrame?: string
  isUploaded: boolean
}

/**
 * Collapse per-frame incidents into unique alerts:
 * - Uploaded videos: one event per (segment, incident type).
 * - Live feeds: one active event per (camera, incident type) within the cooldown window.
 */
export function dedupeIncidentCandidates(candidates: IncidentCandidate[]): IncidentCandidate[] {
  const sorted = [...candidates].sort(
    (a, b) => parseEventTimeMs(a.firstDetectedAt) - parseEventTimeMs(b.firstDetectedAt),
  )
  const clusters: IncidentCandidate[] = []

  for (const candidate of sorted) {
    const windowMs = dedupWindowMs(candidate.isUploaded)
    const eventTimeMs = parseEventTimeMs(candidate.lastUpdatedAt)
    const existing = findMergeTarget(
      clusters,
      candidate.sourceId,
      candidate.incidentType,
      eventTimeMs,
      windowMs,
    )

    if (existing) {
      mergeIntoCluster(existing, {
        sourceId: candidate.sourceId,
        cameraId: candidate.cameraId,
        recordingSegmentId: candidate.recordingSegmentId,
        incidentType: candidate.incidentType,
        severity: candidate.severity,
        absoluteEventTime: candidate.lastUpdatedAt,
        detectionId: candidate.detectionId,
        anchorDetection: candidate.anchorDetection,
        group: candidate.mergedGroups[0] ?? [candidate.anchorDetection],
        aiConfidence: candidate.aiConfidence,
        previewFrame: candidate.previewFrame,
        isUploaded: candidate.isUploaded,
      })
      continue
    }

    clusters.push({ ...candidate })
  }

  return clusters.sort(
    (a, b) => parseEventTimeMs(b.firstDetectedAt) - parseEventTimeMs(a.firstDetectedAt),
  )
}

export function buildMergedIncidentDescription(mergedGroups: DetectionDto[][]): string {
  const all = mergedGroups.flat()
  const types = [...new Set(all.map((d) => d.object_type))]
  const typeList = types.join(", ")
  const frameCount = mergedGroups.length
  if (frameCount <= 1) {
    return `${all.length} detection(s) at this moment — objects: ${typeList}`
  }
  return `${all.length} detection(s) across ${frameCount} moments — objects: ${typeList}`
}

export function buildIncidentCandidatesFromDetections(
  detections: DetectionDto[],
  opts: {
    severityFromLabel: (label: string) => IncidentSeverity | "low"
    isUploadedSource: (cameraId: string) => boolean
    previewFrame?: (detection: DetectionDto) => string | undefined
  },
): IncidentCandidate[] {
  const frameIncidents: IncidentCandidate[] = []

  for (const group of groupDetectionsByFrame(detections)) {
    const label = eventBannerLabel(group)
    if (!label || isIdleSceneMessage(label)) continue
    const severity = opts.severityFromLabel(label)
    if (severity === "low") continue

    const anchor = [...group].sort((a, b) => b.confidence - a.confidence)[0]
    if (!anchor) continue

    const isUploaded = opts.isUploadedSource(anchor.camera_id)
    const aiConfidence = Math.max(...group.map((d) => d.confidence))
    const preview = opts.previewFrame?.(anchor)

    frameIncidents.push({
      id: anchor.id,
      sourceId: incidentSourceId(anchor, isUploaded),
      cameraId: anchor.camera_id,
      recordingSegmentId: anchor.recording_segment_id,
      incidentType: label,
      severity,
      firstDetectedAt: anchor.absolute_event_time,
      lastUpdatedAt: anchor.absolute_event_time,
      detectionId: anchor.id,
      anchorDetection: anchor,
      mergedGroups: [group],
      aiConfidence,
      previewFrame: preview,
      isUploaded,
    })
  }

  return dedupeIncidentCandidates(frameIncidents)
}

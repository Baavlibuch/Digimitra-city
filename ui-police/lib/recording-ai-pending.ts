/**
 * Frontend-only tracking for recordings queued for YOLO / object detection.
 * Persisted in sessionStorage so navigation to /recordings keeps state within the tab.
 */

import type { DetectionDto, RecordingSegmentDto } from "@/lib/surveillance-api"

export const RECORDING_UPLOADED_EVENT = "digimitra:recording-uploaded"
export const AI_PENDING_STORAGE_KEY = "digimitra-pending-ai-scans"
/** Stop polling and allow true empty-state after this duration. */
export const AI_PENDING_TIMEOUT_MS = 90_000
/** Poll interval while scans are pending. */
export const AI_PENDING_POLL_MS = 5_000
/** Ignore pending markers older than this on hydrate (avoids stale UI after refresh). */
export const AI_PENDING_MAX_AGE_MS = 120_000
/** Treat list rows newer than this as candidates for pending scan on first sight. */
export const AI_PENDING_RECENT_RECORDING_MS = 5 * 60_000

export type PendingAiScan = {
  /** Stable key: recording id or `${sessionId}:${segmentIndex}` before catalog row exists. */
  key: string
  recordingId?: string
  cameraId: string
  recordingSessionId?: string
  segmentStartedAt?: string
  markedAt: number
}

export type RecordingUploadedDetail = {
  cameraId: string
  recordingSessionId: string
  segmentStartedAt: string
  segmentIndex: number
}

export function pendingKeyFromUpload(detail: RecordingUploadedDetail): string {
  return `${detail.recordingSessionId}:${detail.segmentIndex}`
}

export function readPendingScans(): PendingAiScan[] {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(AI_PENDING_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPendingAiScan)
  } catch {
    return []
  }
}

export function writePendingScans(scans: PendingAiScan[]): void {
  if (typeof window === "undefined") return
  try {
    if (scans.length === 0) {
      sessionStorage.removeItem(AI_PENDING_STORAGE_KEY)
    } else {
      sessionStorage.setItem(AI_PENDING_STORAGE_KEY, JSON.stringify(scans))
    }
  } catch {
    /* quota / private mode */
  }
}

export function dispatchRecordingUploaded(detail: RecordingUploadedDetail): void {
  if (typeof window === "undefined") return
  const scan: PendingAiScan = {
    key: pendingKeyFromUpload(detail),
    cameraId: detail.cameraId,
    recordingSessionId: detail.recordingSessionId,
    segmentStartedAt: detail.segmentStartedAt,
    markedAt: Date.now(),
  }
  const next = dedupePendingScans([...readPendingScans(), scan])
  writePendingScans(next)
  window.dispatchEvent(new CustomEvent(RECORDING_UPLOADED_EVENT, { detail }))
}

function isPendingAiScan(v: unknown): v is PendingAiScan {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return typeof o.key === "string" && typeof o.cameraId === "string" && typeof o.markedAt === "number"
}

function dedupePendingScans(scans: PendingAiScan[]): PendingAiScan[] {
  const byKey = new Map<string, PendingAiScan>()
  for (const s of scans) {
    const prev = byKey.get(s.key)
    if (!prev || s.markedAt >= prev.markedAt) byKey.set(s.key, s)
  }
  return [...byKey.values()]
}

export function prunePendingScans(scans: PendingAiScan[], now = Date.now()): PendingAiScan[] {
  return scans.filter((s) => now - s.markedAt < AI_PENDING_MAX_AGE_MS)
}

function startTimesClose(a: string | undefined, b: string | undefined, toleranceMs = 120_000): boolean {
  if (!a || !b) return false
  const ta = new Date(a).getTime()
  const tb = new Date(b).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false
  return Math.abs(ta - tb) <= toleranceMs
}

export function linkPendingToRecordings(
  scans: PendingAiScan[],
  rows: RecordingSegmentDto[],
): PendingAiScan[] {
  return scans.map((scan) => {
    if (scan.recordingId) return scan
    const match = rows.find(
      (r) =>
        (scan.recordingSessionId && r.recording_session_id === scan.recordingSessionId) ||
        startTimesClose(scan.segmentStartedAt, r.start_time),
    )
    if (!match) return scan
    return { ...scan, recordingId: match.id, key: match.id }
  })
}

export function addPendingFromNewRecordings(
  scans: PendingAiScan[],
  rows: RecordingSegmentDto[],
  knownIds: Set<string>,
  detRows: DetectionDto[],
  now = Date.now(),
): PendingAiScan[] {
  const next = [...scans]
  const detectionRecordingIds = new Set(detRows.map((d) => d.recording_segment_id))

  for (const r of rows) {
    if (knownIds.has(r.id)) continue
    const createdMs = new Date(r.created_at).getTime()
    if (Number.isNaN(createdMs) || now - createdMs > AI_PENDING_RECENT_RECORDING_MS) continue
    if (detectionRecordingIds.has(r.id)) continue
    const exists = next.some((s) => s.recordingId === r.id || s.key === r.id)
    if (exists) continue
    next.push({
      key: r.id,
      recordingId: r.id,
      cameraId: r.camera_id,
      recordingSessionId: r.recording_session_id,
      segmentStartedAt: r.start_time,
      markedAt: now,
    })
  }
  return dedupePendingScans(next)
}

export function clearResolvedPending(
  scans: PendingAiScan[],
  detRows: DetectionDto[],
  now = Date.now(),
): PendingAiScan[] {
  const detectionRecordingIds = new Set(detRows.map((d) => d.recording_segment_id))
  return scans.filter((scan) => {
    const age = now - scan.markedAt
    if (age >= AI_PENDING_TIMEOUT_MS) return false
    if (scan.recordingId && detectionRecordingIds.has(scan.recordingId)) return false
    return true
  })
}

export function hasActivePending(scans: PendingAiScan[], now = Date.now()): boolean {
  return scans.some((s) => now - s.markedAt < AI_PENDING_TIMEOUT_MS)
}

/** Pending recordings that still have no detection row in the current list. */
export function pendingWithoutDetections(scans: PendingAiScan[], detRows: DetectionDto[]): PendingAiScan[] {
  const detectionRecordingIds = new Set(detRows.map((d) => d.recording_segment_id))
  return scans.filter((s) => !s.recordingId || !detectionRecordingIds.has(s.recordingId))
}

export function shouldShowDetectionsProcessing(
  scans: PendingAiScan[],
  detRows: DetectionDto[],
  loading: boolean,
  now = Date.now(),
): boolean {
  if (loading) return false
  const active = prunePendingScans(scans, now).filter((s) => now - s.markedAt < AI_PENDING_TIMEOUT_MS)
  if (active.length === 0) return false
  const unresolved = pendingWithoutDetections(active, detRows)
  return unresolved.length > 0
}

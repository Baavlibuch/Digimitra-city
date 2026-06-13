/**
 * Client for the FastAPI surveillance backend (JWT from /api/v1/token).
 * Used for browser MediaRecorder uploads to MinIO via POST /api/v1/recordings/upload.
 */

import { getStoredAccessToken } from "@/src/lib/auth-token"

/**
 * Surveillance FastAPI base URL.
 * Prefer `localhost` over `127.0.0.1` on Windows: a local dev API often binds only to 127.0.0.1
 * while Docker publishes `0.0.0.0:8000` — `127.0.0.1:8000` then hits the wrong process (no Milvus).
 */
const defaultBase = () => {
  if (typeof process === "undefined") return "http://localhost:8000"
  return (
    process.env.NEXT_PUBLIC_SURVEILLANCE_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    "http://localhost:8000"
  )
}

export async function fetchSurveillanceAccessToken(username: string): Promise<string> {
  const base = defaultBase().replace(/\/$/, "")
  const body = new URLSearchParams()
  body.set("username", username.trim() || "operator")
  body.set("password", "browser")
  const res = await fetch(`${base}/api/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Surveillance API auth failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error("Surveillance API returned no access_token")
  return data.access_token
}

export type UploadRecordingBlobParams = {
  token: string
  blob: Blob
  cameraId: string
  cameraName: string
  recordingSessionId: string
  segmentStartedAt: string
  mimeType: string
  /** Monotonic index within `recordingSessionId` for timeline ordering. */
  segmentIndex?: number
  /** MediaRecorder timeslice / nominal rolling window in ms. */
  segmentWindowMs?: number
  /** e.g. continuous_surveillance — stored on object for future indexing. */
  ingestMode?: string
}

export async function uploadRecordingBlob(params: UploadRecordingBlobParams): Promise<void> {
  const base = defaultBase().replace(/\/$/, "")
  const ext = params.mimeType.includes("webm") ? "webm" : params.mimeType.includes("mp4") ? "mp4" : "bin"
  const fd = new FormData()
  fd.append("file", params.blob, `segment.${ext}`)
  fd.append("camera_id", params.cameraId)
  fd.append("recording_session_id", params.recordingSessionId)
  fd.append("segment_started_at", params.segmentStartedAt)
  fd.append("mime_type", params.mimeType)
  fd.append("camera_name", params.cameraName)
  if (params.segmentIndex !== undefined) fd.append("segment_index", String(params.segmentIndex))
  if (params.segmentWindowMs !== undefined) fd.append("segment_window_ms", String(params.segmentWindowMs))
  if (params.ingestMode) fd.append("ingest_mode", params.ingestMode)

  const res = await fetch(`${base}/api/v1/recordings/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.token}` },
    body: fd,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Recording upload failed (${res.status}): ${text.slice(0, 200)}`)
  }
}

export type RecordingSegmentDto = {
  id: string
  camera_id: string
  recording_session_id: string
  bucket_name: string
  object_key: string
  start_time: string
  end_time: string | null
  duration_seconds: number | null
  file_type: string
  size_bytes: number | null
  ingest_source: string
  created_at: string
  extra: Record<string, unknown> | null
}

export type RecordingListDto = {
  items: RecordingSegmentDto[]
  total: number
  limit: number
  offset: number
}

export type RecordingPlaybackDto = {
  recording_id: string
  url: string
  bucket_name: string
  object_key: string
  expires_in_seconds: number
}

export type DetectionDto = {
  id: string
  recording_segment_id: string
  camera_id: string
  object_type: string
  confidence: number
  timestamp_offset_ms: number
  bounding_box: Record<string, unknown>
  created_at: string
  absolute_event_time: string
  preview_url?: string
}

export type DetectionListDto = {
  items: DetectionDto[]
  total: number
  limit: number
  offset: number
}

export type DetectionPlaybackDto = {
  detection_id: string
  recording_id: string
  timestamp_offset_ms: number
  absolute_event_time: string
  url: string
  bucket_name: string
  object_key: string
  expires_in_seconds: number
}

export type CameraDto = {
  id: string
  name: string
  location?: string | null
  type: string
  source_type: string
  room_name: string
  stream_status: string
  latitude?: number | null
  longitude?: number | null
  created_at: string
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` } as const
}

export async function fetchCameras(): Promise<CameraDto[]> {
  const base = defaultBase().replace(/\/$/, "")
  const res = await fetch(`${base}/api/v1/cameras`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Cameras list failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return (await res.json()) as CameraDto[]
}

export async function fetchRecordings(params: {
  token: string
  cameraId?: string
  start?: string
  end?: string
  limit?: number
  offset?: number
}): Promise<RecordingListDto> {
  const base = defaultBase().replace(/\/$/, "")
  const q = new URLSearchParams()
  if (params.cameraId) q.set("camera_id", params.cameraId)
  if (params.start) q.set("start", params.start)
  if (params.end) q.set("end", params.end)
  if (params.limit != null) q.set("limit", String(params.limit))
  if (params.offset != null) q.set("offset", String(params.offset))
  const qs = q.toString()
  const url = `${base}/api/v1/recordings${qs ? `?${qs}` : ""}`
  const res = await fetch(url, { headers: authHeader(params.token) })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Recordings list failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return (await res.json()) as RecordingListDto
}

export async function fetchRecordingPlaybackUrl(
  token: string,
  recordingId: string,
  expiryHours = 1,
): Promise<RecordingPlaybackDto> {
  const base = defaultBase().replace(/\/$/, "")
  const q = new URLSearchParams()
  q.set("expiry_hours", String(expiryHours))
  const res = await fetch(`${base}/api/v1/recordings/${encodeURIComponent(recordingId)}/playback?${q}`, {
    headers: authHeader(token),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Playback URL failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return (await res.json()) as RecordingPlaybackDto
}

export async function deleteRecording(token: string, recordingId: string): Promise<void> {
  const base = defaultBase().replace(/\/$/, "")
  const res = await fetch(`${base}/api/v1/recordings/${encodeURIComponent(recordingId)}`, {
    method: "DELETE",
    headers: authHeader(token),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Delete recording failed (${res.status}): ${text.slice(0, 200)}`)
  }
}

export async function fetchDetections(params: {
  token: string
  cameraId?: string
  objectType?: string
  recordingSegmentId?: string
  eventAfter?: string
  eventBefore?: string
  limit?: number
  offset?: number
}): Promise<DetectionListDto> {
  const base = defaultBase().replace(/\/$/, "")
  const q = new URLSearchParams()
  if (params.cameraId) q.set("camera_id", params.cameraId)
  if (params.objectType) q.set("object_type", params.objectType)
  if (params.recordingSegmentId) q.set("recording_segment_id", params.recordingSegmentId)
  if (params.eventAfter) q.set("event_after", params.eventAfter)
  if (params.eventBefore) q.set("event_before", params.eventBefore)
  if (params.limit != null) q.set("limit", String(params.limit))
  if (params.offset != null) q.set("offset", String(params.offset))
  const qs = q.toString()
  const res = await fetch(`${base}/api/v1/detections${qs ? `?${qs}` : ""}`, {
    headers: authHeader(params.token),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Detections list failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return (await res.json()) as DetectionListDto
}

export type SemanticSearchHitDto = {
  vector_id?: string | null
  recording_segment_id: string
  camera_id: string
  timestamp_offset_ms: number
  similarity: number
  model_version?: string | null
}

export type SemanticSearchResponseDto = {
  results: SemanticSearchHitDto[]
  enabled: boolean
  detail?: string | null
}

/** From GET /api/v1/semantic-search/status — backend is the source of truth for availability. */
export type SemanticSearchStatusDto = {
  configured: boolean
  index_ready: boolean
  detail?: string | null
}

/** True when Milvus is configured and the semantic index is loadable (search can run). */
export function isSemanticSearchOperational(status: SemanticSearchStatusDto | null | undefined): boolean {
  return Boolean(status?.configured && status?.index_ready)
}

/** Poll while index may still be warming; stop when Milvus is not configured at all. */
export function shouldRetrySemanticStatusPoll(status: SemanticSearchStatusDto | null | undefined): boolean {
  if (status == null) return true
  if (!status.configured) return false
  return !status.index_ready
}

function unwrapSemanticStatusPayload(raw: unknown): Record<string, unknown> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Semantic search status: response was not a JSON object.")
  }
  const r = raw as Record<string, unknown>
  for (const key of ["data", "body", "result"] as const) {
    const nested = r[key]
    if (nested != null && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>
    }
  }
  return r
}

/** Parse GET /semantic-search/status body — tolerates camelCase and string booleans from proxies. */
export function coerceSemanticSearchStatusDto(raw: unknown): SemanticSearchStatusDto {
  const r = unwrapSemanticStatusPayload(raw)
  const pickBool = (v: unknown): boolean =>
    v === true || v === 1 || v === "1" || v === "true" || v === "True"

  const configuredRaw = r.configured ?? r.Configured
  const indexReadyRaw = r.index_ready ?? r.indexReady
  const enabledLegacy = r.enabled ?? r.Enabled

  let configured = pickBool(configuredRaw)
  let index_ready = pickBool(indexReadyRaw)

  if (configuredRaw === undefined && indexReadyRaw === undefined && enabledLegacy !== undefined) {
    const en = pickBool(enabledLegacy)
    configured = en
    index_ready = en
  }

  if (!configured && index_ready) {
    configured = true
  }

  const d = r.detail ?? r.Detail
  const detail = d == null || d === "" ? null : typeof d === "string" ? d : String(d)
  return { configured, index_ready, detail }
}

const SEMANTIC_STATUS_ATTEMPTS = 3
const SEMANTIC_STATUS_BASE_DELAY_MS = 400

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * Bearer for GET /semantic-search/status — same strategy as recordings/detections:
 * 1) explicit surveillance JWT from `fetchSurveillanceAccessToken` (preferred when passed), else
 * 2) Cognito access token via Amplify `getStoredAccessToken` (same helper as other authenticated calls).
 */
async function resolveSemanticSearchStatusBearer(explicitToken?: string): Promise<{ token: string; source: string }> {
  const trimmed = explicitToken?.trim()
  if (trimmed) {
    return { token: trimmed, source: "surveillance_fetchSurveillanceAccessToken_same_as_recordings" }
  }
  let cognito: string | null = null
  try {
    cognito = await getStoredAccessToken()
  } catch (e) {
    console.warn("[semantic-search/status] getStoredAccessToken (Amplify) failed:", e)
  }
  const c = cognito?.trim()
  if (c) {
    return { token: c, source: "getStoredAccessToken_amplify_cognito" }
  }
  throw Object.assign(
    new Error(
      "Semantic search status requires a JWT — obtain the surveillance token (same as recordings) or sign in with Cognito.",
    ),
    { status: 401 },
  )
}

/**
 * GET semantic-search status — backend requires Bearer JWT (same as POST /semantic-search).
 * Retries transient network/5xx failures. Throws Error with optional `status` (HTTP) or `kind: "network"`.
 */
export async function fetchSemanticSearchStatus(params?: {
  token?: string
  signal?: AbortSignal
}): Promise<SemanticSearchStatusDto> {
  const base = defaultBase().replace(/\/$/, "")
  const url = `${base}/api/v1/semantic-search/status`
  const { token: tok } = await resolveSemanticSearchStatusBearer(params?.token)

  const headers: Record<string, string> = { Authorization: `Bearer ${tok}` }

  let lastStatus: number | undefined

  for (let attempt = 1; attempt <= SEMANTIC_STATUS_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: params?.signal })
      const text = await res.text()
      lastStatus = res.status

      if (res.ok) {
        try {
          const raw = JSON.parse(text) as unknown
          console.log("[semantic-search/status] HTTP 200 response body:", raw)
          const parsed = coerceSemanticSearchStatusDto(raw)
          console.log("[semantic-search/status] coerced availability:", parsed)
          return parsed
        } catch (parseErr) {
          console.warn("[semantic-search/status] invalid JSON:", text.slice(0, 400), parseErr)
          const err = new Error("Semantic search status returned invalid JSON.") as Error & { status: number }
          err.status = res.status
          throw err
        }
      }

      console.warn(
        `[semantic-search/status] HTTP ${res.status} (attempt ${attempt}/${SEMANTIC_STATUS_ATTEMPTS}):`,
        text.slice(0, 400),
      )

      if (res.status === 401 || res.status === 403) {
        const err = new Error(
          res.status === 401
            ? "Not authenticated — semantic search status rejected credentials."
            : "Access forbidden — semantic search status is not allowed for this identity.",
        ) as Error & { status: number }
        err.status = res.status
        throw err
      }

      const retryable = res.status >= 500 || res.status === 429 || res.status === 408
      if (retryable && attempt < SEMANTIC_STATUS_ATTEMPTS) {
        await sleep(SEMANTIC_STATUS_BASE_DELAY_MS * attempt)
        continue
      }

      const err = new Error(`Semantic search status failed (${res.status}): ${text.slice(0, 200)}`) as Error & {
        status: number
      }
      err.status = res.status
      throw err
    } catch (e) {
      if (params?.signal?.aborted) throw e

      const httpStatus =
        typeof e === "object" && e !== null && "status" in e ? (e as { status: number }).status : undefined
      if (httpStatus === 401 || httpStatus === 403) throw e

      const isNetworkish =
        e instanceof TypeError ||
        (e instanceof Error && (e.message === "Failed to fetch" || e.name === "AbortError"))

      if (isNetworkish && !(e instanceof Error && e.name === "AbortError")) {
        console.warn(
          `[semantic-search/status] network error (attempt ${attempt}/${SEMANTIC_STATUS_ATTEMPTS}):`,
          e,
        )
        if (attempt < SEMANTIC_STATUS_ATTEMPTS) {
          await sleep(SEMANTIC_STATUS_BASE_DELAY_MS * attempt)
          continue
        }
        const err = new Error(
          "Cannot reach surveillance API for semantic search status (network error).",
        ) as Error & { kind: "network" }
        err.kind = "network"
        throw err
      }

      throw e
    }
  }

  const err = new Error(`Semantic search status failed (${lastStatus ?? "unknown"}).`) as Error & { status?: number }
  if (lastStatus != null) err.status = lastStatus
  throw err
}

export async function fetchSemanticSearch(params: {
  token: string
  query: string
  top_k?: number
  cameraId?: string
}): Promise<SemanticSearchResponseDto> {
  const base = defaultBase().replace(/\/$/, "")
  const res = await fetch(`${base}/api/v1/semantic-search`, {
    method: "POST",
    headers: {
      ...authHeader(params.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: params.query.trim(),
      top_k: params.top_k ?? 20,
      camera_id: params.cameraId,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Semantic search failed: not authenticated (HTTP ${res.status}). Refresh the page or sign in again — this is not a Milvus configuration issue.`,
      )
    }
    throw new Error(`Semantic search failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return (await res.json()) as SemanticSearchResponseDto
}

export async function fetchDetectionPlaybackUrl(
  token: string,
  detectionId: string,
  expiryHours = 1,
): Promise<DetectionPlaybackDto> {
  const base = defaultBase().replace(/\/$/, "")
  const q = new URLSearchParams()
  q.set("expiry_hours", String(expiryHours))
  const res = await fetch(`${base}/api/v1/detections/${encodeURIComponent(detectionId)}/playback?${q}`, {
    headers: authHeader(token),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Detection playback failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return (await res.json()) as DetectionPlaybackDto
}

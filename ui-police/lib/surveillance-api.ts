/**
 * Client for the FastAPI surveillance backend (JWT from /api/v1/token).
 * Used for browser MediaRecorder uploads to MinIO via POST /api/v1/recordings/upload.
 */

const defaultBase = () =>
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SURVEILLANCE_API_URL) || "http://127.0.0.1:8000"

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

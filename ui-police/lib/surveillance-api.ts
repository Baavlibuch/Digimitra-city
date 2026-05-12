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

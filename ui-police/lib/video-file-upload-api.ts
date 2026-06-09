/**
 * Isolated client for POST /api/v1/recordings/upload-file.
 * Does not use or modify the MediaRecorder upload path.
 */

const defaultBase = () => {
  if (typeof process === "undefined") return "http://localhost:8000"
  return (
    process.env.NEXT_PUBLIC_SURVEILLANCE_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    "http://localhost:8000"
  )
}

export const ALLOWED_VIDEO_FILE_ACCEPT =
  "video/mp4,video/quicktime,video/x-msvideo,video/webm,.mp4,.mov,.avi,.webm"

export type UploadVideoFileParams = {
  token: string
  file: File
  cameraId: string
  cameraName?: string
  recordingSessionId?: string
  segmentStartedAt?: string
}

export type UploadVideoFileResponse = {
  recording_id: string | null
  object_key: string
  camera_id: string
  recording_session_id: string
  bucket: string
  segment_started_at: string
  size_bytes: number
}

async function fetchSurveillanceAccessToken(username: string): Promise<string> {
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

export async function obtainUploadToken(operatorUsername: string): Promise<string> {
  return fetchSurveillanceAccessToken(operatorUsername)
}

export async function uploadVideoFile(params: UploadVideoFileParams): Promise<UploadVideoFileResponse> {
  const base = defaultBase().replace(/\/$/, "")
  const fd = new FormData()
  fd.append("file", params.file, params.file.name)
  fd.append("camera_id", params.cameraId)
  if (params.cameraName) fd.append("camera_name", params.cameraName)
  if (params.recordingSessionId) fd.append("recording_session_id", params.recordingSessionId)
  if (params.segmentStartedAt) fd.append("segment_started_at", params.segmentStartedAt)
  if (params.file.type) fd.append("mime_type", params.file.type)

  const res = await fetch(`${base}/api/v1/recordings/upload-file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.token}` },
    body: fd,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Video file upload failed (${res.status}): ${text.slice(0, 300)}`)
  }
  return (await res.json()) as UploadVideoFileResponse
}

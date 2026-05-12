"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchSurveillanceAccessToken, uploadRecordingBlob } from "@/lib/surveillance-api"

/** DVR-style rolling file size: MediaRecorder emits one blob per interval (not tiny sub-second files). */
export const DEFAULT_ROLLING_SEGMENT_MS = 300_000 // 5 minutes

function pickSupportedMimeType(): string | undefined {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ]
  for (const t of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t
  }
  return undefined
}

export type WebcamRecordingMeta = {
  cameraId: string
  cameraName: string
}

type Options = {
  /** Wall-clock rolling window for each stored segment (MediaRecorder `timeslice`). */
  rollingSegmentMs?: number
  /** When null/undefined, recording cannot start (e.g. no device bound). */
  meta: WebcamRecordingMeta | null | undefined
}

function stopRecorderInstance(recorder: MediaRecorder | null) {
  if (!recorder || recorder.state === "inactive") return
  try {
    if (typeof recorder.requestData === "function") {
      try {
        recorder.requestData()
      } catch {
        /* optional API */
      }
    }
    recorder.stop()
  } catch {
    /* already stopped */
  }
}

/**
 * Continuous surveillance recording: starts automatically when `stream` and `meta` are ready,
 * stops when the stream ends or meta is cleared. Uploads rolling segments (default 5 min) via
 * the existing MediaRecorder + FastAPI + MinIO pipeline. Each camera uptime gets its own
 * `recording_session_id`; segment index monotonically orders blobs within that session for timeline playback.
 */
export function useWebcamRecording(stream: MediaStream | null, operatorUsername: string, options: Options) {
  const rollingSegmentMs = options.rollingSegmentMs ?? DEFAULT_ROLLING_SEGMENT_MS
  const meta = options.meta

  const recorderRef = useRef<MediaRecorder | null>(null)
  const sessionRef = useRef<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const segmentT0Ref = useRef<number>(0)
  const metaRef = useRef<WebcamRecordingMeta | null>(null)
  const segmentIndexRef = useRef(0)
  const preferredMimeRef = useRef<string | undefined>(undefined)

  const [isRecording, setIsRecording] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const stopRecording = useCallback(() => {
    const r = recorderRef.current
    recorderRef.current = null
    stopRecorderInstance(r)
    setIsRecording(false)
  }, [])

  useEffect(() => {
    metaRef.current = meta ?? null
  }, [meta])

  useEffect(() => {
    if (!stream || !meta?.cameraId) {
      stopRecording()
      return
    }

    if (!operatorUsername.trim()) {
      stopRecording()
      setUploadError("Sign in to enable automatic recording upload to storage.")
      return
    }

    if (typeof MediaRecorder === "undefined") {
      setUploadError("MediaRecorder is not supported in this browser.")
      return
    }

    let cancelled = false
    setUploadError(null)

    const run = async () => {
      stopRecorderInstance(recorderRef.current)
      recorderRef.current = null

      try {
        tokenRef.current = await fetchSurveillanceAccessToken(operatorUsername)
      } catch (e) {
        if (cancelled) return
        setUploadError(e instanceof Error ? e.message : "Could not obtain API token.")
        return
      }

      if (cancelled || !stream.active) return

      sessionRef.current = crypto.randomUUID()
      segmentIndexRef.current = 0
      preferredMimeRef.current = pickSupportedMimeType()

      let recorder: MediaRecorder
      try {
        const preferred = preferredMimeRef.current
        recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream)
      } catch (e) {
        if (!cancelled) {
          setUploadError(e instanceof Error ? e.message : "Could not create MediaRecorder.")
        }
        return
      }

      segmentT0Ref.current = Date.now()

      recorder.addEventListener("dataavailable", (ev) => {
        if (!ev.data || ev.data.size < 1) return
        const segmentIndex = segmentIndexRef.current
        segmentIndexRef.current += 1
        const segmentStartedAt = new Date(segmentT0Ref.current).toISOString()
        segmentT0Ref.current = Date.now()
        const tok = tokenRef.current
        const sid = sessionRef.current
        const m = metaRef.current
        if (!tok || !sid || !m) return
        const mimeType = recorder.mimeType || preferredMimeRef.current || "video/webm"
        void uploadRecordingBlob({
          token: tok,
          blob: ev.data,
          cameraId: m.cameraId,
          cameraName: m.cameraName,
          recordingSessionId: sid,
          segmentStartedAt,
          mimeType,
          segmentIndex,
          segmentWindowMs: rollingSegmentMs,
          ingestMode: "continuous_surveillance",
        }).catch((e) => {
          setUploadError(e instanceof Error ? e.message : "Upload failed.")
        })
      })

      recorder.addEventListener("stop", () => {
        setIsRecording(false)
      })

      try {
        recorder.start(rollingSegmentMs)
      } catch (e) {
        if (!cancelled) {
          setUploadError(e instanceof Error ? e.message : "MediaRecorder.start failed.")
        }
        return
      }

      if (cancelled) {
        stopRecorderInstance(recorder)
        return
      }

      recorderRef.current = recorder
      setIsRecording(true)
    }

    void run()

    return () => {
      cancelled = true
      stopRecording()
    }
  }, [stream, meta?.cameraId, meta?.cameraName, operatorUsername, rollingSegmentMs, stopRecording])

  return {
    isRecording,
    uploadError,
    clearUploadError: () => setUploadError(null),
  }
}

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchSurveillanceAccessToken, uploadRecordingBlob } from "@/lib/surveillance-api"

const DEFAULT_TIMESLICE_MS = 10_000

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

/**
 * Records the given MediaStream with the browser MediaRecorder API (time-sliced blobs),
 * uploads each segment to the surveillance API. Does not alter the stream used for live preview.
 */
export function useWebcamRecording(
  stream: MediaStream | null,
  operatorUsername: string,
  options?: { timesliceMs?: number },
) {
  const timesliceMs = options?.timesliceMs ?? DEFAULT_TIMESLICE_MS
  const recorderRef = useRef<MediaRecorder | null>(null)
  const sessionRef = useRef<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const segmentT0Ref = useRef<number>(0)
  const metaRef = useRef<WebcamRecordingMeta | null>(null)

  const [isRecording, setIsRecording] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const stopRecording = useCallback(() => {
    const r = recorderRef.current
    if (r && r.state !== "inactive") {
      try {
        r.stop()
      } catch {
        /* already stopped */
      }
    }
    recorderRef.current = null
    setIsRecording(false)
  }, [])

  const startRecording = useCallback(
    async (meta: WebcamRecordingMeta) => {
      if (!stream) {
        setUploadError("No camera stream to record.")
        return
      }
      if (!operatorUsername.trim()) {
        setUploadError("Set a surveillance API username (signed-in user) for uploads.")
        return
      }
      if (typeof MediaRecorder === "undefined") {
        setUploadError("MediaRecorder is not supported in this browser.")
        return
      }

      stopRecording()
      metaRef.current = meta
      setUploadError(null)

      try {
        tokenRef.current = await fetchSurveillanceAccessToken(operatorUsername)
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Could not obtain API token.")
        return
      }

      sessionRef.current = crypto.randomUUID()
      const preferred = pickSupportedMimeType()
      let recorder: MediaRecorder
      try {
        recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream)
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Could not create MediaRecorder.")
        return
      }

      segmentT0Ref.current = Date.now()

      recorder.addEventListener("dataavailable", (ev) => {
        if (!ev.data || ev.data.size < 1) return
        const segmentStartedAt = new Date(segmentT0Ref.current).toISOString()
        segmentT0Ref.current = Date.now()
        const tok = tokenRef.current
        const sid = sessionRef.current
        const m = metaRef.current
        if (!tok || !sid || !m) return
        const mimeType = recorder.mimeType || preferred || "video/webm"
        void uploadRecordingBlob({
          token: tok,
          blob: ev.data,
          cameraId: m.cameraId,
          cameraName: m.cameraName,
          recordingSessionId: sid,
          segmentStartedAt,
          mimeType,
        }).catch((e) => {
          setUploadError(e instanceof Error ? e.message : "Upload failed.")
        })
      })

      recorder.addEventListener("stop", () => {
        setIsRecording(false)
      })

      try {
        recorder.start(timesliceMs)
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "MediaRecorder.start failed.")
        return
      }

      recorderRef.current = recorder
      setIsRecording(true)
    },
    [stream, operatorUsername, stopRecording, timesliceMs],
  )

  useEffect(() => {
    if (!stream) stopRecording()
  }, [stream, stopRecording])

  useEffect(() => () => stopRecording(), [stopRecording])

  return {
    isRecording,
    startRecording,
    stopRecording,
    uploadError,
    clearUploadError: () => setUploadError(null),
  }
}

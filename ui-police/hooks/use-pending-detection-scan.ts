"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchDetections, type DetectionDto, type RecordingSegmentDto } from "@/lib/surveillance-api"
import {
  AI_PENDING_POLL_MS,
  RECORDING_UPLOADED_EVENT,
  addPendingFromNewRecordings,
  clearResolvedPending,
  linkPendingToRecordings,
  prunePendingScans,
  readPendingScans,
  shouldShowDetectionsProcessing,
  writePendingScans,
  type PendingAiScan,
} from "@/lib/recording-ai-pending"

export type DetectionFilters = {
  cameraId?: string
  objectType?: string
  eventAfter?: string
  eventBefore?: string
}

type Options = {
  rows: RecordingSegmentDto[]
  detRows: DetectionDto[]
  loading: boolean
  getToken: () => string | null
  getDetectionFilters: () => DetectionFilters
  onDetectionsUpdated: (items: DetectionDto[], total: number) => void
}

export function usePendingDetectionScan({
  rows,
  detRows,
  loading,
  getToken,
  getDetectionFilters,
  onDetectionsUpdated,
}: Options) {
  const [pendingScans, setPendingScans] = useState<PendingAiScan[]>(() => prunePendingScans(readPendingScans()))
  const knownRecordingIdsRef = useRef<Set<string>>(new Set())
  /** After each catalog fetch, seed ids once so existing rows are not treated as new uploads. */
  const catalogSeededRef = useRef(false)
  const wasLoadingRef = useRef(loading)

  useEffect(() => {
    if (wasLoadingRef.current && !loading) {
      catalogSeededRef.current = false
      knownRecordingIdsRef.current = new Set()
    }
    wasLoadingRef.current = loading
  }, [loading])

  const syncPending = useCallback((updater: (prev: PendingAiScan[]) => PendingAiScan[]) => {
    setPendingScans((prev) => {
      const next = prunePendingScans(updater(prev))
      writePendingScans(next)
      return next
    })
  }, [])

  useEffect(() => {
    const onUploaded = () => {
      syncPending(() => prunePendingScans(readPendingScans()))
    }
    window.addEventListener(RECORDING_UPLOADED_EVENT, onUploaded)
    return () => window.removeEventListener(RECORDING_UPLOADED_EVENT, onUploaded)
  }, [syncPending])

  useEffect(() => {
    if (loading) return

    if (!catalogSeededRef.current) {
      for (const r of rows) knownRecordingIdsRef.current.add(r.id)
      if (rows.length > 0 || !loading) {
        catalogSeededRef.current = true
      }
      syncPending((prev) => clearResolvedPending(linkPendingToRecordings(prev, rows), detRows))
      return
    }

    syncPending((prev) => {
      let next = linkPendingToRecordings(prev, rows)
      next = addPendingFromNewRecordings(next, rows, knownRecordingIdsRef.current, detRows)
      next = clearResolvedPending(next, detRows)
      for (const r of rows) knownRecordingIdsRef.current.add(r.id)
      return next
    })
  }, [rows, detRows, loading, syncPending])

  const isAiProcessing = shouldShowDetectionsProcessing(pendingScans, detRows, loading)

  useEffect(() => {
    if (!isAiProcessing || loading) return
    const token = getToken()
    if (!token) return

    let cancelled = false

    const poll = async () => {
      try {
        const filters = getDetectionFilters()
        const dlist = await fetchDetections({
          token,
          ...filters,
          limit: 100,
          offset: 0,
        })
        if (cancelled) return
        onDetectionsUpdated(dlist.items, dlist.total)
        syncPending((prev) => clearResolvedPending(prev, dlist.items))
      } catch {
        /* keep polling; main refresh surfaces auth errors */
      }
    }

    void poll()
    const id = window.setInterval(() => void poll(), AI_PENDING_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [isAiProcessing, loading, getToken, getDetectionFilters, onDetectionsUpdated, syncPending])

  return { isAiProcessing, pendingScans }
}

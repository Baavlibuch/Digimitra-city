"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Upload, FileVideo, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/components/auth-provider"
import {
  ALLOWED_VIDEO_FILE_ACCEPT,
  obtainUploadToken,
  uploadVideoFile,
  type UploadVideoFileResponse,
} from "@/lib/video-file-upload-api"
import { fetchCameras, type CameraDto } from "@/lib/surveillance-api"
import { dispatchRecordingUploaded } from "@/lib/recording-ai-pending"

const VIRTUAL_CAMERA_ID = "file-upload"
const VIRTUAL_CAMERA_NAME = "Uploaded video"

const ALLOWED_EXT = new Set([".mp4", ".mov", ".avi", ".webm"])

function fileExtension(name: string): string {
  const i = name.lastIndexOf(".")
  return i >= 0 ? name.slice(i).toLowerCase() : ""
}

function isAllowedVideoFile(file: File): boolean {
  const ext = fileExtension(file.name)
  if (ALLOWED_EXT.has(ext)) return true
  const t = (file.type || "").toLowerCase()
  return (
    t.includes("mp4") ||
    t.includes("quicktime") ||
    t.includes("webm") ||
    t.includes("x-msvideo") ||
    t.includes("avi")
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type VideoFileUploadProps = {
  onUploaded?: (result: UploadVideoFileResponse) => void
  variant?: "card" | "compact"
}

export function VideoFileUpload({ onUploaded, variant = "card" }: VideoFileUploadProps) {
  const { user, isCheckingAuth } = useAuth()
  const operator = (user?.username || "operator").trim() || "operator"

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cameras, setCameras] = useState<CameraDto[]>([])
  const [cameraMode, setCameraMode] = useState<"virtual" | "existing">("virtual")
  const [selectedCameraId, setSelectedCameraId] = useState<string>("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<UploadVideoFileResponse | null>(null)

  useEffect(() => {
    if (isCheckingAuth) return
    void fetchCameras()
      .then(setCameras)
      .catch(() => setCameras([]))
  }, [isCheckingAuth])

  const resolveCamera = useCallback((): { cameraId: string; cameraName: string } => {
    if (cameraMode === "existing" && selectedCameraId) {
      const cam = cameras.find((c) => c.id === selectedCameraId)
      return { cameraId: selectedCameraId, cameraName: cam?.name || selectedCameraId }
    }
    return { cameraId: VIRTUAL_CAMERA_ID, cameraName: VIRTUAL_CAMERA_NAME }
  }, [cameraMode, selectedCameraId, cameras])

  const runUpload = async (file: File) => {
    if (uploading) return
    setError(null)
    setUploading(true)
    try {
      const token = await obtainUploadToken(operator)
      const { cameraId, cameraName } = resolveCamera()
      const recordingSessionId = crypto.randomUUID()
      const segmentStartedAt = new Date().toISOString()
      const result = await uploadVideoFile({
        token,
        file,
        cameraId,
        cameraName,
        recordingSessionId,
        segmentStartedAt,
      })
      setLastResult(result)
      dispatchRecordingUploaded({
        cameraId,
        recordingSessionId,
        segmentStartedAt,
        segmentIndex: 0,
      })
      onUploaded?.(result)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.")
    } finally {
      setUploading(false)
    }
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setLastResult(null)
    const file = e.target.files?.[0] ?? null
    if (!file) {
      setSelectedFile(null)
      return
    }
    if (!isAllowedVideoFile(file)) {
      setSelectedFile(null)
      setError("Unsupported format. Choose MP4, MOV, AVI, or WebM.")
      e.target.value = ""
      return
    }
    if (variant === "compact") {
      void runUpload(file)
      return
    }
    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile || uploading) return
    await runUpload(selectedFile)
  }

  if (variant === "compact") {
    return (
      <div className="flex flex-col items-end gap-1 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_VIDEO_FILE_ACCEPT}
          onChange={onFileChange}
          disabled={uploading}
          className="hidden"
          aria-hidden
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="border-slate-600"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Adding…
            </>
          ) : (
            "Add"
          )}
        </Button>
        {error && (
          <p className="text-xs text-red-400 max-w-[200px] text-right" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <Card className="bg-slate-900/40 border-violet-500/25 mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileVideo className="h-5 w-5 text-violet-400" />
          Upload video file
        </CardTitle>
        <CardDescription>
          Upload MP4, MOV, AVI, or WebM for object detection and semantic search. Uses a separate
          upload path; live webcam recording is unchanged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Assign to camera</Label>
            <Select
              value={cameraMode}
              onValueChange={(v) => setCameraMode(v as "virtual" | "existing")}
            >
              <SelectTrigger className="bg-background/80 border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="virtual">Uploaded video (default)</SelectItem>
                <SelectItem value="existing">Existing camera</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {cameraMode === "existing" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Camera</Label>
              <Select value={selectedCameraId} onValueChange={setSelectedCameraId}>
                <SelectTrigger className="bg-background/80 border-slate-600">
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  {cameras.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="video-file-input" className="text-xs text-muted-foreground">
            Video file
          </Label>
          <Input
            id="video-file-input"
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_VIDEO_FILE_ACCEPT}
            onChange={onFileChange}
            disabled={uploading}
            className="bg-background/80 border-slate-600 cursor-pointer file:cursor-pointer"
          />
          {selectedFile && (
            <p className="text-xs text-muted-foreground">
              {selectedFile.name} — {formatBytes(selectedFile.size)}
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400 flex items-start gap-2" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </p>
        )}

        {lastResult && (
          <p className="text-sm text-emerald-400 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            Uploaded — queued for AI analysis. Recording id:{" "}
            <span className="font-mono text-xs">{lastResult.recording_id ?? "pending"}</span>
          </p>
        )}

        <Button
          type="button"
          onClick={() => void handleUpload()}
          disabled={
            !selectedFile ||
            uploading ||
            (cameraMode === "existing" && !selectedCameraId)
          }
          className="gap-2"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Upload and analyze
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  Camera,
  Calendar,
  MapPin,
  Play,
  Clock,
  Filter,
  Brain,
  Mic,
  Paperclip,
  FileText,
  ImageIcon,
  File,
} from "lucide-react"

interface SearchResult {
  id: string
  type: "camera" | "event" | "footage"
  title: string
  description: string
  location?: string
  timestamp?: string
  thumbnail?: string
  relevanceScore: number
  metadata?: Record<string, any>
}

export function TextSearch() {
  const [query, setQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [isVoiceActive, setIsVoiceActive] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)

  const mockResults: SearchResult[] = [
    {
      id: "1",
      type: "camera",
      title: "Camera 24 - Hospital Entrance",
      description: "Main entrance surveillance camera with high traffic monitoring",
      location: "Hospital Main Entrance",
      timestamp: "Active now",
      relevanceScore: 0.95,
      metadata: { status: "online", lastActivity: "2 min ago" },
    },
    {
      id: "2",
      type: "event",
      title: "Unusual Activity Detected",
      description: "Person loitering detected near hospital entrance for extended period",
      location: "Camera 24",
      timestamp: "5 minutes ago",
      relevanceScore: 0.88,
      metadata: { severity: "medium", duration: "12 minutes" },
    },
    {
      id: "3",
      type: "camera",
      title: "Camera 12 - Emergency Ward",
      description: "Emergency department entrance monitoring system",
      location: "Emergency Department",
      timestamp: "Active now",
      relevanceScore: 0.82,
      metadata: { status: "online", lastActivity: "1 min ago" },
    },
    {
      id: "4",
      type: "footage",
      title: "Security Footage - Incident #2847",
      description: "Recorded footage of suspicious activity near hospital parking",
      location: "Parking Lot A",
      timestamp: "2 hours ago",
      relevanceScore: 0.76,
      metadata: { duration: "3:24", fileSize: "245 MB" },
    },
    {
      id: "5",
      type: "event",
      title: "Motion Alert - After Hours",
      description: "Unexpected movement detected in restricted area during off-hours",
      location: "Camera 8",
      timestamp: "1 hour ago",
      relevanceScore: 0.71,
      metadata: { severity: "high", zone: "restricted" },
    },
  ]

  const handleSearch = async () => {
    if (!query.trim()) return

    setIsSearching(true)
    setHasSearched(true)

    setTimeout(() => {
      const filteredResults = mockResults.filter(
        (result) =>
          result.title.toLowerCase().includes(query.toLowerCase()) ||
          result.description.toLowerCase().includes(query.toLowerCase()) ||
          result.location?.toLowerCase().includes(query.toLowerCase()),
      )
      setResults(filteredResults)
      setIsSearching(false)
    }, 1500)
  }

  const handleVoiceInput = () => {
    setIsVoiceActive(true)
    setVoiceTranscript("")

    const phrases = [
      "Show me cameras near the hospital entrance",
      "Find unusual activity in the last hour",
      "Security footage from parking areas",
      "Motion alerts after midnight",
    ]

    let currentText = ""
    const targetPhrase = phrases[Math.floor(Math.random() * phrases.length)]

    const typeEffect = (index: number) => {
      if (index <= targetPhrase.length) {
        currentText = targetPhrase.substring(0, index)
        setVoiceTranscript(currentText)
        setTimeout(() => typeEffect(index + 1), 100)
      } else {
        setTimeout(() => {
          setQuery(targetPhrase)
          setIsVoiceActive(false)
          setVoiceTranscript("")
          setTimeout(() => {
            handleSearch()
          }, 500)
        }, 1000)
      }
    }

    setTimeout(() => typeEffect(0), 500)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    setAttachments((prev) => [...prev, ...files])
    setShowAttachmentMenu(false)
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) return <ImageIcon className="w-4 h-4" />
    if (file.type.includes("pdf") || file.type.includes("document")) return <FileText className="w-4 h-4" />
    return <File className="w-4 h-4" />
  }

  const getResultIcon = (type: string) => {
    switch (type) {
      case "camera":
        return <Camera className="w-5 h-5 text-blue-500" />
      case "event":
        return <Calendar className="w-5 h-5 text-yellow-500" />
      case "footage":
        return <Play className="w-5 h-5 text-green-500" />
      default:
        return <Search className="w-5 h-5 text-gray-500" />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "camera":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30"
      case "event":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      case "footage":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30"
    }
  }

  const suggestedQueries = [
    "Show me cameras near hospitals",
    "Find unusual activity in the last hour",
    "Security footage from parking areas",
    "Motion alerts after midnight",
    "Cameras with recent alerts",
  ]

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">AI Operator</h1>
          </div>
        </div>
        <p className="text-muted-foreground">
          Advanced AI agent for surveillance operations and natural language queries
        </p>
      </div>

      <Card
        className={`surface-panel transition-all duration-500 ${isVoiceActive ? "border-green-300 bg-gradient-to-r from-green-50 to-blue-50" : "border-primary/15 bg-gradient-to-r from-primary/5 to-blue-500/5"}`}
      >
        <CardContent className="pt-6">
          {isVoiceActive && (
            <div className="mb-6 text-center">
              <div className="relative">
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-r from-green-400 to-blue-400 rounded-full flex items-center justify-center animate-pulse">
                  <Mic className="w-8 h-8 text-white" />
                </div>
                <div className="absolute inset-0 w-20 h-20 mx-auto border-4 border-green-400/30 rounded-full animate-ping"></div>
                <div
                  className="absolute inset-0 w-20 h-20 mx-auto border-4 border-blue-400/20 rounded-full animate-ping"
                  style={{ animationDelay: "0.5s" }}
                ></div>
              </div>
              <p className="text-green-400 font-medium mb-2">Listening...</p>
              {voiceTranscript && (
                <p className="text-foreground text-lg font-medium bg-background/50 rounded-lg px-4 py-2 inline-block">
                  "{voiceTranscript}"
                </p>
              )}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mb-4">
              <div className="flex flex-wrap gap-2">
                {attachments.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 bg-background/50 rounded-lg px-3 py-2 text-sm">
                    {getFileIcon(file)}
                    <span className="truncate max-w-32">{file.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeAttachment(index)}
                      className="h-4 w-4 p-0 hover:bg-red-500/20"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask AI Operator anything... e.g., 'Show me cameras near the hospital entrance'"
                className="pl-10 h-12 text-lg"
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <div className="relative">
              <Button
                onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                className="h-12 px-4"
                variant="secondary"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              {showAttachmentMenu && (
                <div className="absolute top-full right-0 mt-1 w-48 rounded-lg border border-border bg-card shadow-[var(--shadow-elevated)] z-10">
                  <div className="p-1">
                    <label className="block">
                      <input
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.txt"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start text-left hover:bg-muted"
                        asChild
                      >
                        <span>
                          <ImageIcon className="w-4 h-4 mr-2" />
                          Images
                        </span>
                      </Button>
                    </label>
                    <label className="block">
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start text-left hover:bg-muted"
                        asChild
                      >
                        <span>
                          <FileText className="w-4 h-4 mr-2" />
                          Documents
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              )}
            </div>
            <Button
              onClick={handleVoiceInput}
              disabled={isVoiceActive}
              className={`h-12 px-4 ${isVoiceActive ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
              variant={isVoiceActive ? "default" : "secondary"}
            >
              <Mic className="w-4 h-4" />
            </Button>
            {!isVoiceActive && (
              <Button
                onClick={handleSearch}
                disabled={!query.trim() || isSearching}
                className="h-12 px-6"
              >
                {isSearching ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Command AI
                  </div>
                )}
              </Button>
            )}
          </div>

          {!hasSearched && !isVoiceActive && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Voice commands or try these queries:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedQueries.map((suggestion, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => setQuery(suggestion)}
                    className="filter-pill text-xs"
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {hasSearched && (
        <div className="space-y-4">
          {isSearching ? (
            <Card className="surface-panel">
              <CardContent className="py-12">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">AI Operator is analyzing your query...</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">AI Analysis Results</h2>
                  <p className="text-muted-foreground">
                    Found {results.length} results for "{query}"
                  </p>
                </div>
                <Button variant="secondary" size="sm">
                  <Filter className="w-4 h-4 mr-2" />
                  Filter
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <h3 className="font-medium text-foreground flex items-center gap-2">
                    <Camera className="w-4 h-4 text-blue-500" />
                    Cameras ({results.filter((r) => r.type === "camera").length})
                  </h3>
                  <div className="space-y-3">
                    {results
                      .filter((r) => r.type === "camera")
                      .map((result) => (
                        <Card
                          key={result.id}
                          className="surface-panel transition-shadow hover:shadow-[var(--shadow-elevated)] cursor-pointer"
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-12 h-12 bg-muted/30 rounded-lg flex items-center justify-center">
                                <Camera className="w-6 h-6 text-blue-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-foreground text-sm mb-1">{result.title}</h4>
                                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{result.description}</p>
                                <div className="flex items-center justify-between">
                                  <Badge variant="outline" className={getTypeColor(result.type)}>
                                    {result.metadata?.status || "Active"}
                                  </Badge>
                                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                                    <MapPin className="w-3 h-3 mr-1" />
                                    Pin to Map
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-yellow-500" />
                    Events ({results.filter((r) => r.type === "event").length})
                  </h3>
                  <div className="space-y-3">
                    {results
                      .filter((r) => r.type === "event")
                      .map((result) => (
                        <Card
                          key={result.id}
                          className="surface-panel transition-shadow hover:shadow-[var(--shadow-elevated)] cursor-pointer"
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-12 h-12 bg-muted/30 rounded-lg flex items-center justify-center">
                                <Calendar className="w-6 h-6 text-yellow-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-foreground text-sm mb-1">{result.title}</h4>
                                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{result.description}</p>
                                <div className="flex items-center justify-between">
                                  <Badge
                                    variant={result.metadata?.severity === "high" ? "destructive" : "outline"}
                                    className={result.metadata?.severity !== "high" ? getTypeColor(result.type) : ""}
                                  >
                                    {result.metadata?.severity || "Info"}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {result.timestamp}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium text-foreground flex items-center gap-2">
                    <Play className="w-4 h-4 text-green-500" />
                    Footage ({results.filter((r) => r.type === "footage").length})
                  </h3>
                  <div className="space-y-3">
                    {results
                      .filter((r) => r.type === "footage")
                      .map((result) => (
                        <Card
                          key={result.id}
                          className="surface-panel transition-shadow hover:shadow-[var(--shadow-elevated)] cursor-pointer"
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-12 h-12 bg-muted/30 rounded-lg flex items-center justify-center">
                                <Play className="w-6 h-6 text-green-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-foreground text-sm mb-1">{result.title}</h4>
                                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{result.description}</p>
                                <div className="flex items-center justify-between">
                                  <Badge variant="outline" className={getTypeColor(result.type)}>
                                    {result.metadata?.duration || "Video"}
                                  </Badge>
                                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                                    <Play className="w-3 h-3 mr-1" />
                                    Play
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </div>
              </div>

              {results.length === 0 && (
                <Card className="surface-panel">
                  <CardContent className="py-12 text-center">
                    <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No results found</h3>
                    <p className="text-muted-foreground mb-4">
                      Try adjusting your search query or use voice commands for better results.
                    </p>
                    <Button variant="secondary" onClick={() => setQuery("")}>
                      Clear Search
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

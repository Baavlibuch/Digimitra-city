"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"

export function LoadingScreen() {
  const [loadingText, setLoadingText] = useState("Initializing Digimitra...")
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const steps = [
      { text: "Initializing Digimitra...", duration: 800 },
      { text: "Connecting to AI networks...", duration: 600 },
      { text: "Loading surveillance protocols...", duration: 700 },
      { text: "Activating agent systems...", duration: 500 },
      { text: "Hi Officer, Digimitra is ready.", duration: 800 },
    ]

    let currentStep = 0
    let currentProgress = 0

    const interval = setInterval(() => {
      if (currentStep < steps.length) {
        setLoadingText(steps[currentStep].text)
        currentProgress += 20
        setProgress(currentProgress)
        currentStep++
      } else {
        clearInterval(interval)
      }
    }, 600)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
      <Card className="surface-elevated w-96 border-primary/15 bg-gradient-to-br from-primary/5 to-blue-500/5">
        <CardContent className="pt-8 pb-8 text-center">
          {/* Digimitra logo with animation */}
          <div className="mb-8">
            <div className="mx-auto mb-4 h-20 w-20 animate-pulse overflow-hidden rounded-2xl shadow-sm">
              <img
                src="/digimitra-logo.jpeg"
                alt="Digimitra logo"
                width={80}
                height={80}
                className="h-full w-full object-cover"
              />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Digimitra</h1>
            <p className="text-sm text-muted-foreground">AI Surveillance System</p>
          </div>

          {/* Futuristic loading animation */}
          <div className="mb-6">
            <div className="w-full bg-muted/30 rounded-full h-2 mb-4">
              <div
                className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Animated dots */}
            <div className="flex justify-center space-x-2 mb-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          </div>

          {/* Loading text with highlight for "Hi Officer" */}
          <p className="text-foreground font-medium">
            {loadingText.includes("Hi Officer") ? (
              <>
                <span className="text-blue-400 font-bold glow-blue">Hi Officer</span>
                <span>, Digimitra is ready.</span>
              </>
            ) : (
              loadingText
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

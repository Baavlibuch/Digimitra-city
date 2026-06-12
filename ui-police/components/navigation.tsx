"use client"

import { Button } from "@/components/ui/button"
import { LayoutDashboard, AlertTriangle, Monitor, Settings, LogOut, Clapperboard } from "lucide-react"

interface NavigationProps {
  activeSection: string
  onSectionChange: (section: string) => void
  onSignOut: () => void
  isSigningOut?: boolean
}

export function Navigation({ activeSection, onSectionChange, onSignOut, isSigningOut = false }: NavigationProps) {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "events", label: "Events & Alerts", icon: AlertTriangle },
    { id: "recordings", label: "Recordings", icon: Clapperboard },
    { id: "feeds", label: "Live Feeds", icon: Monitor },
    { id: "settings", label: "Settings", icon: Settings },
  ]

  return (
    <nav className="sticky top-0 z-50 border-b border-border/80 bg-card/95 shadow-[var(--shadow-panel)] backdrop-blur-sm">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 overflow-hidden rounded-xl shadow-sm">
              <img
                src="/digimitra-logo.jpeg"
                alt="Digimitra logo"
                width={40}
                height={40}
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Digimitra</h1>
              <p className="text-xs text-muted-foreground -mt-1">AI Surveillance</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant={activeSection === item.id ? "default" : "ghost"}
                size="sm"
                onClick={() => onSectionChange(item.id)}
                className="flex items-center gap-2"
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden md:inline">{item.label}</span>
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={onSignOut}
              disabled={isSigningOut}
              className="flex items-center gap-2"
            >
              {isSigningOut ? (
                <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              <span className="hidden md:inline">{isSigningOut ? "Signing Out..." : "Sign Out"}</span>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}
